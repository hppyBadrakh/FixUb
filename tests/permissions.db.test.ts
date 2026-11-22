/// <reference types="vite/client" />
// "Wrong role is refused for every action": each server action and each /api/v1 endpoint is called
// as a visitor, a citizen, staff, a manager and an admin. Who may do what is in permission-matrix.ts.
import { afterAll, describe, expect, it } from "vitest";
import type { ActionResult } from "@/server/action";
import { as, EVERYONE, hasDatabase, ROLE_PERSONA, signOutEveryone, type Persona } from "./helpers/personas";
import { cleanUpPhotos } from "./helpers/photos";
import { cleanUpReports } from "./helpers/reports";
import { ACTIONS, ROUTES, WRITE_ROUTES, type RouteRule } from "./permission-matrix";

type Action = (input: unknown) => Promise<ActionResult>;
type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const actionModules = import.meta.glob<Record<string, unknown>>("../src/server/actions/*.ts", { eager: true });
const routeModules = import.meta.glob<Record<string, unknown>>("../src/app/api/v1/**/route.ts", { eager: true });

/** "categories/saveCategories" → the function. */
const actions = new Map<string, Action>();
for (const [file, mod] of Object.entries(actionModules)) {
  const name = file.replace(/^.*\/actions\//, "").replace(/\.ts$/, "");
  for (const [exported, value] of Object.entries(mod)) {
    if (typeof value === "function") actions.set(`${name}/${exported}`, value as Action);
  }
}

/** "reports/[id]" → its GET handler; "POST photos" → that handler. */
const routes = new Map<string, Handler>();
const writeRoutes = new Map<string, Handler>();
for (const [file, mod] of Object.entries(routeModules)) {
  const name = file.replace(/^.*\/api\/v1\//, "").replace(/\/route\.ts$/, "");
  if (typeof mod.GET === "function") routes.set(name, mod.GET as Handler);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    if (typeof mod[method] === "function") writeRoutes.set(`${method} ${name}`, mod[method] as Handler);
  }
}

const ROLE_OF = Object.fromEntries(Object.entries(ROLE_PERSONA).map(([role, persona]) => [persona, role]));
const mayCall = (allowed: readonly string[], persona: Persona) => allowed.includes(ROLE_OF[persona] ?? "nobody");

describe("the permission matrix is complete", () => {
  it("finds the server actions and endpoints", () => {
    expect(actions.size).toBeGreaterThan(0);
    expect(routes.size).toBeGreaterThan(0);
  });

  it("has a rule for every server action", () => {
    const missing = [...actions.keys()].filter((key) => !(key in ACTIONS));
    expect(missing, "Add these server actions to ACTIONS in tests/permission-matrix.ts").toEqual([]);
  });

  it("has a rule for every GET endpoint", () => {
    const missing = [...routes.keys()].filter((key) => !(key in ROUTES));
    expect(missing, "Add these endpoints to ROUTES in tests/permission-matrix.ts").toEqual([]);
  });

  it("has a rule for every endpoint that writes", () => {
    const missing = [...writeRoutes.keys()].filter((key) => !(key in WRITE_ROUTES));
    expect(missing, "Add these endpoints to WRITE_ROUTES in tests/permission-matrix.ts").toEqual([]);
  });

  it("has no rules for things that no longer exist", () => {
    expect(Object.keys(ACTIONS).filter((key) => !actions.has(key))).toEqual([]);
    expect(Object.keys(ROUTES).filter((key) => !routes.has(key))).toEqual([]);
    expect(Object.keys(WRITE_ROUTES).filter((key) => !writeRoutes.has(key))).toEqual([]);
  });
});

describe.skipIf(!hasDatabase)("server actions refuse the wrong role", () => {
  afterAll(signOutEveryone);
  afterAll(cleanUpPhotos);
  afterAll(cleanUpReports);

  for (const [key, rule] of Object.entries(ACTIONS)) {
    const run = actions.get(key);
    if (!run) continue; // reported by "no rules for things that no longer exist"

    describe(key, () => {
      for (const persona of EVERYONE) {
        const allowed = mayCall(rule.allowed, persona);
        const expected = allowed ? "allowed" : persona === "signedOut" ? "signed_out" : "forbidden";
        it(`${persona} → ${expected}`, async () => {
          const input = await rule.input(persona);
          const result = await as(persona, () => run(input));
          if (allowed) {
            expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
            rule.created?.(result);
          } else expect(result).toMatchObject({ ok: false, error: expected });
        });
      }

      for (const refusal of rule.refusals ?? []) {
        it(`${refusal.as}, ${refusal.name} → ${refusal.error}`, async () => {
          const input = await refusal.input(refusal.as);
          const result = await as(refusal.as, () => run(input));
          expect(result).toMatchObject({ ok: false, error: refusal.error });
        });
      }
    });
  }
});

describe.skipIf(!hasDatabase)("GET endpoints refuse the wrong role", () => {
  afterAll(signOutEveryone);
  afterAll(cleanUpPhotos);
  afterAll(cleanUpReports);

  for (const [key, rule] of Object.entries(ROUTES)) {
    const handler = routes.get(key);
    if (!handler) continue;

    const call = async (persona: Persona, url?: RouteRule["url"], params?: RouteRule["params"]) => {
      const path = url ? await url() : `/api/v1/${key}`;
      const routeParams = params ? await params() : {};
      const request = new Request(new URL(path, "http://localhost:3000"));
      return as(persona, () => handler(request, { params: Promise.resolve(routeParams) }));
    };

    describe(`/api/v1/${key}`, () => {
      for (const persona of EVERYONE) {
        const allowed = rule.allowed === "public" || mayCall(rule.allowed, persona);
        const expected = allowed ? 200 : persona === "signedOut" ? 401 : 403;
        it(`${persona} → ${expected}`, async () => {
          const res = await call(persona, rule.url, rule.params);
          expect(res.status).toBe(expected);
          if (allowed && rule.file) {
            expect(res.headers.get("content-type")).toBe(rule.file.contentType);
            expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
            return;
          }
          expect(res.headers.get("cache-control")).toBe("no-store");
          const body = (await res.json()) as { data?: unknown; error?: { code: string } };
          if (allowed) expect(body.data).toBeDefined();
          else expect(body.error?.code).toBe(persona === "signedOut" ? "signed_out" : "forbidden");
        });
      }

      for (const refusal of rule.refusals ?? []) {
        it(`${refusal.as}, ${refusal.name} → ${refusal.status}`, async () => {
          const res = await call(refusal.as, refusal.url, refusal.params);
          expect(res.status).toBe(refusal.status);
        });
      }
    });
  }

  it("/api/v1/me tells each persona who they are, and a visitor nothing", async () => {
    const me = routes.get("me")!;
    const read = async (persona: Persona) => {
      const res = await as(persona, () => me(new Request("http://localhost:3000/api/v1/me"), { params: Promise.resolve({}) }));
      return ((await res.json()) as { data: { user: { id: string; role: string } | null } }).data.user;
    };
    expect(await read("signedOut")).toBeNull();
    expect(await read("citizen")).toMatchObject({ role: "citizen" });
    expect(await read("roadStaff")).toMatchObject({ role: "org_staff" });
    expect(await read("admin")).toMatchObject({ role: "admin" });
  });
});

describe.skipIf(!hasDatabase)("endpoints that write refuse the wrong role", () => {
  afterAll(signOutEveryone);
  afterAll(cleanUpPhotos);

  for (const [key, rule] of Object.entries(WRITE_ROUTES)) {
    const handler = writeRoutes.get(key);
    if (!handler) continue;
    const [method, name] = key.split(" ");
    const path = `/api/v1/${name}`;

    describe(`${method} ${path}`, () => {
      for (const persona of EVERYONE) {
        const allowed = mayCall(rule.allowed, persona);
        const expected = allowed ? 200 : persona === "signedOut" ? 401 : 403;
        it(`${persona} → ${expected}`, async () => {
          const request = new Request(new URL(path, "http://localhost:3000"), await rule.request());
          const res = await as(persona, () => handler(request, { params: Promise.resolve({}) }));
          expect(res.status).toBe(expected);
          expect(res.headers.get("cache-control")).toBe("no-store");
          const body = (await res.json()) as { data?: unknown; error?: { code: string } };
          if (allowed) {
            expect(body.data).toBeDefined();
            rule.created?.(body.data);
          } else expect(body.error?.code).toBe(persona === "signedOut" ? "signed_out" : "forbidden");
        });
      }
    });
  }
});
