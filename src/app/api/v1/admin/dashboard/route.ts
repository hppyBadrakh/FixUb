// GET /api/v1/admin/dashboard: the numbers of the operations overview, counted in SQL with the
// definitions of src/lib/domain/metrics.ts (see src/server/queries/dashboard.ts).
//
//   ?days=1|7|30   the period of "resolved" and "median first response"; default 7
//
// Every visible report, plus the number of reports with open flags.
// Admin only: 401 when signed out, 403 for everyone else.
import type { DashboardResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadDashboard } from "@/server/queries/dashboard";
import { dashboardQuerySchema } from "@/server/schemas";

export async function GET(request: Request) {
  return api<DashboardResponse>(() =>
    withDb(async (db) => {
      requireRole(await getActor(db), "admin");
      const { days } = parseSearchParams(dashboardQuerySchema, request);
      return loadDashboard(db, { now: Date.now(), days, withFlags: true });
    }),
  );
}
