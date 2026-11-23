import "server-only";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { notifications, organizationMembers, reportConfirmations, reports, users } from "@/db/schema";
import type { AppNotification, NotificationsResponse, NotificationType } from "@/lib/api/types";
import { serverEnv } from "./env";

// In-app notifications (the bell). An action calls `notify` inside its transaction, so a
// notification exists exactly when the change it reports was saved.
//
//   await notify(tx, [report.reporterId], "report.status", report.id, { to: "resolved" }, actor.id);
//
// A notification never names a person: it says what happened to which report.

/**
 * Tells these people. Duplicates and `null` (a reporter whose account is gone) are dropped, and
 * so is `except`: nobody is notified about what they just did themselves.
 */
export async function notify(
  tx: Db | Tx,
  recipients: readonly (string | null | undefined)[],
  type: NotificationType,
  reportId: string,
  data: Record<string, unknown> = {},
  except?: string,
): Promise<void> {
  const userIds = [...new Set(recipients.filter((id): id is string => !!id && id !== except))];
  if (userIds.length === 0) return;
  await tx.insert(notifications).values(userIds.map((userId) => ({ userId, type, reportId, data })));
}

/** The people who work for an organization (optionally only its managers). */
export async function staffOf(tx: Db | Tx, organizationId: string | null, only?: "managers"): Promise<string[]> {
  if (!organizationId) return [];
  const rows = await tx
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(eq(organizationMembers.organizationId, organizationId), only === "managers" ? eq(organizationMembers.role, "org_manager") : undefined),
    );
  return rows.map((r) => r.userId);
}

/** Every admin: by role, and the ADMIN_EMAILS accounts. */
export async function adminIds(tx: Db | Tx): Promise<string[]> {
  const emails = serverEnv().adminEmails;
  const rows = await tx
    .select({ id: users.id, email: users.email, emailVerified: users.emailVerified, platformRole: users.platformRole })
    .from(users)
    .where(or(eq(users.platformRole, "admin"), emails.length ? inArray(users.email, emails) : undefined));
  return rows.filter((u) => u.platformRole === "admin" || u.emailVerified).map((u) => u.id);
}

/** The people who said "me too" on a report. */
export async function followersOf(tx: Db | Tx, reportId: string): Promise<string[]> {
  const rows = await tx.select({ userId: reportConfirmations.userId }).from(reportConfirmations).where(eq(reportConfirmations.reportId, reportId));
  return rows.map((r) => r.userId);
}

/** The newest notifications of one person, and how many they haven't read. */
export async function listNotifications(db: Db | Tx, userId: string, limit = 30): Promise<NotificationsResponse> {
  const mine = eq(notifications.userId, userId);
  const [rows, [{ unread }]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        reportId: notifications.reportId,
        reportRef: reports.ref,
        reporterId: reports.reporterId,
        data: notifications.data,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(reports, eq(reports.id, notifications.reportId))
      .where(mine)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit),
    db.select({ unread: count() }).from(notifications).where(and(mine, isNull(notifications.readAt))),
  ]);
  return {
    unread,
    notifications: rows.map(
      (n): AppNotification => ({
        id: n.id,
        type: n.type as NotificationType,
        reportId: n.reportId,
        reportRef: n.reportRef,
        ownReport: n.reporterId === userId,
        data: n.data,
        read: n.readAt !== null,
        createdAt: n.createdAt.getTime(),
      }),
    ),
  };
}

/** Marks everything this person has as read. */
export async function markAllRead(db: Db | Tx, userId: string): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
