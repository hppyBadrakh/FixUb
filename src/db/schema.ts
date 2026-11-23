// FixUB database schema (Postgres + PostGIS), following the Architecture Package, section 7,
// plus: units, the category → subcategory tree, report priority and the
// priority decision.
//
// Only A changes this file. After a change: `npm run db:generate`, review the SQL in `drizzle/`,
// commit both. Everyone else then runs `npm run db:migrate`.
//
// Conventions
// - Status-like columns are `text` + CHECK, not Postgres enums (adding a value is a one-line migration).
// - Invariants that must never break are enforced here, not only in code.
// - TypeScript property names are camelCase; column names are snake_case.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  geometry,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Better Auth tables (plural names: `usePlural: true` in the adapter) */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // FixUB additions. Organization roles live in `organization_members`.
    platformRole: text("platform_role", { enum: ["citizen", "admin"] }).notNull().default("citizen"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    consentVersion: text("consent_version"),
  },
  (t) => [check("users_platform_role_check", sql`${t.platformRole} IN ('citizen','admin')`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    unique("accounts_provider_account_key").on(t.providerId, t.accountId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Organizations                                                       */
/* ------------------------------------------------------------------ */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    nameMn: text("name_mn").notNull(),
    nameEn: text("name_en").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check("organizations_slug_check", sql`${t.slug} ~ '^[a-z0-9-]{2,60}$'`),
    check("organizations_name_mn_check", sql`char_length(${t.nameMn}) BETWEEN 2 AND 120`),
    check("organizations_name_en_check", sql`char_length(${t.nameEn}) BETWEEN 2 AND 120`),
  ],
);

/** A repair crew / team inside an organization. Reports can be assigned to one. */
export const organizationUnits = pgTable(
  "organization_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    nameMn: text("name_mn").notNull(),
    nameEn: text("name_en").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("organization_units_org_slug_key").on(t.organizationId, t.slug),
    // Lets `reports` and `organization_members` prove that a unit belongs to the organization.
    unique("organization_units_org_id_key").on(t.organizationId, t.id),
    check("organization_units_slug_check", sql`${t.slug} ~ '^[a-z0-9-]{2,60}$'`),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["org_staff", "org_manager"] }).notNull(),
    unitId: uuid("unit_id"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index("organization_members_user_idx").on(t.userId),
    check("organization_members_role_check", sql`${t.role} IN ('org_staff','org_manager')`),
    foreignKey({
      name: "organization_members_unit_fk",
      columns: [t.organizationId, t.unitId],
      foreignColumns: [organizationUnits.organizationId, organizationUnits.id],
    }),
  ],
);

/* ------------------------------------------------------------------ */
/* Categories (editable tree: category → subcategories)                */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: smallint("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Stable public id (the `CategoryDef.id`, e.g. "roads"). */
    slug: text("slug").notNull().unique(),
    nameMn: text("name_mn").notNull(),
    nameEn: text("name_en").notNull(),
    /** One of `IconKey` in src/lib/types.ts. */
    icon: text("icon").notNull().default("ellipsis"),
    /** Routing: the organization suggested when a report of this category is assigned. */
    defaultOrganizationId: uuid("default_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [
    check("categories_slug_check", sql`${t.slug} ~ '^[a-z0-9_-]{1,60}$'`),
    check("categories_name_mn_check", sql`char_length(${t.nameMn}) BETWEEN 1 AND 120`),
    check("categories_name_en_check", sql`char_length(${t.nameEn}) BETWEEN 1 AND 120`),
  ],
);

