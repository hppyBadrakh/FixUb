// GET /api/v1/admin/reports: the admin review queue.
//
//   ?status=reported,in_progress   comma-separated statuses
//   ?priority=critical,pending     comma-separated; "pending" = no priority yet
//   ?category=roads                category slug
//   ?organizationId=<uuid>|none    "none" = not assigned to anyone
//   ?sort=priority|oldest|newest   default priority (critical first, then oldest first)
//   ?limit=100                     1 to 200
//
// Admin only: 401 when signed out, 403 for everyone else.
import type { QueueResponse } from "@/lib/api/operations-types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { listReviewQueue } from "@/server/queries/queues";
import { queueFiltersSchema } from "@/server/schemas";

export async function GET(req: Request) {
  return api<QueueResponse>(() =>
    withDb(async (db) => {
      requireRole(await getActor(db), "admin");
      return listReviewQueue(db, parseSearchParams(queueFiltersSchema, req));
    }),
  );
}
