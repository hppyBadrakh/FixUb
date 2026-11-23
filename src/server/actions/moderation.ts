"use server";

// Admin moderation: hide a report, restore it, or dismiss its flags; and Undo for each.
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, moderationFlags, reports } from "@/db/schema";
import { action } from "@/server/action";
import { getActor, requireRole } from "@/server/actor";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/rate-limit";
import { lockReport } from "@/server/report-rules";
import { idSchema } from "@/server/schemas";

const moderateSchema = z.object({
  reportId: idSchema,
  /** `hide` acts on the open flags; `restore` and `dismiss` dismiss them. */
  action: z.enum(["hide", "restore", "dismiss"]),
});

const undoSchema = z.object({
  reportId: idSchema,
  /** What moderateReport returned as `undo`. */
  visibility: z.enum(["visible", "hidden"]),
  flagIds: z.array(z.uuid()).max(100),
});

/**
 * Hides or shows a report and closes its open flags. Returns `undo`: pass it to
 * `undoModeration` to put the report and those flags back exactly as they were.
 */
export async function moderateReport(input: unknown) {
  return action(moderateSchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    return db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      const now = new Date();
      const visibility = input.action === "hide" ? "hidden" : "visible";
      await tx.update(reports).set({ visibility, updatedAt: now }).where(eq(reports.id, report.id));
      const handled = await tx
        .update(moderationFlags)
        .set({ status: input.action === "hide" ? "actioned" : "dismissed", handledBy: admin.id, handledAt: now })
        .where(and(eq(moderationFlags.reportId, report.id), eq(moderationFlags.status, "open")))
        .returning({ id: moderationFlags.id });
      await tx.insert(auditEvents).values({
        actorId: admin.id,
        action: `report.${input.action}`,
        targetType: "report",
        targetId: report.id,
        metadata: { flags: handled.length },
      });
      if (visibility !== report.visibility) {
        await notify(tx, [report.reporterId], visibility === "hidden" ? "report.hidden" : "report.restored", report.id, {}, admin.id);
      }
      return { undo: { reportId: report.id, visibility: report.visibility, flagIds: handled.map((f) => f.id) } };
    });
  });
}

/** Takes back a moderation decision: the old visibility returns and its flags are open again. */
export async function undoModeration(input: unknown) {
  return action(undoSchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    await db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      await tx.update(reports).set({ visibility: input.visibility, updatedAt: new Date() }).where(eq(reports.id, report.id));
      if (input.flagIds.length) {
        await tx
          .update(moderationFlags)
          .set({ status: "open", handledBy: null, handledAt: null })
          .where(and(eq(moderationFlags.reportId, report.id), inArray(moderationFlags.id, input.flagIds)));
      }
      await tx.insert(auditEvents).values({
        actorId: admin.id,
        action: "report.moderation_undo",
        targetType: "report",
        targetId: report.id,
        metadata: { visibility: input.visibility, flags: input.flagIds.length },
      });
    });
    return {};
  });
}
