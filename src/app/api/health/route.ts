// GET /api/health: is the site up and can it reach its database? For uptime monitors
// (.github/workflows/monitor.yml) and for a quick look after a deploy.
//
//   200 { ok: true,  database: "ok", ms: 42 }
//   503 { ok: false, database: "unreachable" | "not configured" }
//
// Public, and deliberately says nothing else: no versions, no hosts, no error texts.
import { sql } from "drizzle-orm";
import { withDb } from "@/server/db";
import { serverEnv } from "@/server/env";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  if (!serverEnv().databaseUrl) return Response.json({ ok: false, database: "not configured" }, { status: 503, headers });
  const started = Date.now();
  try {
    await withDb((db) => db.execute(sql`select 1`));
    return Response.json({ ok: true, database: "ok", ms: Date.now() - started }, { headers });
  } catch (err) {
    console.error("[health] database check failed:", err);
    return Response.json({ ok: false, database: "unreachable" }, { status: 503, headers });
  }
}
