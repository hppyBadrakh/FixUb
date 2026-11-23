// Pure state transitions for the demo. Each takes the current state and the acting user and
// returns a new state or an error code. A real API would run the same rules on the server.
import { LIMITS, OPEN_STATUSES, ROLE_LABEL } from "../meta";
import type {
  ActivityEvent,
  Bi,
  CategoryDef,
  CategorySlug,
  ClosureReason,
  DemoState,
  DistrictId,
  FlagReason,
  Organization,
  Priority,
  Report,
  ReportStatus,
  StatusTimelineEvent,
  User,
  Verdict,
} from "../types";
import { distanceM, inServiceArea } from "./geo";
import type { ActionError } from "./errors";
import { checkTransition } from "./lifecycle";
import { checkCategoryTree, makeRef, tally } from "./rules";
import { uid } from "../id";

// Moved to ./errors, ./rules and ../id so the server does not import the demo's actions.
// Re-exported here so existing imports keep working.
export type { ActionError } from "./errors";
export { checkCategoryTree, makeRef, tally } from "./rules";
export { uid } from "../id";

export type ActionResult<T = object> =
  | ({ ok: true; state: DemoState } & T)
  | { ok: false; error: ActionError };

const err = (error: ActionError) => ({ ok: false as const, error });

export function actorKindOf(user: User) {
  return user.role;
}

export function actorLabelOf(state: DemoState, user: User): Bi {
  if (user.role === "citizen") return ROLE_LABEL.citizen;
  if (user.role === "admin") return { mn: "FixUB баг", en: "FixUB team" };
  const org = state.organizations.find((o) => o.id === user.organizationId);
  return org ? org.name : ROLE_LABEL[user.role];
}

function withReport(state: DemoState, id: string, fn: (r: Report) => Report): DemoState {
  return { ...state, reports: state.reports.map((r) => (r.id === id ? fn(r) : r)) };
}

function addActivity(state: DemoState, ev: Omit<ActivityEvent, "id">): DemoState {
  return { ...state, activity: [{ id: uid("a"), ...ev }, ...state.activity].slice(0, 400) };
}

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
  clientRequestId: string;
}

export function createReport(
  state: DemoState,
  user: User | null,
  input: CreateReportInput,
  now: number,
): ActionResult<{ report: Report }> {
  if (!user) return err("signed_out");
  const existing = state.reports.find(
    (r) => r.reporterId === user.id && r.clientRequestId === input.clientRequestId,
  );
  if (existing) return { ok: true, state, report: existing };
  const desc = input.description.trim();
  if (desc.length < LIMITS.descriptionMin || desc.length > LIMITS.descriptionMax)
    return err("description_length");
  if (!inServiceArea(input)) return err("out_of_area");
  const cat = state.categories.find((c) => c.id === input.category);
  if (!cat || !cat.subcategories.some((x) => x.id === input.subcategory)) return err("invalid_category");
  // A newly captured photo is part of every citizen report (camera-first flow).
  if (input.photoIds.length < 1) return err("photo_required");
  if (input.photoIds.length > LIMITS.photosMax) return err("too_many_photos");

  const seq = state.seq + 1;
  const id = uid("r");
  const report: Report = {
    id,
    ref: makeRef(seq, now),
    category: input.category,
    subcategory: input.subcategory,
    // Priority is never set by the citizen: it waits for an admin's review.
    priority: null,
    description: desc,
    addressHint: input.addressHint.trim(),
    district: input.district,
    lng: input.lng,
    lat: input.lat,
    accuracyM: input.accuracyM,
    status: "reported",
    visibility: "visible",
    reporterId: user.id,
    clientRequestId: input.clientRequestId,
    photoIds: input.photoIds,
    confirmations: [],
    feedback: [],
    flags: [],
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    version: 1,
    timeline: [
      {
        id: uid("t"),
        type: "status",
        from: null,
        to: "reported",
        at: now,
        actorKind: "citizen",
        actorLabel: ROLE_LABEL.citizen,
      },
    ],
  };
  let next: DemoState = { ...state, seq, reports: [report, ...state.reports] };
  next = addActivity(next, { at: now, reportId: id, type: "created" });
  return { ok: true, state: next, report };
}

