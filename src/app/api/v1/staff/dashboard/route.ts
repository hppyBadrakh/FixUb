// GET /api/v1/staff/dashboard: the same numbers as GET /api/v1/admin/dashboard, counted only over
// the reports assigned to the caller's organization (the KPI cards of the staff queue). No
// flag count: flags are for admins.
//
//   ?days=1|7|30   default 7
//
// Organization staff and managers only: 401 when signed out, 403 for everyone else.
import type { DashboardResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadDashboard } from "@/server/queries/dashboard";
import { whereAssignedTo } from "@/server/queries/reports";
import { dashboardQuerySchema } from "@/server/schemas";

export async function GET(request: Request) {
  return api<DashboardResponse>(() =>
    withDb(async (db) => {
      const staff = requireRole(await getActor(db), "org_staff", "org_manager");
      const { days } = parseSearchParams(dashboardQuerySchema, request);
      // Without a membership `whereAssignedTo` matches nothing: never fall back to "everything".
      const scope = whereAssignedTo(staff.memberships.map((m) => m.organizationId));
      return loadDashboard(db, { scope, now: Date.now(), days });
    }),
  );
}
