"use server";

// What the consoles do to a report: set its priority, assign it, move it through its lifecycle.
// The lifecycle rules themselves are in src/lib/domain/lifecycle.ts, shared with the screens.
import { and, eq } from "drizzle-orm";
import { auditEvents, organizations, organizationUnits, reports, reportStatusEvents } from "@/db/schema";
import { checkTransition } from "@/lib/domain/lifecycle";
import { action } from "@/server/action";
import { getActor, requireOrgMember, requireRole } from "@/server/actor";
import { AppError } from "@/server/errors";
import { followersOf, notify, staffOf } from "@/server/notifications";
import { attachCompletionPhoto } from "@/server/photos";
import { rateLimit } from "@/server/rate-limit";
import { lockReport } from "@/server/report-rules";
import { assignSchema, changeStatusSchema, setPrioritySchema } from "@/server/schemas";

/** Admin only: set or change the official priority. The note is internal and never public. */
export async function setPriority(input: unknown) {
  return action(setPrioritySchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    await db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      const now = new Date();
      await tx
        .update(reports)
        .set({ priority: input.priority, prioritySetBy: admin.id, prioritySetAt: now, priorityNote: input.note || null, updatedAt: now })
        .where(eq(reports.id, report.id));
      await tx.insert(auditEvents).values({
        actorId: admin.id,
        action: "report.priority",
        targetType: "report",
        targetId: report.id,
        metadata: { priority: input.priority },
      });
      // The first decision is the review: the reporter learns that someone has looked at it.
      if (report.priority === null) await notify(tx, [report.reporterId], "report.reviewed", report.id, { priority: input.priority }, admin.id);
    });
    return {};
  });
}

/**
 * Admin only: hand a report to an organization and, optionally, one of its units. Both are
 * given by their slug ("org-road", "unit-road-a"), which is what the screens know them by.
 */
export async function assignReport(input: unknown) {
  return action(assignSchema, input, async ({ db, input }) => {
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");
    await db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.organizationId));
      if (!org) throw new AppError("not_found");
      let unitId: string | null = null;
      if (input.unitId) {
        const [unit] = await tx
          .select({ id: organizationUnits.id })
          .from(organizationUnits)
          .where(and(eq(organizationUnits.organizationId, org.id), eq(organizationUnits.slug, input.unitId)));
        if (!unit) throw new AppError("invalid_input", "That unit does not belong to the organization.");
        unitId = unit.id;
      }
      await tx
        .update(reports)
        .set({ assignedOrganizationId: org.id, assignedUnitId: unitId, updatedAt: new Date(), version: report.version + 1 })
        .where(eq(reports.id, report.id));
      // The assignment history, and the "assigned to …" line of the timeline, are read from here.
      await tx.insert(auditEvents).values({
        actorId: admin.id,
        action: "report.assign",
        targetType: "report",
        targetId: report.id,
        metadata: { organizationId: org.id, unitId },
      });
      // The organization's people learn they have work; the reporter learns who has it.
      await notify(tx, [...(await staffOf(tx, org.id)), report.reporterId], "report.assigned", report.id, { organizationId: input.organizationId }, admin.id);
    });
    return {};
  });
}

/**
 * Moves a report to another status. Who may make which move is decided by `checkTransition`:
 * staff of the assigned organization work a report forward, their manager closes or reopens,
 * admins can do everything. `version` is the version the screen showed: if someone else changed
 * the report since, the answer is `conflict` (409) and nothing is saved.
 */
export async function changeStatus(input: unknown) {
  return action(changeStatusSchema, input, async ({ db, input }) => {
    const actor = requireRole(await getActor(db), "org_staff", "org_manager", "admin");
    await rateLimit(db, actor, "console.write");
    await db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      // Staff of another organization get `not_found`: they must not learn the report exists.
      requireOrgMember(actor, report.organizationId);

      // The version comes before the lifecycle rules: after someone else's change the move the
      // user chose may no longer exist, and "someone else updated this" is the true answer.
      if (report.version !== input.version) throw new AppError("conflict");
      const problem = checkTransition(actor, { status: report.status, organizationId: report.organizationId ?? undefined }, input.to, input);
      if (problem) throw new AppError(problem);
      if (input.photoId && input.to !== "resolved") {
        throw new AppError("invalid_input", "A completion photo can only be added when resolving a report.");
      }

      const closing = input.to === "closed";
      const duplicateOfId = closing && input.closureReason === "duplicate" ? input.duplicateOfId! : null;
      if (duplicateOfId) {
        const target = duplicateOfId === report.id ? null : await lockReport(tx, duplicateOfId).catch(() => null);
        if (!target || target.status === "closed" || target.visibility !== "visible") throw new AppError("duplicate_required");
      }

      const now = new Date();
      const [event] = await tx
        .insert(reportStatusEvents)
        .values({
          reportId: report.id,
          fromStatus: report.status,
          toStatus: input.to,
          closureReason: closing ? input.closureReason! : null,
          actorId: actor.id,
          actorKind: actor.role,
          // The public timeline shows the organization's name, not the person's.
          actorOrganizationId: actor.role === "admin" ? null : report.organizationId,
          publicNote: input.note || null,
          createdAt: now,
        })
        .returning({ id: reportStatusEvents.id });
      await tx
        .update(reports)
        .set({
          status: input.to,
          closureReason: closing ? input.closureReason! : null,
          duplicateOfId,
          statusChangedAt: now,
          updatedAt: now,
          resolvedAt: input.to === "resolved" ? now : null,
          // A new status answers the dispute, whichever way.
          disputedAt: null,
          version: report.version + 1,
        })
        .where(eq(reports.id, report.id));
      if (input.photoId) await attachCompletionPhoto(tx, actor, { reportId: report.id, statusEventId: event.id }, input.photoId);

      // The reporter follows every step; people who said "me too" are asked when it is resolved.
      const followers = input.to === "resolved" ? await followersOf(tx, report.id) : [];
      await notify(tx, [report.reporterId, ...followers], "report.status", report.id, { to: input.to, ...(closing ? { reason: input.closureReason } : {}) }, actor.id);
    });
    return {};
  });
}
