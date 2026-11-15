// GET /api/v1/me: what this server offers, and who is signed in.
// The client store calls it on load. `configured: false` means there is no database, and the
// app runs as the browser-only demo.
import { getActor, type Actor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { serverEnv } from "@/server/env";
import type { MeResponse, SessionUser } from "@/lib/api/types";

function toSessionUser(actor: Actor | null): SessionUser | null {
  if (!actor) return null;
  const membership = actor.memberships.find((m) => m.organizationId === actor.organizationId);
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
    organizationId: actor.organizationId ?? null,
    unitId: actor.unitId ?? null,
    organizationSlug: membership?.organizationSlug ?? null,
    unitSlug: membership?.unitSlug ?? null,
  };
}

export async function GET() {
  return api<MeResponse>(async () => {
    const env = serverEnv();
    if (!env.databaseUrl || !env.authSecret) {
      return { configured: false, google: false, demoLogin: false, user: null };
    }
    const user = await withDb(async (db) => toSessionUser(await getActor(db)));
    return { configured: true, google: !!env.google, demoLogin: env.demoLogin, user };
  });
}
