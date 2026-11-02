// Mirrors TRANSITIONS in the Architecture Package (section 8). Pure: no React, no storage.
import type { ClosureReason, Report, ReportStatus, User } from "../types";

type Needs = "staff" | "manager" | "admin";

export const TRANSITIONS: Record<ReportStatus, Partial<Record<ReportStatus, Needs>>> = {
  reported: { investigating: "staff", in_progress: "staff", resolved: "staff", closed: "manager" },
  investigating: { in_progress: "staff", resolved: "staff", closed: "manager" },
  in_progress: { resolved: "staff", closed: "manager" },
  resolved: { investigating: "manager" },
  closed: { reported: "admin" },
};

export type TransitionError =
  | "not_found"
  | "invalid_transition"
  | "note_required"
  | "reason_required"
  | "duplicate_required";

function hasRole(user: User, needs: Needs, orgId: string | undefined): boolean {
  if (user.role === "admin") return true;
  if (needs === "admin") return false;
  if (!orgId || user.organizationId !== orgId) return false;
  if (needs === "manager") return user.role === "org_manager";
  return user.role === "org_staff" || user.role === "org_manager";
}

/** Whether the user may act on this report at all (sees it in a console). */
export function canWorkOn(user: User, report: Pick<Report, "organizationId">): boolean {
  return hasRole(user, "staff", report.organizationId);
}

export function checkTransition(
  user: User,
  report: Pick<Report, "status" | "organizationId">,
  to: ReportStatus,
  input: { note?: string; closureReason?: ClosureReason; duplicateOfId?: string },
): TransitionError | null {
  const needs = TRANSITIONS[report.status][to];
  if (!needs) return "invalid_transition";
  if (!hasRole(user, needs, report.organizationId)) return "not_found";
  if (to === "closed" && !input.closureReason) return "reason_required";
  if (to === "closed" && input.closureReason === "duplicate" && !input.duplicateOfId)
    return "duplicate_required";
  if ((report.status === "resolved" || report.status === "closed") && !input.note?.trim())
    return "note_required";
  return null;
}

export interface TransitionOption {
  to: ReportStatus;
  allowed: boolean;
  /** Shown to staff for manager-only moves, so they know who to ask. */
  managerOnly: boolean;
}

/** Moves listed in the status select. Moves the role can't make are left out, except manager-only ones. */
export function transitionOptions(user: User, report: Pick<Report, "status" | "organizationId">) {
  const out: TransitionOption[] = [];
  for (const [to, needs] of Object.entries(TRANSITIONS[report.status]) as [ReportStatus, Needs][]) {
    const allowed = hasRole(user, needs, report.organizationId);
    if (allowed) out.push({ to, allowed, managerOnly: false });
    else if (needs === "manager" && hasRole(user, "staff", report.organizationId))
      out.push({ to, allowed: false, managerOnly: true });
  }
  return out;
}
