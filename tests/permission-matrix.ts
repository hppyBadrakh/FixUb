// WHO MAY CALL WHAT. Every server action and every /api/v1 endpoint must have a line here:
// `npm test` fails when one is missing, and then checks that everyone else is refused.
//
// Adding a server action or an endpoint? Add its rule in the same pull request.
import type { Role } from "@/lib/types";
import type { ErrorCode } from "@/server/errors";
import { eq } from "drizzle-orm";
import { moderationFlags, reports } from "@/db/schema";
import { withDb } from "@/server/db";
import { listCategories } from "@/server/queries/categories";
import { listOrganizations } from "@/server/queries/organizations";
import { PERSONAS, type Persona } from "./helpers/personas";
import { jpeg, publicPhoto, rememberPhoto, uploadedBy } from "./helpers/photos";
import { makeReport, newReportInput, rememberReport, type FixtureOptions } from "./helpers/reports";

type Lazy<T> = () => T | Promise<T>;
/** Built for the persona who is about to call (a photo, for example, must be their own upload). */
type InputFor = (persona: Persona) => unknown | Promise<unknown>;

export interface ActionRule {
  /** Roles that may call the action. Every other role gets `forbidden`, a visitor `signed_out`. */
  allowed: Role[];
  /**
   * An input that passes the action's Zod schema (so a refusal comes from the permission check)
   * and is safe to run again and again: allowed roles really execute it against the test database.
   * Work on a report from `makeReport()`, never on a seeded one.
   */
  input: InputFor;
  /** Cases that depend on the data, not just the role: another organization's report, your own report… */
  refusals?: { name: string; as: Persona; input: InputFor; error: ErrorCode }[];
  /** Called with the result of each allowed call, to clean up what it created. */
  created?: (result: unknown) => void;
}

export interface RouteRule {
  /** "public", or the roles that may read it (a visitor gets 401, every other role 403). */
  allowed: "public" | Role[];
  /** Path and query, with real ids for a route like `/reports/[id]`. Defaults to the route's own path. */
  url?: Lazy<string>;
  /** The values of the route's `[params]`. */
  params?: Lazy<Record<string, string>>;
  /** For example staff reading another organization's report: 404. */
  refusals?: { name: string; as: Persona; url: Lazy<string>; params?: Lazy<Record<string, string>>; status: number }[];
  /** The endpoint answers with a file (a photo), not with JSON `{ data }`. */
  file?: { contentType: string };
}

/** POST / PUT / PATCH / DELETE route handlers. Most writes are server actions; uploads are not. */
export interface WriteRouteRule {
  /** Roles that may call it. A visitor gets 401, every other role 403. */
  allowed: Role[];
  /** A request that passes validation, so a refusal comes from the permission check. */
  request: Lazy<RequestInit>;
  /** Called with the `data` of each allowed call, to clean up what it created. */
  created?: (data: unknown) => void;
}

const ANY_ROLE: Role[] = ["citizen", "org_staff", "org_manager", "admin"];

/** The category tree as it is now: saving it again changes nothing. */
async function currentCategoryTree() {
  const categories = await withDb(listCategories);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      subcategories: c.subcategories.map((sc) => ({ id: sc.id, name: sc.name })),
    })),
  };
}

/** `{ reportId }` of a fresh fixture report, plus the rest of the input. */
const onReport =
  (options: FixtureOptions, rest: object = {}): InputFor =>
  async () => ({ reportId: await makeReport(options), ...rest });

const ROAD = { org: "org-road" } as const;

