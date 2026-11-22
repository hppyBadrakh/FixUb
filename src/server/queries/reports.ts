import "server-only";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import {
  auditEvents,
  categories,
  moderationFlags,
  organizations,
  organizationUnits,
  reportConfirmations,
  reportImages,
  reports,
  reportStatusEvents,
  resolutionFeedback,
  subcategories,
  users,
} from "@/db/schema";
import { ROLE_LABEL } from "@/lib/meta";
import type { Bi, Flag, Report, TimelineEvent } from "@/lib/types";
import type { Actor } from "@/server/actor";

// Reports as the screens read them: the demo's `Report` shape (src/lib/types.ts), built for one
// viewer. What a viewer must not learn is left out here, on the server:
//
// - Other people are never identified. `reporterId` is the viewer's own id or null;
//   `confirmations` and `feedback` hold the viewer's id for their own entry and ANONYMOUS for
//   everyone else's, so counts and "did I already…" both work.
// - `priorityDecision` (who decided, the internal note) is only for admins and the staff of the
//   organization the report is assigned to.
// - `flags` are only for admins.
//
// Organizations and units are identified by their slug ("org-road"), categories too ("roads").

/** Stands for "somebody else" wherever the demo data had another user's id. */
export const ANONYMOUS = "";

const FIXUB_TEAM: Bi = { mn: "FixUB баг", en: "FixUB team" };
const SYSTEM: Bi = { mn: "Систем", en: "System" };

/** The newest reports first; lists are capped so one request can't read the whole table forever. */
const MAX_REPORTS = 1000;

export const whereVisible = eq(reports.visibility, "visible");

/** Reports inside a map viewport (west, south, east, north), using the PostGIS index. */
export function whereInBox([west, south, east, north]: readonly [number, number, number, number]): SQL {
  return sql`${reports.location} && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)`;
}

export function whereCategory(slug: string): SQL {
  return inArray(reports.categoryId, sql`(select ${categories.id} from ${categories} where ${categories.slug} = ${slug})`);
}

/**
 * Loads the reports matching `where`, each with its photos, timeline and citizen signals, as
 * `viewer` may see them. `where` decides WHICH reports (the caller's permission rule); this
 * function decides how much of each one is shown.
 */
