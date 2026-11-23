"use server";

// Admin only: create or change an organization, its repair units and the categories it is the
// suggested owner of. Takes the `Organization` object the organizations page edits.
import { and, eq, inArray, notInArray } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, categories, organizations, organizationUnits } from "@/db/schema";
import { action } from "@/server/action";
import { getActor, requireRole } from "@/server/actor";
import { AppError, PG, pgErrorCode } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";

// Ids are slugs. The limits match the CHECK constraints in src/db/schema.ts.
const slug = z.string().regex(/^[a-z0-9-]{2,60}$/);
const name = (min: number) => z.object({ mn: z.string().trim().min(min).max(120), en: z.string().trim().min(min).max(120) });
const saveOrganizationSchema = z.object({
  organization: z.object({
    id: slug,
    name: name(2),
    units: z.array(z.object({ id: slug, name: name(1) })).max(50),
    /** Category slugs this organization is the suggested owner of. */
    categories: z.array(z.string().regex(/^[a-z0-9_-]{1,60}$/)).max(40),
    isActive: z.boolean(),
  }),
});

/**
 * Saves one organization. A category has exactly one suggested owner, so claiming one takes it
 * from whoever had it. A unit that reports or staff still belong to can't be removed (`in_use`).
 */
export async function saveOrganization(input: unknown) {
  return action(saveOrganizationSchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    const org = input.organization;
    const unitSlugs = org.units.map((u) => u.id);
    if (new Set(unitSlugs).size !== unitSlugs.length) throw new AppError("invalid_input", "Two units have the same id.");

    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(organizations)
          .values({ slug: org.id, nameMn: org.name.mn, nameEn: org.name.en, isActive: org.isActive })
          .onConflictDoUpdate({ target: organizations.slug, set: { nameMn: org.name.mn, nameEn: org.name.en, isActive: org.isActive } })
          .returning({ id: organizations.id });

        const mine = eq(organizationUnits.organizationId, row.id);
        await tx.delete(organizationUnits).where(unitSlugs.length ? and(mine, notInArray(organizationUnits.slug, unitSlugs)) : mine);
        for (const [i, unit] of org.units.entries()) {
          await tx
            .insert(organizationUnits)
            .values({ organizationId: row.id, slug: unit.id, nameMn: unit.name.mn, nameEn: unit.name.en, sortOrder: i })
            .onConflictDoUpdate({
              target: [organizationUnits.organizationId, organizationUnits.slug],
              set: { nameMn: unit.name.mn, nameEn: unit.name.en, sortOrder: i },
            });
        }

        // Give up the categories that are no longer listed, then claim the listed ones.
        const owned = eq(categories.defaultOrganizationId, row.id);
        await tx
          .update(categories)
          .set({ defaultOrganizationId: null })
          .where(org.categories.length ? and(owned, notInArray(categories.slug, org.categories)) : owned);
        if (org.categories.length) {
          await tx.update(categories).set({ defaultOrganizationId: row.id }).where(inArray(categories.slug, org.categories));
        }

        await tx.insert(auditEvents).values({
          actorId: admin.id,
          action: "organization.save",
          targetType: "organization",
          targetId: row.id,
          metadata: { slug: org.id, units: org.units.length, categories: org.categories.length },
        });
      });
    } catch (err) {
      // A removed unit still has reports assigned to it, or staff who belong to it.
      if (pgErrorCode(err) === PG.foreignKeyViolation) throw new AppError("in_use");
      throw err;
    }
    return {};
  });
}
