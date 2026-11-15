import "server-only";

/**
 * Server configuration, read from environment variables at call time (never at module scope):
 * on Cloudflare Workers the values only exist while a request is being handled.
 * Every variable is documented in `.env.example`.
 */
export function serverEnv() {
  const e = process.env;
  const value = (v: string | undefined) => v?.trim() || undefined;
  const googleClientId = value(e.GOOGLE_CLIENT_ID);
  const googleClientSecret = value(e.GOOGLE_CLIENT_SECRET);
  return {
    databaseUrl: value(e.DATABASE_URL),
    databaseWsProxy: value(e.DATABASE_WS_PROXY),
    authSecret: value(e.BETTER_AUTH_SECRET),
    authUrl: value(e.BETTER_AUTH_URL)?.replace(/\/+$/, ""),
    google: googleClientId && googleClientSecret ? { clientId: googleClientId, clientSecret: googleClientSecret } : null,
    /** The demo role picker. Only the exact string "true" enables it. */
    demoLogin: e.DEMO_LOGIN === "true",
  };
}

export type ServerEnv = ReturnType<typeof serverEnv>;