export async function loadReports(db: Db | Tx, viewer: Actor | null, where: SQL | undefined): Promise<Report[]> {
  const rows = await db
    .select({
      id: reports.id,
      ref: reports.ref,
      category: categories.slug,
      subcategory: subcategories.slug,
      priority: reports.priority,
      prioritySetAt: reports.prioritySetAt,
      priorityNote: reports.priorityNote,
      prioritySetByName: users.name,
      description: reports.description,
      descriptionEn: reports.descriptionEn,
      location: reports.location,
      accuracyM: reports.locationAccuracyM,
      addressHint: reports.addressHint,
      addressHintEn: reports.addressHintEn,
      district: reports.district,
      status: reports.status,
      closureReason: reports.closureReason,
      duplicateOfId: reports.duplicateOfId,
      visibility: reports.visibility,
      organizationId: reports.assignedOrganizationId,
      unitId: reports.assignedUnitId,
      reporterId: reports.reporterId,
      confirmationCount: reports.confirmationCount,
      version: reports.version,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
      statusChangedAt: reports.statusChangedAt,
    })
    .from(reports)
    .innerJoin(categories, eq(categories.id, reports.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, reports.subcategoryId))
    .leftJoin(users, eq(users.id, reports.prioritySetBy))
    .where(where)
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(MAX_REPORTS);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const isAdmin = viewer?.role === "admin";
  const none = Promise.resolve([]);

  const [orgs, units, events, images, assignments, myConfirmations, flags] = await Promise.all([
    db.select({ id: organizations.id, slug: organizations.slug, nameMn: organizations.nameMn, nameEn: organizations.nameEn }).from(organizations),
    db.select({ id: organizationUnits.id, slug: organizationUnits.slug }).from(organizationUnits),
    db.select().from(reportStatusEvents).where(inArray(reportStatusEvents.reportId, ids)).orderBy(asc(reportStatusEvents.id)),
    db
      .select({ id: reportImages.id, reportId: reportImages.reportId, statusEventId: reportImages.statusEventId })
      .from(reportImages)
      .where(inArray(reportImages.reportId, ids))
      .orderBy(asc(reportImages.position)),
    db
      .select({ id: auditEvents.id, targetId: auditEvents.targetId, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "report.assign"), eq(auditEvents.targetType, "report"), inArray(auditEvents.targetId, ids)))
      .orderBy(asc(auditEvents.id)),
    viewer
      ? db
          .select({ reportId: reportConfirmations.reportId })
          .from(reportConfirmations)
          .where(and(eq(reportConfirmations.userId, viewer.id), inArray(reportConfirmations.reportId, ids)))
      : none,
    isAdmin ? db.select().from(moderationFlags).where(inArray(moderationFlags.reportId, ids)).orderBy(asc(moderationFlags.createdAt)) : none,
  ]);

  // Verdicts belong to the latest resolution of a report that is resolved right now.
  const resolutionOf = new Map<string, number>();
  for (const e of events) if (e.toStatus === "resolved") resolutionOf.set(e.reportId, e.id);
  const resolved = new Set(rows.filter((r) => r.status === "resolved").map((r) => r.id));
  const resolutionIds = [...resolutionOf].filter(([reportId]) => resolved.has(reportId)).map(([, eventId]) => eventId);
  const feedback = resolutionIds.length
    ? await db.select().from(resolutionFeedback).where(inArray(resolutionFeedback.resolutionEventId, resolutionIds))
    : [];

  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const unitSlug = new Map(units.map((u) => [u.id, u.slug]));
  const confirmed = new Set(myConfirmations.map((c) => c.reportId));
  const completionPhoto = new Map(images.filter((i) => i.statusEventId !== null).map((i) => [i.statusEventId!, i.id]));
  const someone = (userId: string | null) => (viewer && userId === viewer.id ? viewer.id : ANONYMOUS);

  const actorLabel = (kind: string, organizationId: string | null): Bi => {
    if (kind === "citizen") return ROLE_LABEL.citizen;
    if (kind === "admin") return FIXUB_TEAM;
    if (kind === "system") return SYSTEM;
    const org = organizationId ? orgById.get(organizationId) : undefined;
    return org ? { mn: org.nameMn, en: org.nameEn } : ROLE_LABEL[kind as "org_staff" | "org_manager"];
  };

  return rows.map((r): Report => {
    const mine = !!viewer && r.reporterId === viewer.id;
    const internal = isAdmin || (!!viewer && !!r.organizationId && viewer.memberships.some((m) => m.organizationId === r.organizationId));

    const timeline: TimelineEvent[] = [
      ...events
        .filter((e) => e.reportId === r.id)
        .map((e): TimelineEvent => ({
          id: `s${e.id}`,
          type: "status",
          at: e.createdAt.getTime(),
          from: e.fromStatus,
          to: e.toStatus,
          reason: e.closureReason ?? undefined,
          note: e.publicNote ?? undefined,
          photoId: completionPhoto.get(e.id),
          actorKind: e.actorKind,
          actorLabel: actorLabel(e.actorKind, e.actorOrganizationId),
        })),
      ...assignments
        .filter((a) => a.targetId === r.id)
        .flatMap((a): TimelineEvent[] => {
          const meta = a.metadata as { organizationId?: string; unitId?: string | null };
          const org = meta.organizationId ? orgById.get(meta.organizationId) : undefined;
          if (!org) return []; // the organization was deleted since
          return [
            {
              id: `a${a.id}`,
              type: "assigned",
              at: a.createdAt.getTime(),
              organizationId: org.slug,
              unitId: meta.unitId ? unitSlug.get(meta.unitId) : undefined,
              actorKind: "admin",
              actorLabel: FIXUB_TEAM,
            },
          ];
        }),
    ].sort((a, b) => a.at - b.at);

    const verdicts = resolved.has(r.id) ? feedback.filter((f) => f.resolutionEventId === resolutionOf.get(r.id)) : [];
    const others = Math.max(0, r.confirmationCount - (confirmed.has(r.id) ? 1 : 0));

    return {
      id: r.id,
      ref: r.ref,
      category: r.category,
      subcategory: r.subcategory,
      priority: r.priority,
      priorityDecision:
        internal && r.prioritySetAt
          ? { by: r.prioritySetByName ?? "", at: r.prioritySetAt.getTime(), note: r.priorityNote ?? undefined }
          : undefined,
      description: r.description,
      descriptionEn: r.descriptionEn ?? undefined,
      addressHint: r.addressHint ?? "",
      addressHintEn: r.addressHintEn ?? undefined,
      district: r.district,
      lng: r.location.x,
      lat: r.location.y,
      accuracyM: r.accuracyM ?? undefined,
      status: r.status,
      closureReason: r.closureReason ?? undefined,
      duplicateOfId: r.duplicateOfId ?? undefined,
      visibility: r.visibility,
      organizationId: r.organizationId ? orgById.get(r.organizationId)?.slug : undefined,
      unitId: r.unitId ? unitSlug.get(r.unitId) : undefined,
      reporterId: mine ? viewer.id : null,
      photoIds: images.filter((i) => i.reportId === r.id && i.statusEventId === null).map((i) => i.id),
      confirmations: [...(confirmed.has(r.id) ? [viewer!.id] : []), ...new Array<string>(others).fill(ANONYMOUS)],
      feedback: verdicts.map((f) => ({ userId: someone(f.userId), verdict: f.verdict })),
      flags: flags
        .filter((f) => f.reportId === r.id)
        .map((f): Flag => ({
          id: f.id,
          userId: someone(f.flaggerId),
          reason: f.reason,
          details: f.details ?? undefined,
          at: f.createdAt.getTime(),
          status: f.status,
        })),
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      statusChangedAt: r.statusChangedAt.getTime(),
      version: r.version,
      timeline,
    };
  });
}

/**
 * One report, if this viewer may open it: a visible report is public; a hidden one is only for
 * its reporter, admins and the staff of the organization it is assigned to. Otherwise null,
 * and the caller answers `not_found`.
 */
export async function loadReport(db: Db | Tx, viewer: Actor | null, id: string): Promise<Report | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({ visibility: reports.visibility, reporterId: reports.reporterId, organizationId: reports.assignedOrganizationId })
    .from(reports)
    .where(eq(reports.id, id));
  if (!row) return null;
  const allowed =
    row.visibility === "visible" ||
    (!!viewer &&
      (viewer.role === "admin" ||
        row.reporterId === viewer.id ||
        (!!row.organizationId && viewer.memberships.some((m) => m.organizationId === row.organizationId))));
  if (!allowed) return null;
  const [report] = await loadReports(db, viewer, eq(reports.id, id));
  return report ?? null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reports that a signed-in person filed themselves, hidden ones included. */
export const whereReportedBy = (userId: string) => eq(reports.reporterId, userId);

/** Reports assigned to any of these organizations (a staff member's queue). */
export const whereAssignedTo = (organizationIds: string[]) =>
  organizationIds.length ? inArray(reports.assignedOrganizationId, organizationIds) : sql`false`;