export function assignReport(
  state: DemoState,
  user: User | null,
  reportId: string,
  organizationId: string,
  unitId: string | undefined,
  now: number,
): ActionResult {
  if (!user || user.role !== "admin") return err("forbidden");
  const report = state.reports.find((r) => r.id === reportId);
  const org = state.organizations.find((o) => o.id === organizationId);
  if (!report || !org) return err("not_found");
  if (unitId && !org.units.some((u) => u.id === unitId)) return err("invalid_input");
  let next = withReport(state, reportId, (r) => ({
    ...r,
    organizationId,
    unitId,
    updatedAt: now,
    version: r.version + 1,
    timeline: [
      ...r.timeline,
      {
        id: uid("t"),
        type: "assigned",
        at: now,
        organizationId,
        unitId,
        actorKind: "admin",
        actorLabel: actorLabelOf(state, user),
      },
    ],
  }));
  next = addActivity(next, { at: now, reportId, type: "assigned", organizationId });
  return { ok: true, state: next };
}

export interface ChangeStatusInput {
  to: ReportStatus;
  note?: string;
  closureReason?: ClosureReason;
  duplicateOfId?: string;
  photoId?: string;
  expectedVersion: number;
}

export function changeStatus(
  state: DemoState,
  user: User | null,
  reportId: string,
  input: ChangeStatusInput,
  now: number,
): ActionResult {
  if (!user) return err("signed_out");
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return err("not_found");
  const problem = checkTransition(user, report, input.to, input);
  if (problem) return err(problem);
  if (report.version !== input.expectedVersion) return err("conflict");
  if (input.closureReason === "duplicate") {
    const target = state.reports.find((r) => r.id === input.duplicateOfId);
    if (!target || target.id === report.id || target.status === "closed" || target.visibility !== "visible")
      return err("duplicate_required");
  }
  const ev: StatusTimelineEvent = {
    id: uid("t"),
    type: "status",
    from: report.status,
    to: input.to,
    at: now,
    actorKind: actorKindOf(user),
    actorLabel: actorLabelOf(state, user),
    note: input.note?.trim() || undefined,
    reason: input.to === "closed" ? input.closureReason : undefined,
    photoId: input.photoId,
  };
  let next = withReport(state, reportId, (r) => ({
    ...r,
    status: input.to,
    closureReason: input.to === "closed" ? input.closureReason : undefined,
    duplicateOfId: input.to === "closed" && input.closureReason === "duplicate" ? input.duplicateOfId : undefined,
    // A new resolution starts a fresh round of citizen verdicts.
    feedback: input.to === "resolved" ? [] : r.feedback,
    statusChangedAt: now,
    updatedAt: now,
    version: r.version + 1,
    timeline: [...r.timeline, ev],
  }));
  next = addActivity(next, {
    at: now,
    reportId,
    type: "status",
    to: input.to,
    reason: ev.reason,
    actorLabel: ev.actorLabel,
  });
  return { ok: true, state: next };
}

export function toggleMeToo(state: DemoState, user: User | null, reportId: string, now: number): ActionResult {
  if (!user) return err("signed_out");
  const report = state.reports.find((r) => r.id === reportId);
  if (!report || report.visibility !== "visible") return err("not_found");
  if (report.reporterId === user.id) return err("own_report");
  const mine = report.confirmations.includes(user.id);
  if (!mine && !OPEN_STATUSES.includes(report.status)) return err("not_open");
  let next = withReport(state, reportId, (r) => ({
    ...r,
    confirmations: mine ? r.confirmations.filter((u) => u !== user.id) : [...r.confirmations, user.id],
  }));
  if (!mine) next = addActivity(next, { at: now, reportId, type: "confirmed" });
  return { ok: true, state: next };
}

export function setVerdict(
  state: DemoState,
  user: User | null,
  reportId: string,
  verdict: Verdict | null,
  now: number,
): ActionResult {
  if (!user) return err("signed_out");
  const report = state.reports.find((r) => r.id === reportId);
  if (!report || report.visibility !== "visible") return err("not_found");
  if (report.status !== "resolved") return err("not_resolved");
  const before = tally(report.feedback);
  const feedback = report.feedback.filter((f) => f.userId !== user.id);
  if (verdict) feedback.push({ userId: user.id, verdict });
  let next = withReport(state, reportId, (r) => ({ ...r, feedback }));
  const after = tally(feedback);
  if (before.notFixed <= before.fixed && after.notFixed > after.fixed)
    next = addActivity(next, { at: now, reportId, type: "disputed" });
  return { ok: true, state: next };
}

