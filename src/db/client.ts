// Database client factory. No Next.js imports here, so the CLI scripts (migrate, seed, reset)
// use exactly the same driver as the app: `@neondatabase/serverless` over WebSockets.
//
// On Cloudflare Workers a connection can't outlive the request that opened it, so a Pool is
// created per request and closed when the request ends. In the app, use `withDb()` from
// `src/server/db.ts`, which does that for you.
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;
/** The handle passed to `db.transaction(async (tx) => …)`. Query helpers should accept `Db | Tx`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface DbOptions {
  connectionString: string;
  /**
   * `host:port/path` of a Neon WebSocket proxy in front of a plain Postgres (local Docker, CI).
   * Leave empty for a real Neon database.
   */
  wsProxy?: string;
}

export interface DbHandle {
  db: Db;
  close(): Promise<void>;
}

export function createDb({ connectionString, wsProxy }: DbOptions): DbHandle {
  if (wsProxy) {
    // Plain Postgres behind `ghcr.io/neondatabase/wsproxy` (see docker-compose.yml): no TLS.
    neonConfig.wsProxy = () => wsProxy;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
  const pool = new Pool({ connectionString });
  let closing = false;
  // Without a listener, an idle-connection error would crash the Node process. Errors while
  // closing are expected on Workers ("Network connection lost" as the socket goes away).
  pool.on("error", (err: Error) => {
    if (!closing) console.error("[db] pool error:", err.message);
  });
  return {
    db: drizzle(pool, { schema }),
    close: () => {
      closing = true;
      return pool.end();
    },
  };
}

/** Reads `DATABASE_URL` / `DATABASE_WS_PROXY`. Returns null when no database is configured. */
export function dbOptionsFromEnv(env: Record<string, string | undefined> = process.env): DbOptions | null {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  return { connectionString, wsProxy: env.DATABASE_WS_PROXY?.trim() || undefined };
}

/** `user@host/database`, safe to print (no password). */
export function describeDatabase(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return `${u.username}@${u.host}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export function isLocalDatabase(connectionString: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}
