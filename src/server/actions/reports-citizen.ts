"use server";

// What a resident does: file a report, say "me too", say whether a fix worked, flag a report.
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import {
  auditEvents,
  categories,
  moderationFlags,
  reportConfirmations,
  reports,
  reportStatusEvents,
  resolutionFeedback,
  subcategories,
} from "@/db/schema";
import { makeRef } from "@/lib/domain/rules";
import { LIMITS, OPEN_STATUSES } from "@/lib/meta";
import { action } from "@/server/action";
import { getActor, requireActor } from "@/server/actor";
import { AppError, PG, pgErrorCode } from "@/server/errors";
import { attachReportPhotos } from "@/server/photos";
import { rateLimit } from "@/server/rate-limit";
import { lockReport, requestUuid } from "@/server/report-rules";
import { createReportSchema, flagSchema, meTooSchema, verdictSchema } from "@/server/schemas";

const findByRequest = async (db: Db | Tx, reporterId: string, requestId: string) =>
  (
    await db
      .select({ id: reports.id, ref: reports.ref })
      .from(reports)
      .where(and(eq(reports.reporterId, reporterId), eq(reports.clientRequestId, requestId)))
  )[0];

/**
 * Files a report. The priority is never set here: it waits for an admin's review. Sending the
 * same `clientRequestId` again (a double tap, a retry on a bad connection) returns the report
 * that already exists instead of creating a second one.
 */
export async function createReport(input: unknown) {
  return action(createReportSchema, input, async ({ db, input }) => {
    const actor = requireActor(await getActor(db));
    // A report is public the moment it is filed: the person must have been told so first.
    if (!actor.consented) throw new AppError("consent_required");
    const requestId = await requestUuid(input.clientRequestId);
    const existing = await findByRequest(db, actor.id, requestId);
    if (existing) return { report: existing };
    await rateLimit(db, actor, "report.create");

    const [sub] = await db
      .select({ id: subcategories.id, categoryId: subcategories.categoryId })
      .from(subcategories)
      .innerJoin(categories, eq(categories.id, subcategories.categoryId))
      .where(and(eq(categories.slug, input.category), eq(subcategories.slug, input.subcategory)));
    if (!sub) throw new AppError("invalid_category");

    try {
      const report = await db.transaction(async (tx) => {
        const [{ seq }] = await tx
          .select({ seq: sql<string>`nextval('report_ref_seq')`.mapWith(Number) })
          .from(sql`(select 1) as one`);
        const [created] = await tx
          .insert(reports)
          .values({
            ref: makeRef(seq, Date.now()),
            reporterId: actor.id,
            clientRequestId: requestId,
            categoryId: sub.categoryId,
            subcategoryId: sub.id,
            description: input.description,
            location: { x: input.lng, y: input.lat },
            locationAccuracyM: input.accuracyM ?? null,
            addressHint: input.addressHint,
            district: input.district,
          })
          .returning({ id: reports.id, ref: reports.ref });
        // The first line of the public timeline. It says "Citizen", never who.
        await tx.insert(reportStatusEvents).values({ reportId: created.id, fromStatus: null, toStatus: "reported", actorId: actor.id, actorKind: "citizen" });
        await attachReportPhotos(tx, actor, created.id, input.photoIds);
        return created;
      });
      return { report };
    } catch (err) {
      // The same form submitted twice at the same moment: the second insert loses, and gets the first one's report.
      if (pgErrorCode(err) === PG.uniqueViolation) {
        const winner = await findByRequest(db, actor.id, requestId);
        if (winner) return { report: winner };
      }
      throw err;
    }
  });
}

