// Operations-side input schemas: status change, priority, assignment, queue filters.
// Like the citizen schemas, these only check the *shape* of input. Rules that need the database
// (does the report exist? may this actor do this transition? is a note needed?) stay in the
// server actions and in `checkTransition` (src/lib/domain/lifecycle.ts).
import { z } from "zod";
import type { ClosureReason, ReportStatus } from "@/lib/types";
import { idSchema } from "./common";

/* ------------------------------------------------------------------ */
/* Shared enums                                                        */
/* ------------------------------------------------------------------ */

export const REPORT_STATUSES = ["reported", "investigating", "in_progress", "resolved", "closed"] as const;
export const CLOSURE_REASONS = ["duplicate", "invalid", "out_of_scope"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type PriorityLevel = (typeof PRIORITIES)[number];

// Fail to compile if the lists drift from the types in src/lib/types.ts.
export const _statusesMatch: [ReportStatus] extends [(typeof REPORT_STATUSES)[number]]
  ? [(typeof REPORT_STATUSES)[number]] extends [ReportStatus]
    ? true
    : never
  : never = true;

export const _closureReasonsMatch: [ClosureReason] extends [(typeof CLOSURE_REASONS)[number]]
  ? [(typeof CLOSURE_REASONS)[number]] extends [ClosureReason]
    ? true
    : never
  : never = true;

/** Error codes returned as field messages. The UI maps them to Mongolian/English text. */
export const OPS_ERROR_CODES = {
  reasonNotAllowed: "reason_not_allowed",
  duplicateNotAllowed: "duplicate_not_allowed",
} as const;

const NOTE_MAX = 500;
const categorySlug = z.string().trim().regex(/^[a-z0-9_-]{1,60}$/);
const orgSlug = z.string().trim().regex(/^[a-z0-9-]{2,60}$/);

/* ------------------------------------------------------------------ */
/* Status change                                                       */
/* ------------------------------------------------------------------ */

/**
 * Changes a report's status. `version` is the report version the client read: the action rejects
 * with 409 when someone else changed the report in the meantime (optimistic lock).
 *
 * A missing closure reason or duplicate target is NOT refused here: `checkTransition` in the
 * action answers `reason_required` / `duplicate_required`, which the screens show next to the
 * right field. The schema only refuses values that make no sense for the move.
 */
export const changeStatusSchema = z
  .object({
    reportId: idSchema,
    to: z.enum(REPORT_STATUSES),
    version: z.number().int().positive(),
    /** Public note shown on the timeline. Required when leaving resolved/closed (checked in the action). */
    note: z.string().trim().max(NOTE_MAX).default(""),
    closureReason: z.enum(CLOSURE_REASONS).optional(),
    duplicateOfId: idSchema.optional(),
    /** Completion photo (an id from `uploadPhoto`), only when resolving. */
    photoId: idSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.to !== "closed" && v.closureReason) {
      ctx.addIssue({ code: "custom", path: ["closureReason"], message: OPS_ERROR_CODES.reasonNotAllowed });
    }
    if (v.closureReason !== "duplicate" && v.duplicateOfId) {
      ctx.addIssue({ code: "custom", path: ["duplicateOfId"], message: OPS_ERROR_CODES.duplicateNotAllowed });
    }
  });
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

/* ------------------------------------------------------------------ */
/* Priority (admin only)                                               */
/* ------------------------------------------------------------------ */

export const setPrioritySchema = z.object({
  reportId: idSchema,
  priority: z.enum(PRIORITIES),
  /** Internal note on the decision. Never shown publicly. */
  note: z.string().trim().max(NOTE_MAX).default(""),
});
export type SetPriorityInput = z.infer<typeof setPrioritySchema>;

/* ------------------------------------------------------------------ */
/* Activity feed (query string of the admin and staff activity APIs)  */
/* ------------------------------------------------------------------ */

export const activityQuerySchema = z.object({
  /** How many events, newest first. */
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

/** Assigns a report to an organization and, optionally, one of its units. */
export const assignSchema = z.object({
  reportId: idSchema,
  organizationId: idSchema,
  /** `null` or missing = the whole organization, no specific unit. */
  unitId: idSchema.nullish(),
});
export type AssignInput = z.infer<typeof assignSchema>;

/* ------------------------------------------------------------------ */
/* Queue filters (query string of the review and staff queue APIs)    */
/* ------------------------------------------------------------------ */

export const QUEUE_SORTS = ["priority", "oldest", "newest"] as const;
export const PRIORITY_FILTERS = [...PRIORITIES, "pending"] as const;

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** The most reports one request returns. */
export const QUEUE_LIMIT_MAX = 1000;

export const queueFiltersSchema = z.object({
  status: z.string().transform(csv).pipe(z.array(z.enum(REPORT_STATUSES)).max(5)).optional(),
  /** "pending" = no priority yet. */
  priority: z.string().transform(csv).pipe(z.array(z.enum(PRIORITY_FILTERS)).max(5)).optional(),
  category: categorySlug.optional(),
  /** Organization slug ("org-road"), or "none" for reports nobody is assigned to. */
  organizationId: z.union([z.literal("none"), orgSlug]).optional(),
  sort: z.enum(QUEUE_SORTS).default("priority"),
  limit: z.coerce.number().int().min(1).max(QUEUE_LIMIT_MAX).default(QUEUE_LIMIT_MAX),
});
export type QueueFilters = z.infer<typeof queueFiltersSchema>;

/* ------------------------------------------------------------------ */
/* Dashboard (query string of the admin and staff dashboard APIs)     */
/* ------------------------------------------------------------------ */

/** The periods the overview offers: last day, 7 days, 30 days. */
export const DASHBOARD_PERIODS = ["1", "7", "30"] as const;

export const dashboardQuerySchema = z.object({
  days: z.enum(DASHBOARD_PERIODS).default("7").transform(Number),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
