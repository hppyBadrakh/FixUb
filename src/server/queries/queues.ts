import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { categories, organizations, organizationUnits, reports, subcategories } from "@/db/schema";
import type { QueueResponse } from "@/lib/api/operations-types";
import type { PriorityLevel, QueueFilters } from "@/server/schemas";

// critical first, pending review (no priority yet) last.
const priorityRank = sql`CASE ${reports.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

function buildConditions(f: QueueFilters, scopeOrganizationId?: string): SQL[] {
  // Hidden reports belong to the moderation screen, not to the work queues.
  const conds: SQL[] = [eq(reports.visibility, "visible")];

  if (f.status?.length) conds.push(inArray(reports.status, f.status));

  if (f.priority?.length) {
    const named = f.priority.filter((p): p is PriorityLevel => p !== "pending");
    const parts: SQL[] = [];
    if (named.length) parts.push(inArray(reports.priority, named));
    if (f.priority.includes("pending")) parts.push(isNull(reports.priority));
    conds.push(or(...parts)!);
  }

  if (f.category) {
    conds.push(sql`${reports.categoryId} IN (SELECT ${categories.id} FROM ${categories} WHERE ${categories.slug} = ${f.category})`);
  }

  // A staff queue is always limited to the actor's own organization, whatever the filter says.
  if (scopeOrganizationId) conds.push(eq(reports.assignedOrganizationId, scopeOrganizationId));
  else if (f.organizationId === "none") conds.push(isNull(reports.assignedOrganizationId));
  else if (f.organizationId) conds.push(eq(reports.assignedOrganizationId, f.organizationId));

  return conds;
}

async function queryQueue(db: Db | Tx, f: QueueFilters, scopeOrganizationId?: string): Promise<QueueResponse> {
  const where = and(...buildConditions(f, scopeOrganizationId));
  const order =
    f.sort === "newest"
      ? [desc(reports.createdAt), desc(reports.id)]
      : f.sort === "oldest"
        ? [asc(reports.createdAt), asc(reports.id)]
        : [priorityRank, asc(reports.createdAt), asc(reports.id)];

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: reports.id,
        ref: reports.ref,
        category: categories.slug,
        subcategory: subcategories.slug,
        priority: reports.priority,
        description: reports.description,
        addressHint: reports.addressHint,
        district: reports.district,
        location: reports.location,
        status: reports.status,
        closureReason: reports.closureReason,
        confirmationCount: reports.confirmationCount,
        version: reports.version,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        statusChangedAt: reports.statusChangedAt,
        orgId: organizations.id,
        orgSlug: organizations.slug,
        orgNameMn: organizations.nameMn,
        orgNameEn: organizations.nameEn,
        unitId: organizationUnits.id,
        unitSlug: organizationUnits.slug,
        unitNameMn: organizationUnits.nameMn,
        unitNameEn: organizationUnits.nameEn,
      })
      .from(reports)
      .innerJoin(categories, eq(categories.id, reports.categoryId))
      .innerJoin(subcategories, eq(subcategories.id, reports.subcategoryId))
      .leftJoin(organizations, eq(organizations.id, reports.assignedOrganizationId))
      .leftJoin(organizationUnits, eq(organizationUnits.id, reports.assignedUnitId))
      .where(where)
      .orderBy(...order)
      .limit(f.limit),
    db.select({ n: count() }).from(reports).where(where),
  ]);

  return {
    total: totalRow.n,
    reports: rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      category: r.category,
      subcategory: r.subcategory,
      priority: r.priority,
      description: r.description,
      addressHint: r.addressHint ?? "",
      district: r.district,
      lng: r.location.x,
      lat: r.location.y,
      status: r.status,
      closureReason: r.closureReason,
      confirmationCount: r.confirmationCount,
      version: r.version,
      organization: r.orgId
        ? { id: r.orgId, slug: r.orgSlug!, name: { mn: r.orgNameMn!, en: r.orgNameEn! } }
        : null,
      unit: r.unitId ? { id: r.unitId, slug: r.unitSlug!, name: { mn: r.unitNameMn!, en: r.unitNameEn! } } : null,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      statusChangedAt: r.statusChangedAt.getTime(),
    })),
  };
}

/** Admin review queue: every visible report, with the filters. The route checks the actor is an admin. */
export function listReviewQueue(db: Db | Tx, filters: QueueFilters): Promise<QueueResponse> {
  return queryQueue(db, filters);
}

/** Staff queue: only reports assigned to this organization. */
export function listStaffQueue(db: Db | Tx, organizationId: string, filters: QueueFilters): Promise<QueueResponse> {
  return queryQueue(db, filters, organizationId);
}
