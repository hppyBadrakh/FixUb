// Shapes of the `/api/v1` responses, shared by the route handlers and the screens.
// Types only: safe to import from client and server code.
import type { CategoryDef, DistrictId, Organization, Report, ReportStatus, Role, SubcategoryDef, User } from "@/lib/types";
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

/* ---- GET /api/v1/reports, /api/v1/admin/reports, /api/v1/staff/reports ---- */

/**
 * Reports in the demo's `Report` shape, already cut down to what the caller may see: other
 * people's ids are replaced by "" (see src/server/queries/reports.ts).
 */
export interface ReportsResponse {
  reports: Report[];
}

/* ---- GET /api/v1/statistics ---- */

/** The public statistics page's numbers, counted in SQL over visible reports (src/server/queries/statistics.ts). */
export interface StatisticsResponse {
  /** When the numbers were counted, ms since the epoch. */
  generatedAt: number;
  /** The period of `resolved` and `medianResponseHours`. */
  days: 7 | 30 | 90;
  /** All visible reports. */
  total: number;
  /** Reported, investigating or in progress, right now. */
  open: number;
  /** Reports that moved to Resolved in the period, and in the equally long period before it. */
  resolved: number;
  resolvedPrev: number;
  /** Median hours from report to first status change, for reports made in the period; null when none. */
  medianResponseHours: number | null;
  openOver14: number;
  byStatus: Record<ReportStatus, number>;
  /** Open reports by category slug; categories with none are left out. */
  openByCategory: { category: string; count: number }[];
  openByDistrict: Record<DistrictId, number>;
  /** Open reports by how long they have waited. */
  openByAge: Record<"lt2" | "2-7" | "7-14" | "14-30" | "gt30", number>;
  /** The last 14 local days (Asia/Ulaanbaatar), oldest first: `labels` are timestamps, one per day. */
  series: { labels: number[]; incoming: number[]; resolved: number[] };
}

/* ---- GET /api/v1/reports/nearby ---- */
export interface NearbyResponse {
  /** Nearest first; `distance` in metres. */
  candidates: { report: Report; distance: number }[];
}

/* ---- GET /api/v1/reports/{id} ---- */

export interface ReportResponse {
  report: Report;
}

/* ---- GET /api/v1/organizations ---- */

export interface OrganizationsResponse {
  organizations: Organization[];
}

/* ---- GET /api/v1/admin/users ---- */

export interface StaffResponse {
  users: User[];
}
