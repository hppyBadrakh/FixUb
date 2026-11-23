"use client";

// Everything a screen can change, as `useStore().act`. A screen calls one function and gets
// `{ ok: true, … }` or `{ ok: false, error }`. Each one calls its server action
// (src/server/actions/*) and then reads the lists again, so the screen shows the result.
//
//   const res = await act.setPriority(report.id, "high", note);
//   if (!res.ok) toast(errorText(res.error));
import type { ActionResult } from "@/server/action";
import { moderateReport, undoModeration } from "@/server/actions/moderation";
import { saveOrganization } from "@/server/actions/organizations";
import { assignReport, changeStatus, setPriority } from "@/server/actions/reports-admin";
import { createReport, flagReport, setVerdict, toggleMeToo } from "@/server/actions/reports-citizen";
import type { ErrorCode } from "@/server/errors";
import { uploadPhoto } from "./api/photos";
import type { ChangeStatusInput, CreateReportInput } from "./domain/rules";
import type { FlagReason, Organization, Priority, Report, Verdict } from "./types";

export type ActResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

export interface StoreActions {
  createReport(input: CreateReportInput): Promise<ActResult<{ report: Pick<Report, "id" | "ref"> }>>;
  toggleMeToo(reportId: string): Promise<ActResult>;
  /** `null` takes the answer back. */
  setVerdict(reportId: string, verdict: Verdict | null): Promise<ActResult>;
  flagReport(reportId: string, reason: FlagReason, details: string): Promise<ActResult<{ autoHidden: boolean }>>;
  setPriority(reportId: string, priority: Priority, note: string): Promise<ActResult>;
  assignReport(reportId: string, organizationId: string, unitId?: string): Promise<ActResult>;
  changeStatus(reportId: string, input: ChangeStatusInput): Promise<ActResult>;
  /** `undo()` puts the report back exactly as it was before this call. */
  moderate(reportId: string, action: "hide" | "restore" | "dismiss"): Promise<ActResult<{ undo: () => Promise<void> }>>;
  saveOrganization(organization: Organization): Promise<ActResult>;
  /** Stores a photo from the camera and returns its id (for `photoIds` / `photoId`). Throws if it can't. */
  savePhoto(blob: Blob): Promise<string>;
}

/** Rule codes the schemas report as a field message; screens have a text for each. */
const FIELD_CODES: ErrorCode[] = ["out_of_area", "description_length", "photo_required", "too_many_photos"];

/** `refresh` reads the lists again after a successful write. */
export function storeActions(refresh: () => Promise<unknown>): StoreActions {
  async function call<T extends object>(action: () => Promise<ActionResult<T>>): Promise<ActResult<T>> {
    let res: ActionResult<T>;
    try {
      res = await action();
    } catch {
      // The request never got an answer (offline, the server is down).
      return { ok: false, error: "internal" };
    }
    if (!res.ok) {
      const fieldCode = Object.values(res.fieldErrors ?? {})
        .flat()
        .find((message): message is ErrorCode => FIELD_CODES.includes(message as ErrorCode));
      return { ok: false, error: res.error === "invalid_input" && fieldCode ? fieldCode : res.error };
    }
    await refresh();
    return res;
  }
  return {
    createReport: (input) => call(() => createReport(input)),
    toggleMeToo: (reportId) => call(() => toggleMeToo({ reportId })),
    setVerdict: (reportId, verdict) => call(() => setVerdict({ reportId, verdict })),
    flagReport: (reportId, reason, details) => call(() => flagReport({ reportId, reason, details })),
    setPriority: (reportId, priority, note) => call(() => setPriority({ reportId, priority, note })),
    assignReport: (reportId, organizationId, unitId) => call(() => assignReport({ reportId, organizationId, unitId })),
    changeStatus: (reportId, { expectedVersion, ...input }) => call(() => changeStatus({ reportId, version: expectedVersion, ...input })),
    moderate: async (reportId, action) => {
      const res = await call(() => moderateReport({ reportId, action }));
      if (!res.ok) return res;
      return {
        ok: true,
        undo: async () => {
          await call(() => undoModeration(res.undo));
        },
      };
    },
    saveOrganization: (organization) => call(() => saveOrganization({ organization })),
    savePhoto: async (blob) => (await uploadPhoto(blob)).id,
  };
}
