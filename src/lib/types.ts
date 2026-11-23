/** Bilingual text. Mongolian (Cyrillic) is the primary language. */
export interface Bi {
  mn: string;
  en: string;
}

export type Lang = "mn" | "en";

export type ReportStatus = "reported" | "investigating" | "in_progress" | "resolved" | "closed";
export type ClosureReason = "duplicate" | "invalid" | "out_of_scope";
/** Category ids are data (admins can add categories), so they are plain strings. */
export type CategorySlug = string;

/** Icons an admin can choose for a category (mapped to Lucide icons in meta.ts). */
export type IconKey =
  | "road"
  | "footprints"
  | "lightbulb"
  | "trash"
  | "droplets"
  | "landmark"
  | "trees"
  | "signpost"
  | "zap"
  | "bus"
  | "ellipsis";

export interface SubcategoryDef {
  id: string;
  name: Bi;
}

export interface CategoryDef {
  id: CategorySlug;
  name: Bi;
  icon: IconKey;
  subcategories: SubcategoryDef[];
}

/** Set by an administrator after review; citizens never choose it. `null` = pending review. */
export type Priority = "low" | "medium" | "high" | "critical";
export type DistrictId =
  | "sukhbaatar"
  | "chingeltei"
  | "bayanzurkh"
  | "khan_uul"
  | "bayangol"
  | "songinokhairkhan";

export type Role = "citizen" | "admin" | "org_staff" | "org_manager";
export type ActorKind = "citizen" | "org_staff" | "org_manager" | "admin" | "system";
export type FlagReason = "spam" | "offensive" | "personal_info" | "not_infrastructure" | "other";
export type Verdict = "fixed" | "not_fixed";

export interface User {
  id: string;
  name: string;
  role: Role;
  organizationId?: string;
  unitId?: string;
}

export interface Unit {
  id: string;
  name: Bi;
}

export interface Organization {
  id: string;
  name: Bi;
  units: Unit[];
  /** Categories this organization is the suggested owner for (routing). */
  categories: CategorySlug[];
  isActive: boolean;
}

interface TimelineBase {
  id: string;
  at: number;
  actorKind: ActorKind;
  actorLabel: Bi;
}

export interface StatusTimelineEvent extends TimelineBase {
  type: "status";
  from: ReportStatus | null;
  to: ReportStatus;
  reason?: ClosureReason;
  note?: string;
  /** Optional completion photo attached by staff. */
  photoId?: string;
}

export interface AssignTimelineEvent extends TimelineBase {
  type: "assigned";
  organizationId: string;
  unitId?: string;
}

export type TimelineEvent = StatusTimelineEvent | AssignTimelineEvent;

export interface Flag {
  id: string;
  userId: string;
  reason: FlagReason;
  details?: string;
  at: number;
  status: "open" | "actioned" | "dismissed";
}

export interface Report {
  id: string;
  ref: string;
  category: CategorySlug;
  subcategory: string;
  /** Official priority, assigned by an admin. `null` while the report awaits review. */
  priority: Priority | null;
  priorityDecision?: { by: string; at: number; note?: string };
  description: string;
  descriptionEn?: string;
  addressHint: string;
  addressHintEn?: string;
  district: DistrictId;
  lng: number;
  lat: number;
  accuracyM?: number;
  status: ReportStatus;
  closureReason?: ClosureReason;
  duplicateOfId?: string;
  visibility: "visible" | "hidden";
  organizationId?: string;
  unitId?: string;
  reporterId: string | null;
  /** Idempotency key from the report form: a double submit creates one report. */
  clientRequestId?: string;
  photoIds: string[];
  confirmations: string[];
  feedback: { userId: string; verdict: Verdict }[];
  flags: Flag[];
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
  version: number;
  timeline: TimelineEvent[];
}

export type ActivityType =
  | "created"
  | "assigned"
  | "status"
  | "confirmed"
  | "disputed"
  | "flagged"
  | "hidden"
  | "restored"
  | "prioritized";

export interface ActivityEvent {
  id: string;
  at: number;
  reportId: string;
  type: ActivityType;
  to?: ReportStatus;
  reason?: ClosureReason;
  priority?: Priority;
  actorLabel?: Bi;
  organizationId?: string;
}

/** What the screens show: the part of the data this user may see (see src/lib/store.tsx). */
export interface AppState {
  reports: Report[];
  organizations: Organization[];
  categories: CategoryDef[];
  /** For admins: who works for which organization. Empty for everyone else. */
  users: User[];
  activity: ActivityEvent[];
}

/** The sample data set (src/lib/data/seed.ts), which `npm run db:seed` loads into Postgres. */
export interface DemoState extends AppState {
  schema: 2;
  seededAt: number;
  seq: number;
}

export interface LngLat {
  lng: number;
  lat: number;
}
