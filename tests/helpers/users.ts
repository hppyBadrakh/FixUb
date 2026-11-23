// Throwaway accounts for the user-management tests: never the seeded personas, whose sessions
// the other tests rely on.
import { and, eq, like } from "drizzle-orm";
import { auditEvents, sessions, users } from "@/db/schema";
import { withDb } from "@/server/db";

const PREFIX = "test-user-";

/** Inserts an account that has "signed in" once (it has a session) and returns its id. */
export async function makeUser(name = "Тест Хэрэглэгч"): Promise<string> {
  const id = PREFIX + crypto.randomUUID().slice(0, 12);
  await withDb(async (db) => {
    await db.insert(users).values({ id, name, email: `${id}@test.fixub.invalid`, emailVerified: true });
    await db.insert(sessions).values({ id: `s-${id}`, userId: id, token: `token-${id}`, expiresAt: new Date(Date.now() + 3_600_000) });
  });
  return id;
}

/** Deletes every throwaway account (memberships and sessions go with it) and its audit trail. */
export async function cleanUpUsers(): Promise<void> {
  await withDb(async (db) => {
    await db.delete(auditEvents).where(and(eq(auditEvents.targetType, "user"), like(auditEvents.targetId, `${PREFIX}%`)));
    await db.delete(users).where(like(users.id, `${PREFIX}%`));
  });
}
