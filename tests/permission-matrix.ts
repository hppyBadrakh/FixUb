// WHO MAY CALL WHAT. Every server action and every GET endpoint must have a line here:
// `npm test` fails when one is missing, and then checks that everyone else is refused.
//
// Adding a server action or an endpoint? Add its rule in the same pull request.
import type { Role } from "@/lib/types";
import type { ErrorCode } from "@/server/errors";
import { withDb } from "@/server/db";
import { listCategories } from "@/server/queries/categories";
import type { Persona } from "./helpers/personas";

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
}

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
};
