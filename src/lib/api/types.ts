// Shapes of the `/api/v1` responses, shared by the route handlers and the screens.
// Types only: safe to import from client and server code.
import type { CategoryDef, Role, SubcategoryDef } from "@/lib/types";
import type { ErrorBody } from "@/server/errors";

/** Every `/api/v1` response is `{ data }` on success or `{ error }` on failure. */
export type ApiEnvelope<T> = { data: T; error?: undefined } | { data?: undefined; error: ErrorBody };

/* ---- GET /api/v1/me ---- */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Database ids (uuid) of the user's organization and unit, for API calls. */
  organizationId: string | null;
  unitId: string | null;
  /** The same as slugs ("org-road", "unit-road-a"), which are the ids the demo data uses. */
  organizationSlug: string | null;
  unitSlug: string | null;
}

export interface MeResponse {
  /** A database and a session secret are set: real sign-in and `/api/v1` work. */
  configured: boolean;
  /** Google sign-in is set up (client id and secret present). */
  google: boolean;
  /** The demo role picker is enabled (DEMO_LOGIN=true). */
  demoLogin: boolean;
  user: SessionUser | null;
}

/* ---- GET /api/v1/categories ---- */

/** The demo's `CategoryDef`, plus how many reports use each category and subcategory. */
export interface ApiSubcategory extends SubcategoryDef {
  reportCount: number;
}
export interface ApiCategory extends Omit<CategoryDef, "subcategories"> {
  reportCount: number;
  subcategories: ApiSubcategory[];
}
export interface CategoriesResponse {
  categories: ApiCategory[];
}

/* ---- POST /api/v1/photos ---- */

export interface UploadedPhoto {
  /** Pass it to createReport (`photoIds`) or changeStatus (`photoId`). */
  id: string;
  /** `/api/v1/photos/{id}`: usable as an `<img src>`. */
  url: string;
  width: number;
  height: number;
  bytes: number;
}
