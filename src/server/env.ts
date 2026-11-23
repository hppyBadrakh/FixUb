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
    /** A demonstration deployment: sample users on the login page. Only the exact string "true" enables it. */
    demoLogin: e.DEMO_LOGIN === "true",
    /**
     * REVIEW_BEFORE_PUBLIC=true: a new report is only public once an admin has reviewed it (set
     * its priority). Until then only its reporter, admins and assigned staff see it.
     */
    reviewBeforePublic: e.REVIEW_BEFORE_PUBLIC === "true",
    /** Emails that are always admins (ADMIN_EMAILS, comma-separated), lower case. */
    adminEmails: (e.ADMIN_EMAILS ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
}

export type ServerEnv = ReturnType<typeof serverEnv>;
