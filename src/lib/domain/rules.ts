// Small pure rules and helpers shared by the screens and the server: no React, no database.
// The lifecycle rules (who may make which status change) are in ./lifecycle.ts.
import { LIMITS, OPEN_STATUSES } from "../meta";
import type { AppState, CategoryDef, CategorySlug, ClosureReason, DistrictId, Organization, Report, ReportStatus } from "../types";
import { distanceM } from "./geo";
import type { TransitionError } from "./lifecycle";

/** The rule violations a write can be refused with. The server adds a few of its own (src/server/errors.ts). */
export type ActionError =
  | TransitionError
  | "forbidden"
  | "signed_out"
  | "conflict"
  | "out_of_area"
  | "description_length"
  | "too_many_photos"
  | "own_report"
  | "not_open"
  | "not_resolved"
  | "already_flagged"
  | "photo_required"
  | "invalid_category"
  | "in_use"
  | "invalid_input";

/** A short random id for things created in the browser (a draft's request key, a new unit's slug). */
export function uid(prefix = ""): string {
  // Not crypto.randomUUID: it is missing on plain-http LAN addresses (non-secure context).
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** The public reference of a report: FX-26-04133. */
export function makeRef(seq: number, now: number): string {
  const yy = String(new Date(now).getFullYear()).slice(2);
  return `FX-${yy}-${String(seq).padStart(5, "0")}`;
}

/** What the report form sends to `createReport`. */
export interface CreateReportInput {
  category: CategorySlug;
  subcategory: string;
  description: string;
  lng: number;
  lat: number;
  accuracyM?: number;
  addressHint: string;
  district: DistrictId;
  photoIds: string[];
  /** Idempotency key: sending the same one twice creates one report. */
  clientRequestId: string;
}

/** What the console sends to `changeStatus`. */
export interface ChangeStatusInput {
  to: ReportStatus;
  note?: string;
  closureReason?: ClosureReason;
  duplicateOfId?: string;
  photoId?: string;
  /** The version the screen showed; a newer one on the server means `conflict`. */
  expectedVersion: number;
}

export function tally(feedback: Report["feedback"]) {
  let fixed = 0;
  let notFixed = 0;
  for (const f of feedback) {
    if (f.verdict === "fixed") fixed++;
    else notFixed++;
  }
  return { fixed, notFixed };
}

/**
 * Shape rules of the category tree, checked in the editor and again in the server action: every
 * category and subcategory has a Mongolian and an English name, ids are unique, and a category
 * has at least one subcategory.
 */
export function checkCategoryTree(categories: CategoryDef[]): "invalid_input" | null {
  const ids = new Set<string>();
  for (const c of categories) {
    if (!c.name.mn.trim() || !c.name.en.trim() || ids.has(c.id) || !c.subcategories.length) return "invalid_input";
    ids.add(c.id);
    const subIds = new Set<string>();
    for (const sc of c.subcategories) {
      if (!sc.name.mn.trim() || !sc.name.en.trim() || subIds.has(sc.id)) return "invalid_input";
      subIds.add(sc.id);
    }
  }
  return null;
}

/** The organization suggested for a category (routing). */
export function suggestedOrganization(state: Pick<AppState, "organizations">, category: CategorySlug): Organization | undefined {
  return state.organizations.find((o) => o.isActive && o.categories.includes(category));
}

/** Open, visible reports of the same category close to a point: shown before a new report is filed. */
export function findDuplicateCandidates(state: Pick<AppState, "reports">, p: { lng: number; lat: number; category: CategorySlug }, now: number) {
  return state.reports
    .filter(
      (r) =>
        r.visibility === "visible" &&
        r.category === p.category &&
        OPEN_STATUSES.includes(r.status) &&
        now - r.createdAt < LIMITS.duplicateDays * 864e5,
    )
    .map((r) => ({ report: r, distance: distanceM(p, r) }))
    .filter((x) => x.distance <= LIMITS.duplicateRadiusM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
}
