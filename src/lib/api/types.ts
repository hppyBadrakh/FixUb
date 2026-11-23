// Shapes of the `/api/v1` responses, shared by the route handlers and the screens.
// Types only: safe to import from client and server code.
import type { ActivityEvent, CategoryDef, Organization, Report, Role, SubcategoryDef, User } from "@/lib/types";
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
  /** The same as slugs ("org-road", "unit-road-a"), which is how the API identifies them. */
  organizationSlug: string | null;
  unitSlug: string | null;
  /** Accepted the current notice about what a report makes public. */
  consented: boolean;
}

export interface MeResponse {
  /** A database and a session secret are set: real sign-in and `/api/v1` work. */
  configured: boolean;
  /** Google sign-in is set up (client id and secret present). */
  google: boolean;
  /** A demonstration deployment (DEMO_LOGIN=true): one-click sample users, and "sample data" notices. */
  demoLogin: boolean;
  /** The sample users the login page offers. Only present when `demoLogin` is true. */
  sampleUsers?: User[];
  user: SessionUser | null;
}

/* ---- GET /api/v1/categories ---- */

/** The `CategoryDef`, plus how many reports use each category and subcategory. */
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

/* ---- GET /api/v1/reports, /api/v1/admin/reports, /api/v1/staff/reports ---- */

/**
 * Reports in the `Report` shape, already cut down to what the caller may see: other
 * people's ids are replaced by "" (see src/server/queries/reports.ts).
 */
export interface ReportsResponse {
  reports: Report[];
}

/* ---- GET /api/v1/reports/{id} ---- */

export interface ReportResponse {
  report: Report;
}

/* ---- GET /api/v1/organizations ---- */

export interface OrganizationsResponse {
  organizations: Organization[];
}

/* ---- GET /api/v1/admin/dashboard, /api/v1/staff/dashboard ---- */

/**
 * The overview's numbers, counted in SQL with the definitions of src/lib/domain/metrics.ts
 * (`summarize`, `dailySeries`, `ageBuckets`) over the visible reports the caller may see.
 */
export interface DashboardResponse {
  /** The moment the numbers were counted for (ms). Periods end here. */
  now: number;
  /** Length of the period in days (`?days=1|7|30`). */
  days: number;
  /** The same fields as `summarize(reports, now, days)`. */
  summary: {
    open: number;
    awaiting: number;
    working: number;
    unassigned: number;
    resolved: number;
    resolvedPrev: number;
    /** Hours; null when no report of the period got a first response yet. */
    medianResponse: number | null;
    medianResponsePrev: number | null;
    openOver14: number;
  };
  /** The same as `dailySeries(reports, now, 14)`: one entry per local day, oldest first. */
  series: { labels: number[]; incoming: number[]; resolved: number[] };
  /** The same as `ageBuckets(reports, now)`. */
  ageBuckets: { key: string; mn: string; en: string; value: number }[];
  /** Open reports per organization and unit (slugs); `unitId` null = no unit yet. */
  workload: { organizationId: string; unitId: string | null; open: number }[];
  /** Reports with an open flag, hidden ones included. Admins only. */
  flagged?: number;
}

/* ---- GET /api/v1/admin/users ---- */

export interface StaffResponse {
  users: User[];
}

/* ---- GET /api/v1/admin/activity, /api/v1/staff/activity ---- */

/**
 * Recent events on the reports the caller may see, newest first, in the `ActivityEvent`
 * shape (organizations by slug). Nobody is identified: an event says what happened, and for
 * a status change which organization (or "FixUB team") acted, never which person.
 */
export interface ActivityResponse {
  events: ActivityEvent[];
}

/* ---- GET /api/v1/statistics ---- */

/**
 * The public statistics page, counted in SQL over the visible reports. `summary`, `series` and
 * `ageBuckets` are the dashboard's; the three breakdowns list only keys that have reports.
 */
export interface StatisticsResponse extends Pick<DashboardResponse, "now" | "days" | "summary" | "series" | "ageBuckets"> {
  /** Visible reports per status. */
  byStatus: Record<string, number>;
  /** Open visible reports per category slug. */
  openByCategory: Record<string, number>;
  /** Open visible reports per district. */
  openByDistrict: Record<string, number>;
}

/* ---- GET /api/v1/admin/accounts ---- */

/** A person who has signed in, and what they may do. Organization and unit are slugs. */
export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string;
  unitId?: string;
  /** Blocked: signed out everywhere and can't sign in. */
  banned: boolean;
  /** An admin through ADMIN_EMAILS on the server: the Users page can't change that. */
  fixedAdmin: boolean;
  createdAt: number;
}

export interface AccountsResponse {
  /** At most 200, admins and staff first. */
  accounts: Account[];
  /** How many accounts match the search in all. */
  total: number;
}