/** Adds or removes the caller's "me too". Not on your own report, and only added while it is open. */
export async function toggleMeToo(input: unknown) {
  return action(meTooSchema, input, async ({ db, input }) => {
    const actor = requireActor(await getActor(db));
    await rateLimit(db, actor, "report.me_too");
    return db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      if (report.visibility !== "visible") throw new AppError("not_found");
      if (report.reporterId === actor.id) throw new AppError("own_report");

      const mine = and(eq(reportConfirmations.reportId, report.id), eq(reportConfirmations.userId, actor.id));
      const removed = await tx.delete(reportConfirmations).where(mine).returning({ reportId: reportConfirmations.reportId });
      if (removed.length === 0) {
        if (!OPEN_STATUSES.includes(report.status)) throw new AppError("not_open");
        await tx.insert(reportConfirmations).values({ reportId: report.id, userId: actor.id });
      }
      // The count on the report changes in the same transaction as the row it counts.
      await tx
        .update(reports)
        .set({ confirmationCount: sql`${reports.confirmationCount} + ${removed.length ? -1 : 1}` })
        .where(eq(reports.id, report.id));
      return { confirmed: removed.length === 0 };
    });
  });
}

/** "Fixed" or "still broken" on a resolved report; `null` takes the answer back. Never changes the status. */
export async function setVerdict(input: unknown) {
  return action(verdictSchema, input, async ({ db, input }) => {
    const actor = requireActor(await getActor(db));
    await rateLimit(db, actor, "report.verdict");
    return db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      if (report.visibility !== "visible") throw new AppError("not_found");
      if (report.status !== "resolved") throw new AppError("not_resolved");

      // Answers belong to the latest resolution: resolving again starts a fresh round.
      const [resolution] = await tx
        .select({ id: reportStatusEvents.id })
        .from(reportStatusEvents)
        .where(and(eq(reportStatusEvents.reportId, report.id), eq(reportStatusEvents.toStatus, "resolved")))
        .orderBy(desc(reportStatusEvents.id))
        .limit(1);
      if (!resolution) throw new AppError("not_resolved");

      if (input.verdict === null) {
        await tx
          .delete(resolutionFeedback)
          .where(and(eq(resolutionFeedback.resolutionEventId, resolution.id), eq(resolutionFeedback.userId, actor.id)));
      } else {
        await tx
          .insert(resolutionFeedback)
          .values({ resolutionEventId: resolution.id, userId: actor.id, verdict: input.verdict })
          .onConflictDoUpdate({
            target: [resolutionFeedback.resolutionEventId, resolutionFeedback.userId],
            set: { verdict: input.verdict },
          });
      }
      return {};
    });
  });
}

/**
 * Reports a problem with a report to the moderators, once per person. The third open flag hides
 * the report until an admin has looked at it (`autoHidden: true`).
 */
export async function flagReport(input: unknown) {
  return action(flagSchema, input, async ({ db, input }) => {
    const actor = requireActor(await getActor(db));
    await rateLimit(db, actor, "report.flag");
    return db.transaction(async (tx) => {
      const report = await lockReport(tx, input.reportId);
      // A hidden report can't be flagged by people who can't see it.
      if (report.visibility !== "visible" && actor.role !== "admin" && report.reporterId !== actor.id) throw new AppError("not_found");

      const [already] = await tx
        .select({ id: moderationFlags.id })
        .from(moderationFlags)
        .where(and(eq(moderationFlags.reportId, report.id), eq(moderationFlags.flaggerId, actor.id)));
      if (already) throw new AppError("already_flagged");
      await tx.insert(moderationFlags).values({ reportId: report.id, flaggerId: actor.id, reason: input.reason, details: input.details || null });

      const [{ open }] = await tx
        .select({ open: count() })
        .from(moderationFlags)
        .where(and(eq(moderationFlags.reportId, report.id), eq(moderationFlags.status, "open")));
      const autoHidden = report.visibility === "visible" && open >= LIMITS.autoHideFlags;
      if (autoHidden) {
        await tx.update(reports).set({ visibility: "hidden", updatedAt: new Date() }).where(eq(reports.id, report.id));
        await tx.insert(auditEvents).values({ actorId: null, action: "report.hide", targetType: "report", targetId: report.id, metadata: { automatic: true, openFlags: open } });
      }
      return { autoHidden };
    });
  });
}
