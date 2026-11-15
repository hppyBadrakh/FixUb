import "server-only";
import { createDb, type Db } from "@/db/client";
import { serverEnv } from "./env";
import { AppError } from "./errors";

export type { Db, Tx } from "@/db/client";

/**
 * Opens a database connection for one request and closes it afterwards.
 *
 *   const rows = await withDb((db) => db.select().from(reports));
 *
 * A Pool is created per call on purpose: Cloudflare Workers can't keep a connection alive
 * between requests. Call `withDb` once per route handler / server action and pass `db` down;
 * don't nest it and don't let `db` escape the callback.
 */
export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const env = serverEnv();
  if (!env.databaseUrl) {
    throw new AppError("not_configured", "DATABASE_URL is not set, so this server has no database. See .env.example.");
  }
  const { db, close } = createDb({ connectionString: env.databaseUrl, wsProxy: env.databaseWsProxy });
  try {
    return await fn(db);
  } finally {
    // Never let a failing close hide the real result or error.
    await close().catch((err: unknown) => console.error("[db] close failed:", err));
  }
}

/** Whether this deployment has a database at all. Without one the app is the browser-only demo. */
export function hasDatabase(): boolean {
  return !!serverEnv().databaseUrl;
}
