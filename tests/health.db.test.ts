// GET /api/health: what the uptime monitor reads.
import { afterEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { hasDatabase } from "./helpers/personas";

describe("health check", () => {
  const url = process.env.DATABASE_URL;
  afterEach(() => {
    if (url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = url;
  });

  it.skipIf(!hasDatabase)("says ok when the database answers", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, database: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 without a database, and gives nothing away", async () => {
    delete process.env.DATABASE_URL;
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, database: "not configured" });
  });

  it.skipIf(!hasDatabase)("answers 503 when the database can't be reached, without the reason", async () => {
    process.env.DATABASE_URL = "postgres://nobody:wrong@127.0.0.1:1/none";
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, database: "unreachable" });
  });
});