export function flagReport(
  state: DemoState,
  user: User | null,
  reportId: string,
  reason: FlagReason,
  details: string,
  now: number,
): ActionResult<{ autoHidden: boolean }> {
  if (!user) return err("signed_out");
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return err("not_found");
  if (report.flags.some((f) => f.userId === user.id)) return err("already_flagged");
  const flags = [...report.flags, { id: uid("f"), userId: user.id, reason, details: details.trim() || undefined, at: now, status: "open" as const }];
  const autoHidden =
    report.visibility === "visible" && flags.filter((f) => f.status === "open").length >= LIMITS.autoHideFlags;
  let next = withReport(state, reportId, (r) => ({
    ...r,
    flags,
    visibility: autoHidden ? "hidden" : r.visibility,
  }));
  next = addActivity(next, { at: now, reportId, type: "flagged" });
  if (autoHidden)
    next = addActivity(next, { at: now, reportId, type: "hidden", actorLabel: { mn: "Систем", en: "System" } });
  return { ok: true, state: next, autoHidden };
}

/** Admin moderation. `hide` actions open flags; `restore` and `dismiss` dismiss them. */
export function moderate(
  state: DemoState,
  user: User | null,
  reportId: string,
  action: "hide" | "restore" | "dismiss",
  now: number,
): ActionResult {
  if (!user || user.role !== "admin") return err("forbidden");
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return err("not_found");
  const flagStatus = action === "hide" ? "actioned" : "dismissed";
  let next = withReport(state, reportId, (r) => ({
    ...r,
    visibility: action === "hide" ? "hidden" : "visible",
    flags: r.flags.map((f) => (f.status === "open" ? { ...f, status: flagStatus } : f)),
    updatedAt: now,
  }));
  if (action !== "dismiss")
    next = addActivity(next, {
      at: now,
      reportId,
      type: action === "hide" ? "hidden" : "restored",
      actorLabel: actorLabelOf(state, user),
    });
  return { ok: true, state: next };
}

/** Restores a report exactly as it was (used by Undo after a moderation action). */
export function restoreSnapshot(state: DemoState, user: User | null, snapshot: Report): ActionResult {
  if (!user || user.role !== "admin") return err("forbidden");
  return { ok: true, state: withReport(state, snapshot.id, () => snapshot) };
}

/** Admin-only: set or change the official priority, with an optional internal note. */
export function setPriority(
  state: DemoState,
  user: User | null,
  reportId: string,
  priority: Priority,
  note: string,
  now: number,
): ActionResult {
  if (!user || user.role !== "admin") return err("forbidden");
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return err("not_found");
  let next = withReport(state, reportId, (r) => ({
    ...r,
    priority,
    priorityDecision: { by: user.name, at: now, note: note.trim() || undefined },
    updatedAt: now,
  }));
  next = addActivity(next, { at: now, reportId, type: "prioritized", priority, actorLabel: actorLabelOf(state, user) });
  return { ok: true, state: next };
}

/**
 * Admin-only: replace the category tree. Categories and subcategories that reports still use
 * can't be removed (renaming and reordering are always fine).
 */
export function saveCategories(
  state: DemoState,
  user: User | null,
  categories: CategoryDef[],
): ActionResult<{ blocked?: string }> {
  if (!user || user.role !== "admin") return err("forbidden");
  const problem = checkCategoryTree(categories);
  if (problem) return err(problem);
  const ids = new Set(categories.map((c) => c.id));
  for (const r of state.reports) {
    const c = categories.find((x) => x.id === r.category);
    if (!c || !c.subcategories.some((x) => x.id === r.subcategory)) return err("in_use");
  }
  const organizations = state.organizations.map((o) => ({ ...o, categories: o.categories.filter((id) => ids.has(id)) }));
  return { ok: true, state: { ...state, categories, organizations } };
}

export function upsertOrganization(state: DemoState, user: User | null, org: Organization): ActionResult {
  if (!user || user.role !== "admin") return err("forbidden");
  if (!org.name.mn.trim() || !org.name.en.trim()) return err("invalid_input");
  // A category has exactly one suggested owner: claiming it removes it from other organizations.
  const others = state.organizations
    .filter((o) => o.id !== org.id)
    .map((o) => ({ ...o, categories: o.categories.filter((c) => !org.categories.includes(c)) }));
  const exists = state.organizations.some((o) => o.id === org.id);
  const organizations = exists
    ? state.organizations.map((o) => (o.id === org.id ? org : others.find((x) => x.id === o.id)!))
    : [...others, org];
  return { ok: true, state: { ...state, organizations } };
}

export function findDuplicateCandidates(
  state: DemoState,
  p: { lng: number; lat: number; category: CategorySlug },
  now: number,
) {
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
