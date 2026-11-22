// Shapes of the operations-side `/api/v1` responses (review queue, staff queue, organizations).
// Types only: safe to import from client and server code. Kept apart from `types.ts` so the
// citizen side and the operations side don't edit the same file.
import type { Bi, ClosureReason, DistrictId, Priority, ReportStatus } from "@/lib/types";

/* ---- GET /api/v1/organizations ---- */

export interface ApiUnit {
  /** Database id (uuid): pass it to API calls such as assign. */
  id: string;
  /** The id the demo data uses, e.g. "unit-road-a". */
  slug: string;
  name: Bi;
  isActive: boolean;
}

export interface ApiOrganization {
  id: string;
  slug: string;
  name: Bi;
  isActive: boolean;
  /** Category slugs this organization is the suggested owner for (routing). */
  categories: string[];
  units: ApiUnit[];
}

export interface OrganizationsResponse {
  organizations: ApiOrganization[];
}

/* ---- GET /api/v1/admin/reports and GET /api/v1/staff/reports ---- */

export interface ApiOrgRef {
  id: string;
  slug: string;
  name: Bi;
}

/** One row of a work queue. Never includes who reported it. Times are epoch milliseconds, as in the demo. */
export interface ApiQueueReport {
  id: string;
  /** Public reference, e.g. FX-26-04133. */
  ref: string;
  /** Category and subcategory slugs; names come from GET /api/v1/categories. */
  category: string;
  subcategory: string;
  /** `null` = pending review. */
  priority: Priority | null;
  description: string;
  addressHint: string;
  district: DistrictId;
  lng: number;
  lat: number;
  status: ReportStatus;
  closureReason: ClosureReason | null;
  confirmationCount: number;
  /** Send it back when changing the status (optimistic lock). */
  version: number;
  organization: ApiOrgRef | null;
  unit: ApiOrgRef | null;
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
}

export interface QueueResponse {
  reports: ApiQueueReport[];
  /** How many reports match the filters, before `limit` is applied. */
  total: number;
}
