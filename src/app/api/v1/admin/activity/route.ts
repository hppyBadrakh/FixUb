// GET /api/v1/admin/activity: what happened lately on every report, newest first: created, status
// changes, assignments, priorities, me too, flags, hiding and restoring (see
// src/server/queries/activity.ts). Nobody is identified.
//
//   ?limit=50   1 to 200
//
// Admin only: 401 when signed out, 403 for everyone else.
import type { ActivityResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadActivity } from "@/server/queries/activity";
import { activityQuerySchema } from "@/server/schemas";

export async function GET(request: Request) {
  return api<ActivityResponse>(() =>
    withDb(async (db) => {
      requireRole(await getActor(db), "admin");
      const { limit } = parseSearchParams(activityQuerySchema, request);
      return { events: await loadActivity(db, { limit, withFlags: true }) };
    }),
  );
}
