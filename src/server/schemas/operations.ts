// Operations-side input schemas: status change, priority, assignment, category tree, organization.
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
  reasonRequired: "reason_required",
  reasonNotAllowed: "reason_not_allowed",
  duplicateRequired: "duplicate_required",
  duplicateNotAllowed: "duplicate_not_allowed",
  duplicateSlug: "duplicate_slug",
} as const;

const NOTE_MAX = 500;
const NAME_MAX = 120;
const categorySlug = z.string().trim().regex(/^[a-z0-9_-]{1,60}$/);
const orgSlug = z.string().trim().regex(/^[a-z0-9-]{2,60}$/);

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/* ------------------------------------------------------------------ */
/* Status change                                                       */
/* ------------------------------------------------------------------ */

/**
 * Changes a report's status. `version` is the report version the client read: the action rejects
 * with 409 when someone else changed the report in the meantime (optimistic lock).
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
  })
  .superRefine((v, ctx) => {
    if (v.to === "closed" && !v.closureReason) {
      ctx.addIssue({ code: "custom", path: ["closureReason"], message: OPS_ERROR_CODES.reasonRequired });
    }
    if (v.to !== "closed" && v.closureReason) {
      ctx.addIssue({ code: "custom", path: ["closureReason"], message: OPS_ERROR_CODES.reasonNotAllowed });
    }
    if (v.closureReason === "duplicate" && !v.duplicateOfId) {
      ctx.addIssue({ code: "custom", path: ["duplicateOfId"], message: OPS_ERROR_CODES.duplicateRequired });
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
/* Category tree (category -> subcategories)                           */
/* ------------------------------------------------------------------ */

export const subcategoryInputSchema = z.object({
  /** Stable id inside its category, e.g. "pothole". */
  slug: categorySlug,
  nameMn: z.string().trim().min(1).max(NAME_MAX),
  nameEn: z.string().trim().min(1).max(NAME_MAX),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type SubcategoryInput = z.infer<typeof subcategoryInputSchema>;

export const categoryInputSchema = z
  .object({
    /** Stable public id, e.g. "roads". */
    slug: categorySlug,
    nameMn: z.string().trim().min(1).max(NAME_MAX),
    nameEn: z.string().trim().min(1).max(NAME_MAX),
    /** One of `IconKey` in src/lib/types.ts; the action checks the value. */
    icon: z.string().trim().min(1).max(40).default("ellipsis"),
    /** Organization suggested when a report of this category is assigned. */
    defaultOrganizationId: idSchema.nullish(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    subcategories: z.array(subcategoryInputSchema).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (hasDuplicates(v.subcategories.map((s) => s.slug))) {
      ctx.addIssue({ code: "custom", path: ["subcategories"], message: OPS_ERROR_CODES.duplicateSlug });
    }
  });
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** The whole tree, saved in one go by the categories editor. */
export const categoryTreeSchema = z
  .array(categoryInputSchema)
  .max(50)
  .superRefine((v, ctx) => {
    if (hasDuplicates(v.map((c) => c.slug))) {
      ctx.addIssue({ code: "custom", message: OPS_ERROR_CODES.duplicateSlug });
    }
  });
export type CategoryTreeInput = z.infer<typeof categoryTreeSchema>;

/* ------------------------------------------------------------------ */
/* Organizations and units                                             */
/* ------------------------------------------------------------------ */

export const organizationUnitInputSchema = z.object({
  slug: orgSlug,
  nameMn: z.string().trim().min(1).max(NAME_MAX),
  nameEn: z.string().trim().min(1).max(NAME_MAX),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type OrganizationUnitInput = z.infer<typeof organizationUnitInputSchema>;

export const organizationInputSchema = z
  .object({
    slug: orgSlug,
    nameMn: z.string().trim().min(2).max(NAME_MAX),
    nameEn: z.string().trim().min(2).max(NAME_MAX),
    isActive: z.boolean().default(true),
    units: z.array(organizationUnitInputSchema).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (hasDuplicates(v.units.map((u) => u.slug))) {
      ctx.addIssue({ code: "custom", path: ["units"], message: OPS_ERROR_CODES.duplicateSlug });
    }
  });
export type OrganizationInput = z.infer<typeof organizationInputSchema>;

/* ------------------------------------------------------------------ */
/* Queue filters (query string of the review and staff queue APIs)    */
/* ------------------------------------------------------------------ */

export const QUEUE_SORTS = ["priority", "oldest", "newest"] as const;
export const PRIORITY_FILTERS = [...PRIORITIES, "pending"] as const;

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export const queueFiltersSchema = z.object({
  status: z.string().transform(csv).pipe(z.array(z.enum(REPORT_STATUSES)).max(5)).optional(),
  /** "pending" = no priority yet. */
  priority: z.string().transform(csv).pipe(z.array(z.enum(PRIORITY_FILTERS)).max(5)).optional(),
  category: categorySlug.optional(),
  /** Organization uuid, or "none" for reports nobody is assigned to. */
  organizationId: z.union([z.literal("none"), z.string().regex(/^[0-9a-f-]{36}$/i)]).optional(),
  sort: z.enum(QUEUE_SORTS).default("priority"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type QueueFilters = z.infer<typeof queueFiltersSchema>;