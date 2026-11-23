"use server";

// What a signed-in person does to their own account.
import { eq } from "drizzle-orm";
import * as z from "zod";
import { users } from "@/db/schema";
import { CONSENT_VERSION } from "@/lib/meta";
import { action } from "@/server/action";
import { getActor, requireActor } from "@/server/actor";
import { markAllRead } from "@/server/notifications";

const acceptTermsSchema = z.object({
  /** The version of the notice the person was shown. An old page can't accept a newer text. */
  version: z.literal(CONSENT_VERSION),
});

/**
 * Records that the person read and accepted what happens to a report (it is public, with its
 * photos and location; their name is not). Asked once, before their first report, and again
 * when CONSENT_VERSION changes.
 */
export async function acceptTerms(input: unknown) {
  return action(acceptTermsSchema, input, async ({ db, input }) => {
    const actor = requireActor(await getActor(db));
    await db.update(users).set({ consentedAt: new Date(), consentVersion: input.version }).where(eq(users.id, actor.id));
    return {};
  });
}

/** Marks all of the caller's notifications as read (they opened the bell). */
export async function markNotificationsRead(input: unknown) {
  return action(z.object({}), input, async ({ db }) => {
    const actor = requireActor(await getActor(db));
    await markAllRead(db, actor.id);
    return {};
  });
}
