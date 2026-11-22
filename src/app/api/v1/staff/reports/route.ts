// GET /api/v1/staff/reports: the reports assigned to the organization the caller works for,
// with the internal note on the priority. Another organization's reports are never in it.
import type { ReportsResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { loadReports, whereAssignedTo } from "@/server/queries/reports";

export async function GET() {
  return api<ReportsResponse>(() =>
    withDb(async (db) => {
      const staff = requireRole(await getActor(db), "org_staff", "org_manager");
      return { reports: await loadReports(db, staff, whereAssignedTo(staff.memberships.map((m) => m.organizationId))) };
    }),
  );
}