export const subcategories = pgTable(
  "subcategories",
  {
    id: smallint("id").primaryKey().generatedAlwaysAsIdentity(),
    categoryId: smallint("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Stable public id inside its category (the `SubcategoryDef.id`, e.g. "pothole"). */
    slug: text("slug").notNull(),
    nameMn: text("name_mn").notNull(),
    nameEn: text("name_en").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [
    unique("subcategories_category_slug_key").on(t.categoryId, t.slug),
    // Lets `reports` prove that its subcategory belongs to its category.
    unique("subcategories_category_id_key").on(t.categoryId, t.id),
    check("subcategories_slug_check", sql`${t.slug} ~ '^[a-z0-9_-]{1,60}$'`),
    check("subcategories_name_mn_check", sql`char_length(${t.nameMn}) BETWEEN 1 AND 120`),
    check("subcategories_name_en_check", sql`char_length(${t.nameEn}) BETWEEN 1 AND 120`),
  ],
);

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

/** Source of the public reference number: FX-26-04133. Use `nextval('report_ref_seq')`. */
export const reportRefSeq = pgSequence("report_ref_seq", { startWith: 1, increment: 1 });

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Public reference shown to citizens, e.g. FX-26-04133. */
    ref: text("ref").notNull().unique(),
    reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
    /** Idempotency key from the report form: a double submit creates one report. */
    clientRequestId: uuid("client_request_id").notNull(),
    categoryId: smallint("category_id")
      .notNull()
      .references(() => categories.id),
    subcategoryId: smallint("subcategory_id").notNull(),
    /** Official priority, set by an admin. NULL = pending review. */
    priority: text("priority", { enum: ["low", "medium", "high", "critical"] }),
    prioritySetBy: text("priority_set_by").references(() => users.id, { onDelete: "set null" }),
    prioritySetAt: timestamp("priority_set_at", { withTimezone: true }),
    /** Internal note on the priority decision. Never shown publicly. */
    priorityNote: text("priority_note"),
    description: text("description").notNull(),
    /** English text of seeded sample reports. Citizens write one language only. */
    descriptionEn: text("description_en"),
    /** PostGIS point, SRID 4326. `x` = longitude, `y` = latitude. */
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    locationAccuracyM: real("location_accuracy_m"),
    addressHint: text("address_hint"),
    addressHintEn: text("address_hint_en"),
    district: text("district", {
      enum: ["sukhbaatar", "chingeltei", "bayanzurkh", "khan_uul", "bayangol", "songinokhairkhan"],
    }).notNull(),
    status: text("status", { enum: ["reported", "investigating", "in_progress", "resolved", "closed"] })
      .notNull()
      .default("reported"),
    closureReason: text("closure_reason", { enum: ["duplicate", "invalid", "out_of_scope"] }),
    duplicateOfId: uuid("duplicate_of_id"),
    visibility: text("visibility", { enum: ["visible", "hidden"] }).notNull().default("visible"),
    assignedOrganizationId: uuid("assigned_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    assignedUnitId: uuid("assigned_unit_id"),
    /** Denormalized count of `report_confirmations`; changes only in the same transaction. */
    confirmationCount: integer("confirmation_count").notNull().default(0),
    /** Optimistic lock: status changes send the version they read. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /**
     * Set when more people answer "still broken" than "fixed" on the current resolution; cleared
     * by the next status change. The official status stays what staff set: this is a signal to them.
     */
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
  },
  (t) => [
    unique("reports_reporter_request_key").on(t.reporterId, t.clientRequestId),
    foreignKey({
      name: "reports_duplicate_of_fk",
      columns: [t.duplicateOfId],
      foreignColumns: [t.id],
    }),
    foreignKey({
      name: "reports_subcategory_fk",
      columns: [t.categoryId, t.subcategoryId],
      foreignColumns: [subcategories.categoryId, subcategories.id],
    }),
    foreignKey({
      name: "reports_assigned_unit_fk",
      columns: [t.assignedOrganizationId, t.assignedUnitId],
      foreignColumns: [organizationUnits.organizationId, organizationUnits.id],
    }),

    check("reports_ref_check", sql`${t.ref} ~ '^FX-[0-9]{2}-[0-9]{5,}$'`),
    check("reports_description_check", sql`char_length(${t.description}) BETWEEN 10 AND 1000`),
    check("reports_address_hint_check", sql`char_length(${t.addressHint}) <= 200`),
    check("reports_accuracy_check", sql`${t.locationAccuracyM} >= 0`),
    check(
      "reports_district_check",
      sql`${t.district} IN ('sukhbaatar','chingeltei','bayanzurkh','khan_uul','bayangol','songinokhairkhan')`,
    ),
    check("reports_status_check", sql`${t.status} IN ('reported','investigating','in_progress','resolved','closed')`),
    check("reports_closure_reason_check", sql`${t.closureReason} IN ('duplicate','invalid','out_of_scope')`),
    check("reports_visibility_check", sql`${t.visibility} IN ('visible','hidden')`),
    check("reports_priority_check", sql`${t.priority} IN ('low','medium','high','critical')`),
    // A priority always comes with its decision time, and a pending report has neither.
    check("reports_priority_decision_check", sql`(${t.priority} IS NULL) = (${t.prioritySetAt} IS NULL)`),
    check("reports_priority_note_check", sql`char_length(${t.priorityNote}) <= 500`),
    check("reports_confirmation_count_check", sql`${t.confirmationCount} >= 0`),
    check("reports_closed_reason_check", sql`(${t.status} = 'closed') = (${t.closureReason} IS NOT NULL)`),
    check(
      "reports_duplicate_link_check",
      sql`(${t.closureReason} IS NOT DISTINCT FROM 'duplicate') = (${t.duplicateOfId} IS NOT NULL)`,
    ),
    check("reports_not_own_duplicate_check", sql`${t.duplicateOfId} IS DISTINCT FROM ${t.id}`),
    check("reports_resolved_at_check", sql`(${t.status} = 'resolved') = (${t.resolvedAt} IS NOT NULL)`),
    check("reports_unit_needs_org_check", sql`${t.assignedUnitId} IS NULL OR ${t.assignedOrganizationId} IS NOT NULL`),
    check(
      "reports_location_range_check",
      sql`ST_X(${t.location}) BETWEEN -180 AND 180 AND ST_Y(${t.location}) BETWEEN -90 AND 90`,
    ),

    // Map viewport: `location && ST_MakeEnvelope(...)`. Queries must repeat `visibility = 'visible'`.
    index("reports_location_gist").using("gist", t.location).where(sql`${t.visibility} = 'visible'`),
    // `reports_location_geog_gist` (duplicate search in metres) is an expression index that
    // drizzle-kit can't express: it is hand-written in drizzle/0002_report_geography_index.sql.
    // Organization queue, oldest first, keyset pagination.
    index("reports_org_queue_idx").on(t.assignedOrganizationId, t.status, t.createdAt, t.id),
    // My reports.
    index("reports_reporter_idx").on(t.reporterId, t.createdAt.desc()),
    index("reports_duplicate_of_idx").on(t.duplicateOfId).where(sql`${t.duplicateOfId} IS NOT NULL`),
  ],
);

/** Append-only lifecycle history; the public timeline. Never updated or deleted by application code. */
export const reportStatusEvents = pgTable(
  "report_status_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    /** NULL for the creation event. */
    fromStatus: text("from_status", { enum: ["reported", "investigating", "in_progress", "resolved", "closed"] }),
    toStatus: text("to_status", { enum: ["reported", "investigating", "in_progress", "resolved", "closed"] }).notNull(),
    closureReason: text("closure_reason", { enum: ["duplicate", "invalid", "out_of_scope"] }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind", { enum: ["citizen", "org_staff", "org_manager", "admin", "system"] }).notNull(),
    /** The organization the actor acted for: the public timeline shows its name, not the person's. */
    actorOrganizationId: uuid("actor_organization_id").references(() => organizations.id, { onDelete: "set null" }),
    publicNote: text("public_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("report_status_events_report_idx").on(t.reportId, t.id),
    check(
      "report_status_events_from_check",
      sql`${t.fromStatus} IN ('reported','investigating','in_progress','resolved','closed')`,
    ),
    check(
      "report_status_events_to_check",
      sql`${t.toStatus} IN ('reported','investigating','in_progress','resolved','closed')`,
    ),
    check(
      "report_status_events_reason_check",
      sql`${t.closureReason} IN ('duplicate','invalid','out_of_scope')`,
    ),
    check(
      "report_status_events_actor_kind_check",
      sql`${t.actorKind} IN ('citizen','org_staff','org_manager','admin','system')`,
    ),
    check("report_status_events_note_check", sql`char_length(${t.publicNote}) <= 500`),
  ],
);

/**
 * Photos stored in R2. Up to three per report (positions 0–2), plus at most one completion photo
 * per status event (`status_event_id` set).
 *
 * A photo is uploaded before the report (or the status change) it belongs to exists: until then
 * `report_id` is NULL and only `uploaded_by` may see or attach it (src/server/photos.ts).
 */
export const reportImages = pgTable(
  "report_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL while the photo is uploaded but not yet attached. */
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    /** Set for a completion photo attached to a status change; NULL for the citizen's photos. */
    statusEventId: bigint("status_event_id", { mode: "number" }).references(() => reportStatusEvents.id, {
      onDelete: "cascade",
    }),
    /** R2 object key: photos/{id}.jpg */
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull().default("image/jpeg"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("report_images_report_position_key")
      .on(t.reportId, t.position)
      .where(sql`${t.statusEventId} IS NULL`),
    uniqueIndex("report_images_status_event_key")
      .on(t.statusEventId)
      .where(sql`${t.statusEventId} IS NOT NULL`),
    check("report_images_width_check", sql`${t.width} > 0`),
    check("report_images_height_check", sql`${t.height} > 0`),
    check("report_images_bytes_check", sql`${t.bytes} > 0`),
    check("report_images_position_check", sql`${t.position} BETWEEN 0 AND 2`),
  ],
);

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

/**
 * Photo bytes for a deployment that has no R2 bucket (src/server/photos.ts falls back to this
 * table). Keyed like an R2 object, so the rest of the code can't tell the two stores apart.
 */
export const photoBlobs = pgTable("photo_blobs", {
  storageKey: text("storage_key").primaryKey(),
  bytes: bytea("bytes").notNull(),
  createdAt: createdAt(),
});

/** One "me too" per user per report. */
export const reportConfirmations = pgTable(
  "report_confirmations",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.userId] }), index("report_confirmations_user_idx").on(t.userId)],
);

