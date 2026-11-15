import "server-only";
import { toErrorBody } from "./errors";

/**
 * Wraps the body of a `GET /api/v1/...` route handler.
 *
 *   export async function GET() {
 *     return api(() => withDb(async (db) => ({ categories: await listCategories(db) })));
 *   }
 *
 * Success → 200 `{ data: <what the callback returned> }`.
 * AppError → its status with `{ error: { code, message } }`. Anything else → 500, logged.
 * Responses are never cached: they depend on the database and often on who is asking.
 */
export async function api<T>(fn: () => Promise<T>): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json({ data: await fn() }, { headers });
  } catch (err) {
    const { status, ...error } = toErrorBody(err);
    return Response.json({ error }, { status, headers });
  }
}
