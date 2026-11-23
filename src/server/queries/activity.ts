import "server-only";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { auditEvents, moderationFlags, organizations, reportConfirmations, reports, reportStatusEvents } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/meta";
import type { ActivityEvent, Bi, Priority } from "@/lib/types";
import { FIXUB_TEAM, SYSTEM } from "./reports";

// The activity feed (GET /api/v1/admin/activity and /staff/activity), read from the tables where
// things are recorded, in the `ActivityEvent` shape:
//
//   report_status_events   "created" (the first event) and "status"
//   audit_events           "assigned", "prioritized", "hidden" (by an admin or automatically
//                          on the third flag), "restored", and Undo of either
//   report_confirmations   "confirmed" (me too)
//   moderation_flags       "flagged": admins only, like the flags themselves
//
// Nobody is identified: no user ids, and actors are labelled like on the public timeline
// ("Road Maintenance", "FixUB team", "System"). "Disputed" (a verdict swing) is not
// recorded anywhere yet, so it doesn't appear.

/** The audit actions that are events on a report. */
const FEED_ACTIONS = ["report.assign", "report.priority", "report.hide", "report.restore", "report.dismiss", "report.moderation_undo"];

export interface ActivityOptions {
  /** Which reports, e.g. a staff member's organization. Undefined = all, hidden ones included. */
  scope?: SQL;
  /** How many events, newest first. */
  limit: number;
  /** Include "flagged" (admins only). */
  withFlags?: boolean;
}

export async function loadActivity(db: Db | Tx, { scope, limit, withFlags = false }: ActivityOptions): Promise<ActivityEvent[]> {
  // Each source gives its newest `limit` rows; the newest `limit` of all of them are among those.
  const [orgs, statusRows, auditRows, confirmationRows, flagRows] = await Promise.all([
    db.select({ id: organizations.id, slug: organizations.slug, nameMn: organizations.nameMn, nameEn: organizations.nameEn }).from(organizations),
    db
      .select({
        id: reportStatusEvents.id,
        reportId: reportStatusEvents.reportId,
        from: reportStatusEvents.fromStatus,
        to: reportStatusEvents.toStatus,
        reason: reportStatusEvents.closureReason,
        actorKind: reportStatusEvents.actorKind,
        actorOrganizationId: reportStatusEvents.actorOrganizationId,
        at: reportStatusEvents.createdAt,
      })
      .from(reportStatusEvents)
      .innerJoin(reports, eq(reports.id, reportStatusEvents.reportId))
      .where(scope)
      .orderBy(desc(reportStatusEvents.createdAt), desc(reportStatusEvents.id))
      .limit(limit),
    db
      .select({ id: auditEvents.id, reportId: auditEvents.targetId, action: auditEvents.action, metadata: auditEvents.metadata, at: auditEvents.createdAt })
      .from(auditEvents)
      .innerJoin(reports, sql`${reports.id}::text = ${auditEvents.targetId}`)
      .where(and(scope, eq(auditEvents.targetType, "report"), inArray(auditEvents.action, FEED_ACTIONS)))
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit),
    db
      .select({ reportId: reportConfirmations.reportId, at: reportConfirmations.createdAt })
      .from(reportConfirmations)
      .innerJoin(reports, eq(reports.id, reportConfirmations.reportId))
      .where(scope)
      .orderBy(desc(reportConfirmations.createdAt))
      .limit(limit),
    withFlags
      ? db
          .select({ id: moderationFlags.id, reportId: moderationFlags.reportId, at: moderationFlags.createdAt })
          .from(moderationFlags)
          .innerJoin(reports, eq(reports.id, moderationFlags.reportId))
          .where(scope)
          .orderBy(desc(moderationFlags.createdAt))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const orgById = new Map(orgs.map((o) => [o.id, o]));

  /** The same labels as the report timeline (src/server/queries/reports.ts). */
  const actorLabel = (kind: string, organizationId: string | null): Bi => {
    if (kind === "citizen") return ROLE_LABEL.citizen;
    if (kind === "admin") return FIXUB_TEAM;
    if (kind === "system") return SYSTEM;
    const org = organizationId ? orgById.get(organizationId) : undefined;
    return org ? { mn: org.nameMn, en: org.nameEn } : ROLE_LABEL[kind as "org_staff" | "org_manager"];
  };

  const fromAudit = (a: (typeof auditRows)[number]): ActivityEvent[] => {
    const meta = a.metadata as { organizationId?: string; priority?: Priority; automatic?: boolean; visibility?: "visible" | "hidden" };
    const event = { id: `a${a.id}`, at: a.at.getTime(), reportId: a.reportId, actorLabel: FIXUB_TEAM };
    switch (a.action) {
      case "report.assign": {
        const org = meta.organizationId ? orgById.get(meta.organizationId) : undefined;
        return org ? [{ ...event, type: "assigned", organizationId: org.slug }] : []; // organization deleted since
      }
      case "report.priority":
        return [{ ...event, type: "prioritized", priority: meta.priority }];
      case "report.hide":
        return [{ ...event, type: "hidden", actorLabel: meta.automatic ? SYSTEM : FIXUB_TEAM }];
      // Dismissing the flags keeps the report shown, so it reads as "restored".
      case "report.restore":
      case "report.dismiss":
        return [{ ...event, type: "restored" }];
      case "report.moderation_undo":
        return [{ ...event, type: meta.visibility === "hidden" ? "hidden" : "restored" }];
      default:
        return [];
    }
  };

  const events: ActivityEvent[] = [
    // Audit first: when the third flag hides a report, both happen at the same moment, and the
    // stable sort below then shows "hidden" above "flagged", which reads better.
    ...auditRows.flatMap(fromAudit),
    ...flagRows.map((f): ActivityEvent => ({ id: `f${f.id}`, at: f.at.getTime(), reportId: f.reportId, type: "flagged" })),
    // A confirmation's key is (report, user): its id must not carry the user, so it is numbered.
    ...confirmationRows.map((c, i): ActivityEvent => ({ id: `c${i}-${c.reportId}`, at: c.at.getTime(), reportId: c.reportId, type: "confirmed" })),
    ...statusRows.map(
      (e): ActivityEvent =>
        e.from === null
          ? { id: `s${e.id}`, at: e.at.getTime(), reportId: e.reportId, type: "created" }
          : {
              id: `s${e.id}`,
              at: e.at.getTime(),
              reportId: e.reportId,
              type: "status",
              to: e.to,
              reason: e.reason ?? undefined,
              actorLabel: actorLabel(e.actorKind, e.actorOrganizationId),
            },
    ),
  ];
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}
