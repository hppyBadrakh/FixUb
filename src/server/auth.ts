import "server-only";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { DEMO_USERS } from "@/lib/data/sample-users";
import { serverEnv } from "./env";
import { AppError } from "./errors";

/** The seeded personas the demo login may sign in as. Nobody else, ever. */
export const DEMO_USER_IDS: readonly string[] = DEMO_USERS.map((u) => u.id);

/**
 * Demo login: POST /api/auth/demo/sign-in { userId } signs in as a seeded persona without a
 * password. The plugin is only installed when DEMO_LOGIN=true, so otherwise the endpoint does
 * not exist (404).
 */
function demoLogin() {
  return {
    id: "fixub-demo-login",
    endpoints: {
      signInDemo: createAuthEndpoint(
        "/demo/sign-in",
        { method: "POST", body: z.object({ userId: z.string().min(1).max(64) }) },
        async (ctx) => {
          const { userId } = ctx.body;
          if (!DEMO_USER_IDS.includes(userId)) {
            throw new APIError("BAD_REQUEST", { message: "Not a demo user." });
          }
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user) {
            throw new APIError("NOT_FOUND", { message: "Demo users are missing from the database. Run `npm run db:seed`." });
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not create a session." });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ user: { id: user.id, name: user.name } });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/**
 * Builds Better Auth for one request (it needs that request's database connection).
 *
 * - Users, sessions, accounts and verifications live in our Postgres (src/db/schema.ts).
 * - Google sign-in is on when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 * - New users are citizens. `platform_role` can't be set from the client.
 */
export function createAuth(db: Db) {
  const env = serverEnv();
  if (!env.authSecret) {
    throw new AppError(
      "not_configured",
      "BETTER_AUTH_SECRET is not set, so sign-in is disabled. Generate one with `openssl rand -base64 32` (see .env.example).",
    );
  }
  return betterAuth({
    secret: env.authSecret,
    // Without BETTER_AUTH_URL, Better Auth uses the origin of the incoming request.
    baseURL: env.authUrl,
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
    socialProviders: env.google ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret } } : {},
    user: {
      additionalFields: {
        platformRole: { type: "string", required: false, defaultValue: "citizen", input: false },
      },
    },
    plugins: env.demoLogin ? [demoLogin()] : [],
    // FixUB has no password sign-in: Google, plus the demo login when enabled.
    emailAndPassword: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
