// GET /api/v1/organizations: organizations, their units and the categories they own. Public:
// the names are shown on report timelines, and the report form needs none of it hidden.
import type { OrganizationsResponse } from "@/lib/api/types";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { listOrganizations } from "@/server/queries/organizations";

export async function GET() {
  return api<OrganizationsResponse>(() => withDb(async (db) => ({ organizations: await listOrganizations(db) })));
}
