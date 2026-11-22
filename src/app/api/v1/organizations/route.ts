// GET /api/v1/organizations: organizations with their units and routed categories.
// For admins and organization staff (assignment pickers, the organizations page).
// The category tree is a separate endpoint: GET /api/v1/categories.
import type { OrganizationsResponse } from "@/lib/api/operations-types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { listOrganizations } from "@/server/queries/organizations";

export async function GET() {
  return api<OrganizationsResponse>(() =>
    withDb(async (db) => {
      requireRole(await getActor(db), "admin", "org_staff", "org_manager");
      return { organizations: await listOrganizations(db) };
    }),
  );
}
