// GET /api/v1/staff/activity: the same feed as GET /api/v1/admin/activity, only for the reports
// assigned to the caller's organization, and without flags (those are for admins).
//
//   ?limit=50   1 to 200
//
// Organization staff and managers only: 401 when signed out, 403 for everyone else.
import type { ActivityResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadActivity } from "@/server/queries/activity";
import { whereAssignedTo } from "@/server/queries/reports";
import { activityQuerySchema } from "@/server/schemas";

export async function GET(request: Request) {
  return api<ActivityResponse>(() =>
    withDb(async (db) => {
      const staff = requireRole(await getActor(db), "org_staff", "org_manager");
      const { limit } = parseSearchParams(activityQuerySchema, request);
      // Without a membership `whereAssignedTo` matches nothing: never fall back to "everything".
      const scope = whereAssignedTo(staff.memberships.map((m) => m.organizationId));
      return { events: await loadActivity(db, { scope, limit }) };
    }),
  );
}
