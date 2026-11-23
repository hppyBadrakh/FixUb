// GET /api/v1/notifications: the signed-in person's newest notifications (the bell) and how
// many are unread. Signed-in users only: 401 otherwise.
import type { NotificationsResponse } from "@/lib/api/types";
import { getActor, requireActor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { listNotifications } from "@/server/notifications";

export async function GET() {
  return api<NotificationsResponse>(() =>
    withDb(async (db) => {
      const actor = requireActor(await getActor(db));
      return listNotifications(db, actor.id);
    }),
  );
}
