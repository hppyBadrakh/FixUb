"use server";

// Admin only: decide what a person may do (citizen, organization staff or manager, admin), and
// block or unblock an account. People appear in the list once they have signed in.
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, organizationMembers, organizations, organizationUnits, sessions, users } from "@/db/schema";
import { action } from "@/server/action";
import { getActor, requireRole } from "@/server/actor";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";

const userId = z.string().trim().min(1).max(64);
const slug = z.string().regex(/^[a-z0-9-]{2,60}$/);

const setAccessSchema = z.object({
  userId,
  access: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("citizen") }),
    z.object({ kind: z.literal("admin") }),
    z.object({
      kind: z.literal("staff"),
      /** Organization and unit by slug ("org-road", "unit-road-a"). */
      organizationId: slug,
      role: z.enum(["org_staff", "org_manager"]),
      unitId: slug.nullish(),
    }),
  ]),
});

const setBannedSchema = z.object({ userId, banned: z.boolean() });

const notYourself = (what: string) => new AppError("forbidden", `You can't ${what} your own account. Ask another admin.`);

/**
 * Sets everything a person may do in one go: a citizen, an admin, or staff of one organization.
 * It replaces what they had before (a user works for at most one organization). Admins can't
 * change their own access, so there is always another admin left to undo a mistake.
 */
export async function setUserAccess(input: unknown) {
  return action(setAccessSchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    if (input.userId === admin.id) throw notYourself("change the access of");
    const { access } = input;

    await db.transaction(async (tx) => {
      const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update");
      if (!target) throw new AppError("not_found");

      let membership: typeof organizationMembers.$inferInsert | null = null;
      if (access.kind === "staff") {
        const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, access.organizationId));
        if (!org) throw new AppError("not_found", "That organization does not exist.");
        let unitId: string | null = null;
        if (access.unitId) {
          const [unit] = await tx
            .select({ id: organizationUnits.id })
            .from(organizationUnits)
            .where(and(eq(organizationUnits.organizationId, org.id), eq(organizationUnits.slug, access.unitId)));
          if (!unit) throw new AppError("invalid_input", "That unit does not belong to the organization.");
          unitId = unit.id;
        }
        membership = { organizationId: org.id, userId: target.id, role: access.role, unitId };
      }

      await tx.update(users).set({ platformRole: access.kind === "admin" ? "admin" : "citizen", updatedAt: new Date() }).where(eq(users.id, target.id));
      await tx.delete(organizationMembers).where(eq(organizationMembers.userId, target.id));
      if (membership) await tx.insert(organizationMembers).values(membership);
      await tx.insert(auditEvents).values({ actorId: admin.id, action: "user.access", targetType: "user", targetId: target.id, metadata: { ...access } });
    });
    return {};
  });
}

/** Blocks an account (it is signed out everywhere and can't sign in) or lets it back in. */
export async function setUserBanned(input: unknown) {
  return action(setBannedSchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    if (input.userId === admin.id) throw notYourself("block");

    await db.transaction(async (tx) => {
      const changed = await tx
        .update(users)
        .set({ bannedAt: input.banned ? new Date() : null, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id });
      if (changed.length === 0) throw new AppError("not_found");
      // getActor() already refuses a banned account; ending its sessions makes that visible at once.
      if (input.banned) await tx.delete(sessions).where(eq(sessions.userId, input.userId));
      await tx.insert(auditEvents).values({
        actorId: admin.id,
        action: input.banned ? "user.ban" : "user.unban",
        targetType: "user",
        targetId: input.userId,
        metadata: {},
      });
    });
    return {};
  });
}
