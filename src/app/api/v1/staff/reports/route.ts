// GET /api/v1/staff/reports: the queue of the organization the caller works for, with the
// internal note on the priority. Same filters as GET /api/v1/admin/reports, except that
// `organizationId` is ignored: the organization always comes from the session, so another
// organization's reports are never in the answer.
//
// Organization staff and managers only: 401 when signed out, 403 for everyone else.
import type { ReportsResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { queueOrder, queueWhere } from "@/server/queries/queues";
import { loadReports, whereAssignedTo } from "@/server/queries/reports";
import { queueFiltersSchema } from "@/server/schemas";

export async function GET(request: Request) {
  return api<ReportsResponse>(() =>
    withDb(async (db) => {
      const staff = requireRole(await getActor(db), "org_staff", "org_manager");
      const filters = parseSearchParams(queueFiltersSchema, request);
      // Without a membership `whereAssignedTo` matches nothing: never fall back to "everything".
      const mine = whereAssignedTo(staff.memberships.map((m) => m.organizationId));
      return { reports: await loadReports(db, staff, queueWhere(filters, mine), { orderBy: queueOrder(filters.sort), limit: filters.limit }) };
    }),
  );
}