/** "Fixed" / "still broken" per user per resolution. Votes never change the official status. */
export const resolutionFeedback = pgTable(
  "resolution_feedback",
  {
    resolutionEventId: bigint("resolution_event_id", { mode: "number" })
      .notNull()
      .references(() => reportStatusEvents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verdict: text("verdict", { enum: ["fixed", "not_fixed"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.resolutionEventId, t.userId] }),
    check("resolution_feedback_verdict_check", sql`${t.verdict} IN ('fixed','not_fixed')`),
  ],
);

export const moderationFlags = pgTable(
  "moderation_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    flaggerId: text("flagger_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason", { enum: ["spam", "offensive", "personal_info", "not_infrastructure", "other"] }).notNull(),
    details: text("details"),
    status: text("status", { enum: ["open", "actioned", "dismissed"] }).notNull().default("open"),
    handledBy: text("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("moderation_flags_report_flagger_key").on(t.reportId, t.flaggerId),
    index("moderation_flags_open_idx").on(t.createdAt).where(sql`${t.status} = 'open'`),
    index("moderation_flags_report_idx").on(t.reportId),
    check(
      "moderation_flags_reason_check",
      sql`${t.reason} IN ('spam','offensive','personal_info','not_infrastructure','other')`,
    ),
    check("moderation_flags_status_check", sql`${t.status} IN ('open','actioned','dismissed')`),
    check("moderation_flags_details_check", sql`char_length(${t.details}) <= 500`),
    check("moderation_flags_handled_check", sql`(${t.status} = 'open') = (${t.handledAt} IS NULL)`),
  ],
);

/**
 * Admin, assignment, priority and moderation actions. Assignment history lives here
 * (`action = 'report.assign'`, metadata `{ organizationId, unitId }`), not in its own table.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. 'report.assign', 'report.priority', 'report.hide', 'categories.save'. */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);

/**
 * What a person is told about in the app (the bell): their report moved on, a report was
 * assigned to their organization, citizens say a fix didn't hold. Written in the same
 * transaction as the change it reports (src/server/notifications.ts).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'report.status', 'report.assigned', 'report.disputed', 'report.hidden', 'report.restored'. */
    type: text("type").notNull(),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }),
    /** What the text needs besides the report, e.g. `{ to: "resolved" }`. Never another person's identity. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt.desc())],
);

/** Fixed-window counters for write limits, e.g. key 'report.create:user:{id}'. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
