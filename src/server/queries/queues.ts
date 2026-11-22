import "server-only";
import { and, asc, desc, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { organizations, reports } from "@/db/schema";
import type { PriorityLevel, QueueFilters } from "@/server/schemas";
import { whereCategory } from "./reports";

// Filters and sorting of the work queues (GET /api/v1/admin/reports and /staff/reports): the
// query string, already checked by `queueFiltersSchema`, turned into SQL. The rows themselves
// are loaded by `loadReports` (./reports.ts), which also decides how much of each one is shown.

// critical first, pending review (no priority yet) last.
const priorityRank = sql`CASE ${reports.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

/**
 * Which reports a queue shows. `scope` is the caller's permission rule (a staff member's own
 * organization): it always applies, whatever the filters say, and the `organizationId` filter
 * is then ignored.
 */
export function queueWhere(f: QueueFilters, scope?: SQL): SQL | undefined {
  const conds: (SQL | undefined)[] = [scope];

  if (f.status?.length) conds.push(inArray(reports.status, f.status));

  if (f.priority?.length) {
    const named = f.priority.filter((p): p is PriorityLevel => p !== "pending");
    const parts: SQL[] = [];
    if (named.length) parts.push(inArray(reports.priority, named));
    if (f.priority.includes("pending")) parts.push(isNull(reports.priority));
    conds.push(or(...parts));
  }

  if (f.category) conds.push(whereCategory(f.category));

  if (!scope) {
    if (f.organizationId === "none") conds.push(isNull(reports.assignedOrganizationId));
    else if (f.organizationId) {
      conds.push(
        inArray(reports.assignedOrganizationId, sql`(select ${organizations.id} from ${organizations} where ${organizations.slug} = ${f.organizationId})`),
      );
    }
  }
  return and(...conds);
}

/** `priority` (the default): most urgent first, then the oldest first. */
export function queueOrder(sort: QueueFilters["sort"]): SQL[] {
  if (sort === "newest") return [desc(reports.createdAt), desc(reports.id)];
  if (sort === "oldest") return [asc(reports.createdAt), asc(reports.id)];
  return [priorityRank, asc(reports.createdAt), asc(reports.id)];
}