/** Key: `<file in src/server/actions>/<exported function>`. */
export const ACTIONS: Record<string, ActionRule> = {
  "categories/saveCategories": { allowed: ["admin"], input: currentCategoryTree },

  /* ---- citizen side: any signed-in user ---- */
  "reports-citizen/createReport": {
    allowed: ANY_ROLE,
    input: newReportInput,
    created: (result) => rememberReport((result as { report: { id: string } }).report.id),
    refusals: [
      { name: "a photo someone else uploaded", as: "citizen", input: () => newReportInput("otherCitizen"), error: "invalid_input" },
      { name: "a category that doesn't exist", as: "citizen", input: async () => ({ ...(await newReportInput("citizen")), subcategory: "no-such-thing" }), error: "invalid_category" },
    ],
  },
  "reports-citizen/toggleMeToo": {
    allowed: ANY_ROLE,
    input: onReport({}),
    refusals: [
      { name: "your own report", as: "citizen", input: onReport({ reporter: "citizen" }), error: "own_report" },
      { name: "a report that is already resolved", as: "citizen", input: onReport({ status: "resolved" }), error: "not_open" },
      { name: "a hidden report", as: "citizen", input: onReport({ hidden: true }), error: "not_found" },
    ],
  },
  "reports-citizen/setVerdict": {
    allowed: ANY_ROLE,
    input: onReport({ status: "resolved" }, { verdict: "fixed" }),
    refusals: [{ name: "a report that isn't resolved", as: "citizen", input: onReport({}, { verdict: "fixed" }), error: "not_resolved" }],
  },
  "reports-citizen/flagReport": {
    allowed: ANY_ROLE,
    input: onReport({}, { reason: "spam", details: "" }),
    refusals: [
      {
        name: "a report you already flagged",
        as: "citizen",
        input: async () => {
          const reportId = await makeReport();
          await withDb((db) => db.insert(moderationFlags).values({ reportId, flaggerId: PERSONAS.citizen, reason: "spam" }));
          return { reportId, reason: "other", details: "" };
        },
        error: "already_flagged",
      },
      { name: "a hidden report you can't see", as: "citizen", input: onReport({ hidden: true }, { reason: "spam", details: "" }), error: "not_found" },
    ],
  },

  /* ---- operations side ---- */
  "reports-admin/setPriority": { allowed: ["admin"], input: onReport({}, { priority: "high", note: "Тест" }) },
  "reports-admin/assignReport": {
    allowed: ["admin"],
    input: onReport({}, { organizationId: "org-road", unitId: "unit-road-a" }),
    refusals: [
      { name: "a unit of another organization", as: "admin", input: onReport({}, { organizationId: "org-road", unitId: "unit-light-1" }), error: "invalid_input" },
      { name: "an organization that doesn't exist", as: "admin", input: onReport({}, { organizationId: "org-nowhere" }), error: "not_found" },
    ],
  },
  "reports-admin/changeStatus": {
    allowed: ["org_staff", "org_manager", "admin"],
    // A report assigned to the road organization, which the staff and manager personas work for.
    input: onReport(ROAD, { to: "investigating", version: 1 }),
    refusals: [
      { name: "staff of another organization", as: "lightStaff", input: onReport(ROAD, { to: "investigating", version: 1 }), error: "not_found" },
      { name: "a report nobody is assigned to", as: "roadStaff", input: onReport({}, { to: "investigating", version: 1 }), error: "not_found" },
      { name: "a version someone else already changed", as: "roadStaff", input: onReport(ROAD, { to: "investigating", version: 7 }), error: "conflict" },
      { name: "a move the lifecycle doesn't have", as: "admin", input: onReport(ROAD, { to: "reported", version: 1 }), error: "invalid_transition" },
      { name: "closing without a reason", as: "roadManager", input: onReport(ROAD, { to: "closed", version: 1 }), error: "reason_required" },
      { name: "closing as a duplicate of nothing", as: "roadManager", input: onReport(ROAD, { to: "closed", version: 1, closureReason: "duplicate" }), error: "duplicate_required" },
      { name: "reopening a resolved report without a note", as: "roadManager", input: onReport({ ...ROAD, status: "resolved" }, { to: "investigating", version: 1 }), error: "note_required" },
    ],
  },
  "moderation/moderateReport": { allowed: ["admin"], input: onReport({}, { action: "hide" }) },
  "moderation/undoModeration": { allowed: ["admin"], input: onReport({ hidden: true }, { visibility: "visible", flagIds: [] }) },
  "organizations/saveOrganization": {
    allowed: ["admin"],
    // The road organization exactly as it is: saving it again changes nothing.
    input: async () => ({ organization: (await withDb(listOrganizations)).find((o) => o.id === "org-road") }),
  },
};

/** Key: the folder under `src/app/api/v1`, e.g. "reports/[id]". */
export const ROUTES: Record<string, RouteRule> = {
  categories: { allowed: "public" },
  me: { allowed: "public" },
  organizations: { allowed: "public" },
  reports: {
    allowed: "public",
    refusals: [
      { name: "asking for \"my reports\" without signing in", as: "signedOut", url: () => "/api/v1/reports?mine=1", status: 401 },
      { name: "a map box that isn't one", as: "citizen", url: () => "/api/v1/reports?bbox=1,2,x", status: 400 },
    ],
  },
  "reports/[id]": {
    allowed: "public",
    ...lazyReport(() => seededReportId()),
    refusals: [
      { name: "a hidden report of someone else", as: "citizen", ...lazyReport(() => makeReport({ hidden: true })), status: 404 },
      { name: "an id that isn't one", as: "admin", url: () => "/api/v1/reports/nope", params: () => ({ id: "nope" }), status: 404 },
    ],
  },
  "admin/reports": {
    allowed: ["admin"],
    refusals: [{ name: "a filter that isn't one", as: "admin", url: () => "/api/v1/admin/reports?sort=sideways", status: 400 }],
  },
  "admin/dashboard": {
    allowed: ["admin"],
    refusals: [{ name: "a period the overview doesn't offer", as: "admin", url: () => "/api/v1/admin/dashboard?days=5", status: 400 }],
  },
  "admin/users": { allowed: ["admin"] },
  "staff/dashboard": { allowed: ["org_staff", "org_manager"] },
  "staff/reports": { allowed: ["org_staff", "org_manager"] },
  "photos/[id]": {
    // A photo on a visible report. Who sees an unattached or hidden one: tests/photos.db.test.ts.
    allowed: "public",
    file: { contentType: "image/jpeg" },
    ...lazyPhoto(async () => (await publicPhoto()).photoId),
    refusals: [
      {
        name: "another citizen's photo that isn't on a report yet",
        as: "otherCitizen",
        ...lazyPhoto(() => uploadedBy("citizen")),
        status: 404,
      },
    ],
  },
};

/** Key: `<METHOD> <folder under src/app/api/v1>`. */
export const WRITE_ROUTES: Record<string, WriteRouteRule> = {
  "POST photos": {
    allowed: ANY_ROLE,
    request: () => ({ method: "POST", headers: { "content-type": "image/jpeg" }, body: jpeg() }),
    created: (data) => rememberPhoto((data as { id: string }).id),
  },
};

/** A visible report from the seed. */
async function seededReportId(): Promise<string> {
  const [report] = await withDb((db) => db.select({ id: reports.id }).from(reports).where(eq(reports.visibility, "visible")).limit(1));
  return report.id;
}

/** `url` and `params` of one report, looked up or created on first use. */
function lazyReport(make: () => Promise<string>) {
  let id: Promise<string> | undefined;
  const get = () => (id ??= make());
  return { url: async () => `/api/v1/reports/${await get()}`, params: async () => ({ id: await get() }) };
}

/** `url` and `params` of one photo, created on first use. */
function lazyPhoto(make: () => Promise<string>) {
  let id: Promise<string> | undefined;
  const get = () => (id ??= make());
  return { url: async () => `/api/v1/photos/${await get()}`, params: async () => ({ id: await get() }) };
}
