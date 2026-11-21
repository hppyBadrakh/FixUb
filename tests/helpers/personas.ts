// Run code "as" a seeded persona. Signing in goes through the real demo-login endpoint, so a
// test exercises the whole chain: session cookie → Better Auth → roles from the database.
import { inArray } from "drizzle-orm";
import { sessions } from "@/db/schema";
import type { Role } from "@/lib/types";
import { createAuth } from "@/server/auth";
import { withDb } from "@/server/db";
import { serverEnv } from "@/server/env";
import { setRequestCookie } from "./request";

/** Seeded users (src/lib/data/seed.ts). `null` is a visitor who isn't signed in. */
export const PERSONAS = {
  signedOut: null,
  citizen: "u-citizen",
  otherCitizen: "u-citizen-2",
  admin: "u-admin",
  roadStaff: "u-road-staff",
  roadManager: "u-road-mgr",
  /** Staff of a different organization than roadStaff / roadManager. */
  lightStaff: "u-light-staff",
} as const;
export type Persona = keyof typeof PERSONAS;

/** One persona per role, plus the signed-out visitor: the columns of the permission matrix. */
export const ROLE_PERSONA: Record<Role, Persona> = {
  citizen: "citizen",
  org_staff: "roadStaff",
  org_manager: "roadManager",
  admin: "admin",
};
export const EVERYONE: Persona[] = ["signedOut", "citizen", "roadStaff", "roadManager", "admin"];

/** Without a database (and the demo login) these tests can't run; they are skipped locally. */
export const hasDatabase = !!process.env.DATABASE_URL?.trim();

const cookies = new Map<string, string>();

async function signIn(userId: string): Promise<string> {
  const base = serverEnv().authUrl ?? "http://localhost:3000";
  const res = await withDb((db) =>
    createAuth(db).handler(
      new Request(`${base}/api/auth/demo/sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ userId }),
      }),
    ),
  );
  if (!res.ok) {
    throw new Error(
      `Demo sign-in as ${userId} failed (${res.status}): ${await res.text()}\n` +
        "The tests need DEMO_LOGIN=true and a seeded database (npm run db:seed).",
    );
  }
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`Demo sign-in as ${userId} set no cookie.`);
  return cookie;
}

/** The Cookie header of a signed-in persona (`null` for signedOut). Sessions are reused. */
export async function cookieOf(persona: Persona): Promise<string | null> {
  const userId = PERSONAS[persona];
  if (!userId) return null;
  let cookie = cookies.get(userId);
  if (!cookie) cookies.set(userId, (cookie = await signIn(userId)));
  return cookie;
}

/** Runs `fn` as if the request came from this persona's browser. */
export async function as<T>(persona: Persona, fn: () => Promise<T>): Promise<T> {
  setRequestCookie(await cookieOf(persona));
  try {
    return await fn();
  } finally {
    setRequestCookie(null);
  }
}

/** Runs `fn` with an arbitrary Cookie header (forged or expired sessions). */
export async function withCookie<T>(cookie: string, fn: () => Promise<T>): Promise<T> {
  setRequestCookie(cookie);
  try {
    return await fn();
  } finally {
    setRequestCookie(null);
  }
}

/** Deletes the sessions these tests created. Call it in `afterAll`. */
export async function signOutEveryone(): Promise<void> {
  // Cookie value: "<name>=<token>.<signature>", URL-encoded.
  const tokens = [...cookies.values()].flatMap((cookie) =>
    cookie.split("; ").map((pair) => decodeURIComponent(pair.slice(pair.indexOf("=") + 1)).split(".")[0]),
  );
  cookies.clear();
  if (tokens.length) await withDb((db) => db.delete(sessions).where(inArray(sessions.token, tokens)));
}
