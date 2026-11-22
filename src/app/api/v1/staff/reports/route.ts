// GET /api/v1/staff/reports: the queue of the signed-in staff member's organization.
// Same filters as GET /api/v1/admin/reports; `organizationId` is ignored, the organization
// always comes from the session.
//
// Organization staff and managers only: 401 when signed out, 403 for everyone else.
import type { QueueResponse } from "@/lib/api/operations-types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { parseSearchParams } from "@/server/parse";
import { listStaffQueue } from "@/server/queries/queues";
import { queueFiltersSchema } from "@/server/schemas";

export async function GET(req: Request) {
  return api<QueueResponse>(() =>
    withDb(async (db) => {
      const actor = requireRole(await getActor(db), "org_staff", "org_manager");
      // Without an organization there is nothing to show: never fall back to "everything".
      if (!actor.organizationId) throw new AppError("not_found");
      return listStaffQueue(db, actor.organizationId, parseSearchParams(queueFiltersSchema, req));
    }),
  );
}
