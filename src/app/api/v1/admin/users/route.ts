// GET /api/v1/admin/users: who works for which organization (the admin's organizations page).
import type { StaffResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { listStaff } from "@/server/queries/organizations";

export async function GET() {
  return api<StaffResponse>(() =>
    withDb(async (db) => {
      requireRole(await getActor(db), "admin");
      return { users: await listStaff(db) };
    }),
  );
}
