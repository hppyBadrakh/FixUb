// GET /api/v1/admin/reports: every report, hidden ones included, with what only admins see:
// the flags and the internal note on the priority.
import type { ReportsResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { loadReports } from "@/server/queries/reports";

export async function GET() {
  return api<ReportsResponse>(() =>
    withDb(async (db) => {
      const admin = requireRole(await getActor(db), "admin");
      return { reports: await loadReports(db, admin, undefined) };
    }),
  );
}
