// Loads the demo's sample data into Postgres: the same 32 reports, organizations, units,
// categories and users that `buildSeedState()` gives the localStorage demo.
//
// It converts the demo state instead of keeping a second copy of the data, so the two can't
// drift apart. Run it with `npm run db:seed` (scripts/db/seed.ts). Node only: uses node:crypto.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { buildSeedState } from "../lib/data/seed";
import type { DemoState, StatusTimelineEvent } from "../lib/types";
import type { Db } from "./client";
import * as s from "./schema";

/** Stable UUID for a seeded row, so ids survive `db:reset` and links keep working. */
export function seedUuid(name: string): string {
  const h = createHash("sha1").update(`fixub-seed:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Demo ids ("seed-0", "org-road", "unit-road-a") → database ids. */
export const seedIds = {
  report: (demoId: string) => seedUuid(`report:${demoId}`),
  organization: (demoId: string) => seedUuid(`org:${demoId}`),
  unit: (demoId: string) => seedUuid(`unit:${demoId}`),
};

/** Seeded accounts never receive mail: `.invalid` is reserved and can't be registered. */
export const seedEmail = (userId: string) => `${userId}@demo.fixub.invalid`;

export interface SeedSummary {
  users: number;
  organizations: number;
  units: number;
  categories: number;
  subcategories: number;
  reports: number;
  statusEvents: number;
  confirmations: number;
  feedback: number;
  flags: number;
}

export async function isDatabaseEmpty(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`(select count(*) from ${s.users}) + (select count(*) from ${s.reports})`.mapWith(Number) })
    .from(sql`(select 1) as one`);
  return row.n === 0;
}

/**
 * Replaces ALL data with the sample data, in one transaction.
 * `now` anchors the reports' ages ("5 days ago"), exactly as in the demo.
 */
export async function seedDatabase(db: Db, now: number = Date.now()): Promise<SeedSummary> {
  const state: DemoState = buildSeedState(now);
  const adminId = state.users.find((u) => u.role === "admin")!.id;

  return db.transaction(async (tx) => {
    // Everything else references these tables, so CASCADE empties the whole schema.
    await tx.execute(sql`
      TRUNCATE TABLE ${s.users}, ${s.organizations}, ${s.categories}, ${s.auditEvents},
        ${s.rateLimitBuckets}, ${s.verifications}
      RESTART IDENTITY CASCADE
    `);

    /* ---- users: the 8 demo personas, plus the anonymous citizens behind the sample activity ---- */
    const backgroundIds = new Set<string>();
    for (const r of state.reports) {
      if (r.reporterId) backgroundIds.add(r.reporterId);
      for (const id of r.confirmations) backgroundIds.add(id);
      for (const f of r.feedback) backgroundIds.add(f.userId);
      for (const f of r.flags) backgroundIds.add(f.userId);
    }
    for (const u of state.users) backgroundIds.delete(u.id);
    const createdAt = new Date(now - 60 * 864e5);
    const userRows: (typeof s.users.$inferInsert)[] = [
      ...state.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: seedEmail(u.id),
        emailVerified: true,
        platformRole: u.role === "admin" ? ("admin" as const) : ("citizen" as const),
        createdAt,
        updatedAt: createdAt,
      })),
      ...[...backgroundIds].sort().map((id) => ({
        id,
        name: "Иргэн",
        email: seedEmail(id),
        emailVerified: true,
        createdAt,
        updatedAt: createdAt,
      })),
    ];
    await tx.insert(s.users).values(userRows);

    /* ---- organizations, units, members ---- */
    await tx.insert(s.organizations).values(
      state.organizations.map((o) => ({
        id: seedIds.organization(o.id),
        slug: o.id,
        nameMn: o.name.mn,
        nameEn: o.name.en,
        isActive: o.isActive,
        createdAt,
      })),
    );
    const unitRows = state.organizations.flatMap((o) =>
      o.units.map((u, i) => ({
        id: seedIds.unit(u.id),
        organizationId: seedIds.organization(o.id),
        slug: u.id,
        nameMn: u.name.mn,
        nameEn: u.name.en,
        sortOrder: i,
        createdAt,
      })),
    );
    await tx.insert(s.organizationUnits).values(unitRows);
    await tx.insert(s.organizationMembers).values(
      state.users
        .filter((u) => u.organizationId && (u.role === "org_staff" || u.role === "org_manager"))
        .map((u) => ({
          organizationId: seedIds.organization(u.organizationId!),
          userId: u.id,
          role: u.role as "org_staff" | "org_manager",
          unitId: u.unitId ? seedIds.unit(u.unitId) : null,
          createdAt,
        })),
    );

    /* ---- categories → subcategories ---- */
    const categoryRows = await tx
      .insert(s.categories)
      .values(
        state.categories.map((c, i) => {
          const owner = state.organizations.find((o) => o.categories.includes(c.id));
          return {
            slug: c.id,
            nameMn: c.name.mn,
            nameEn: c.name.en,
            icon: c.icon,
            defaultOrganizationId: owner ? seedIds.organization(owner.id) : null,
            sortOrder: i,
          };
        }),
      )
      .returning({ id: s.categories.id, slug: s.categories.slug });
    const categoryId = new Map(categoryRows.map((c) => [c.slug, c.id]));
    const subcategoryRows = await tx
      .insert(s.subcategories)
      .values(
        state.categories.flatMap((c) =>
          c.subcategories.map((sc, i) => ({
            categoryId: categoryId.get(c.id)!,
            slug: sc.id,
            nameMn: sc.name.mn,
            nameEn: sc.name.en,
            sortOrder: i,
          })),
        ),
      )
      .returning({ id: s.subcategories.id, categoryId: s.subcategories.categoryId, slug: s.subcategories.slug });
    const subcategoryId = new Map(subcategoryRows.map((x) => [`${x.categoryId}/${x.slug}`, x.id]));

    /* ---- reports ---- */
    await tx.insert(s.reports).values(
      state.reports.map((r) => {
        const catId = categoryId.get(r.category)!;
        return {
          id: seedIds.report(r.id),
          ref: r.ref,
          reporterId: r.reporterId,
          clientRequestId: seedUuid(`request:${r.id}`),
          categoryId: catId,
          subcategoryId: subcategoryId.get(`${catId}/${r.subcategory}`)!,
          priority: r.priority,
          prioritySetBy: r.priorityDecision ? adminId : null,
          prioritySetAt: r.priorityDecision ? new Date(r.priorityDecision.at) : null,
          priorityNote: r.priorityDecision?.note ?? null,
          description: r.description,
          descriptionEn: r.descriptionEn ?? null,
          location: { x: r.lng, y: r.lat },
          locationAccuracyM: r.accuracyM ?? null,
          addressHint: r.addressHint,
          addressHintEn: r.addressHintEn ?? null,
          district: r.district,
          status: r.status,
          closureReason: r.closureReason ?? null,
          duplicateOfId: r.duplicateOfId ? seedIds.report(r.duplicateOfId) : null,
          visibility: r.visibility,
          assignedOrganizationId: r.organizationId ? seedIds.organization(r.organizationId) : null,
          assignedUnitId: r.unitId ? seedIds.unit(r.unitId) : null,
          confirmationCount: r.confirmations.length,
          version: r.version,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
          statusChangedAt: new Date(r.statusChangedAt),
          resolvedAt: r.status === "resolved" ? new Date(r.statusChangedAt) : null,
        };
      }),
    );

    /* ---- timeline: status changes → report_status_events, assignments → audit_events ---- */
    const statusEvents = state.reports.flatMap((r) =>
      r.timeline
        .filter((e): e is StatusTimelineEvent => e.type === "status")
        .map((e) => ({
          reportId: seedIds.report(r.id),
          fromStatus: e.from,
          toStatus: e.to,
          closureReason: e.reason ?? null,
          // The creation event is the reporter's; staff steps are shown under the organization's name.
          actorId: e.from === null ? r.reporterId : null,
          actorKind: e.actorKind,
          actorOrganizationId:
            e.from !== null && r.organizationId ? seedIds.organization(r.organizationId) : null,
          publicNote: e.note ?? null,
          createdAt: new Date(e.at),
        })),
    );
    const insertedEvents = await tx
      .insert(s.reportStatusEvents)
      .values(statusEvents)
      .returning({ id: s.reportStatusEvents.id, reportId: s.reportStatusEvents.reportId, toStatus: s.reportStatusEvents.toStatus });
    // Citizen verdicts belong to the latest resolution of their report.
    const resolutionEventId = new Map<string, number>();
    for (const e of insertedEvents) if (e.toStatus === "resolved") resolutionEventId.set(e.reportId, e.id);

    const assignments = state.reports.flatMap((r) =>
      r.timeline
        .filter((e) => e.type === "assigned")
        .map((e) => ({
          actorId: adminId,
          action: "report.assign",
          targetType: "report",
          targetId: seedIds.report(r.id),
          metadata: {
            organizationId: seedIds.organization(e.organizationId),
            unitId: e.unitId ? seedIds.unit(e.unitId) : null,
          },
          createdAt: new Date(e.at),
        })),
    );
    if (assignments.length) await tx.insert(s.auditEvents).values(assignments);

    /* ---- citizen signals ---- */
    const confirmations = state.reports.flatMap((r) =>
      r.confirmations.map((userId, k) => ({
        reportId: seedIds.report(r.id),
        userId,
        // Spread between creation and now, so "me too" doesn't all land at the same instant.
        createdAt: new Date(r.createdAt + ((now - r.createdAt) * (k + 1)) / (r.confirmations.length + 1)),
      })),
    );
    if (confirmations.length) await tx.insert(s.reportConfirmations).values(confirmations);

    const feedback = state.reports.flatMap((r) =>
      r.feedback.map((f) => ({
        resolutionEventId: resolutionEventId.get(seedIds.report(r.id))!,
        userId: f.userId,
        verdict: f.verdict,
        createdAt: new Date(Math.min(r.statusChangedAt + 36e5, now)),
      })),
    );
    if (feedback.length) await tx.insert(s.resolutionFeedback).values(feedback);

    const flags = state.reports.flatMap((r) =>
      r.flags.map((f) => ({
        reportId: seedIds.report(r.id),
        flaggerId: f.userId,
        reason: f.reason,
        details: f.details ?? null,
        status: f.status,
        createdAt: new Date(Math.min(f.at, now)),
      })),
    );
    if (flags.length) await tx.insert(s.moderationFlags).values(flags);

    // The next new report continues the reference numbers: FX-26-04133.
    await tx.execute(sql`SELECT setval('report_ref_seq', ${state.seq})`);

    return {
      users: userRows.length,
      organizations: state.organizations.length,
      units: unitRows.length,
      categories: categoryRows.length,
      subcategories: subcategoryRows.length,
      reports: state.reports.length,
      statusEvents: statusEvents.length,
      confirmations: confirmations.length,
      feedback: feedback.length,
      flags: flags.length,
    };
  });
}
