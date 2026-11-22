// GET /api/v1/admin/reports: the admin's view of every report, hidden ones included, with what
// only admins see: the flags and the internal note on the priority.
//
//   ?status=reported,in_progress   comma-separated statuses
//   ?priority=critical,pending     comma-separated; "pending" = no priority yet
//   ?category=roads                category slug
//   ?organizationId=org-road|none  organization slug; "none" = not assigned to anyone
//   ?sort=priority|oldest|newest   default priority (critical first, then oldest first)
//   ?limit=100                     1 to 1000
//
// Admin only: 401 when signed out, 403 for everyone else.
import type { ReportsResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { queueOrder, queueWhere } from "@/server/queries/queues";
import { loadReports } from "@/server/queries/reports";
import { queueFiltersSchema } from "@/server/schemas";

export async function GET(request: Request) {
  return api<ReportsResponse>(() =>
    withDb(async (db) => {
      const admin = requireRole(await getActor(db), "admin");
      const filters = parseSearchParams(queueFiltersSchema, request);
      return { reports: await loadReports(db, admin, queueWhere(filters), { orderBy: queueOrder(filters.sort), limit: filters.limit }) };
    }),
  );
}
