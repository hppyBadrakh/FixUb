// WHO MAY CALL WHAT. Every server action and every /api/v1 endpoint must have a line here:
// `npm test` fails when one is missing, and then checks that everyone else is refused.
//
// Adding a server action or an endpoint? Add its rule in the same pull request.
import type { Role } from "@/lib/types";
import type { ErrorCode } from "@/server/errors";
import { withDb } from "@/server/db";
import { listCategories } from "@/server/queries/categories";
import type { Persona } from "./helpers/personas";
import { jpeg, publicPhoto, rememberPhoto, uploadedBy } from "./helpers/photos";

type Lazy<T> = () => T | Promise<T>;

export interface ActionRule {
  /** Roles that may call the action. Every other role gets `forbidden`, a visitor `signed_out`. */
  allowed: Role[];
  /**
   * An input that passes the action's Zod schema (so a refusal comes from the permission check)
   * and is safe to run again and again: allowed roles really execute it against the test database.
   */
  input: Lazy<unknown>;
  /** Cases that depend on the data, not just the role: another organization's report, your own report… */
  refusals?: { name: string; as: Persona; input: Lazy<unknown>; error: ErrorCode }[];
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

/** Key: `<file in src/server/actions>/<exported function>`. */
export const ACTIONS: Record<string, ActionRule> = {
  "categories/saveCategories": { allowed: ["admin"], input: currentCategoryTree },
};

/** Key: the folder under `src/app/api/v1`, e.g. "reports/[id]". */
export const ROUTES: Record<string, RouteRule> = {
  categories: { allowed: "public" },
  me: { allowed: "public" },
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

/** `url` and `params` of one photo, created on first use. */
function lazyPhoto(make: () => Promise<string>) {
  let id: Promise<string> | undefined;
  const get = () => (id ??= make());
  return { url: async () => `/api/v1/photos/${await get()}`, params: async () => ({ id: await get() }) };
}
