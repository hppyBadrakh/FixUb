"use client";

// Everything a screen can change, as `useStore().act`. A screen calls one function and gets
// `{ ok: true, … }` or `{ ok: false, error }`; it doesn't know where the data lives:
//
// - with a database: the server action (src/server/actions/*), then the lists are read again;
// - without one (the browser-only demo): the pure function in src/lib/domain/actions.ts.
//
//   const res = await act.setPriority(report.id, "high", note);
//   if (!res.ok) toast(errorText(res.error));
import { moderateReport, undoModeration } from "@/server/actions/moderation";
import { saveOrganization as saveOrganizationOnServer } from "@/server/actions/organizations";
import { assignReport as assignOnServer, changeStatus as changeStatusOnServer, setPriority as setPriorityOnServer } from "@/server/actions/reports-admin";
import {
  createReport as createReportOnServer,
  flagReport as flagOnServer,
  setVerdict as setVerdictOnServer,
  toggleMeToo as toggleMeTooOnServer,
} from "@/server/actions/reports-citizen";
import type { ActionResult } from "@/server/action";
import type { ErrorCode } from "@/server/errors";
import { uploadPhoto } from "./api/photos";
import { putPhoto } from "./data/photoStore";
import * as demo from "./domain/actions";
import type { DemoState, FlagReason, Organization, Priority, Report, User, Verdict } from "./types";

export type ActResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

export interface StoreActions {
  createReport(input: demo.CreateReportInput): Promise<ActResult<{ report: Pick<Report, "id" | "ref"> }>>;
  toggleMeToo(reportId: string): Promise<ActResult>;
  /** `null` takes the answer back. */
  setVerdict(reportId: string, verdict: Verdict | null): Promise<ActResult>;
  flagReport(reportId: string, reason: FlagReason, details: string): Promise<ActResult<{ autoHidden: boolean }>>;
  setPriority(reportId: string, priority: Priority, note: string): Promise<ActResult>;
  assignReport(reportId: string, organizationId: string, unitId?: string): Promise<ActResult>;
  changeStatus(reportId: string, input: demo.ChangeStatusInput): Promise<ActResult>;
  /** `undo()` puts the report back exactly as it was before this call. */
  moderate(reportId: string, action: "hide" | "restore" | "dismiss"): Promise<ActResult<{ undo: () => Promise<void> }>>;
  saveOrganization(organization: Organization): Promise<ActResult>;
  /** Stores a photo from the camera and returns its id (for `photoIds` / `photoId`). Throws if it can't. */
  savePhoto(blob: Blob): Promise<string>;
}

type Run = <T>(action: (s: DemoState, user: User | null, now: number) => demo.ActionResult<T>) => demo.ActionResult<T>;

/** The browser-only demo: the pure functions, applied to the state in localStorage. */
export function demoActions(run: Run): StoreActions {
  // Drops the demo's `state` from a result: screens read state from the store.
  const plain = <T extends object>(res: demo.ActionResult<T>): ActResult<Omit<T, "state">> => {
    if (!res.ok) return res;
    const rest: Partial<typeof res> = { ...res };
    delete rest.state;
    return rest as { ok: true } & Omit<T, "state">;
  };
  return {
    createReport: async (input) => plain(run((s, u, n) => demo.createReport(s, u, input, n))),
    toggleMeToo: async (id) => plain(run((s, u, n) => demo.toggleMeToo(s, u, id, n))),
    setVerdict: async (id, verdict) => plain(run((s, u, n) => demo.setVerdict(s, u, id, verdict, n))),
    flagReport: async (id, reason, details) => plain(run((s, u, n) => demo.flagReport(s, u, id, reason, details, n))),
    setPriority: async (id, priority, note) => plain(run((s, u, n) => demo.setPriority(s, u, id, priority, note, n))),
    assignReport: async (id, organizationId, unitId) => plain(run((s, u, n) => demo.assignReport(s, u, id, organizationId, unitId, n))),
    changeStatus: async (id, input) => plain(run((s, u, n) => demo.changeStatus(s, u, id, input, n))),
    moderate: async (id, action) => {
      let snapshot: Report | undefined;
      const res = plain(
        run((s, u, n) => {
          snapshot = s.reports.find((r) => r.id === id);
          return demo.moderate(s, u, id, action, n);
        }),
      );
      if (!res.ok) return res;
      const before = snapshot as Report | undefined;
      return {
        ok: true,
        undo: async () => {
          if (before) run((s, u) => demo.restoreSnapshot(s, u, before));
        },
      };
    },
    saveOrganization: async (organization) => plain(run((s, u) => demo.upsertOrganization(s, u, organization))),
    savePhoto: putPhoto,
  };
}

/** Rule codes the schemas report as a field message; screens have a text for each. */
const FIELD_CODES: ErrorCode[] = ["out_of_area", "description_length", "photo_required", "too_many_photos"];

/** The real app: server actions. After each successful one, `refresh` reads the lists again. */
export function serverActions(refresh: () => Promise<unknown>): StoreActions {
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
    createReport: (input) => call(() => createReportOnServer(input)),
    toggleMeToo: (reportId) => call(() => toggleMeTooOnServer({ reportId })),
    setVerdict: (reportId, verdict) => call(() => setVerdictOnServer({ reportId, verdict })),
    flagReport: (reportId, reason, details) => call(() => flagOnServer({ reportId, reason, details })),
    setPriority: (reportId, priority, note) => call(() => setPriorityOnServer({ reportId, priority, note })),
    assignReport: (reportId, organizationId, unitId) => call(() => assignOnServer({ reportId, organizationId, unitId })),
    changeStatus: (reportId, { expectedVersion, ...input }) => call(() => changeStatusOnServer({ reportId, version: expectedVersion, ...input })),
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
    saveOrganization: (organization) => call(() => saveOrganizationOnServer({ organization })),
    savePhoto: async (blob) => (await uploadPhoto(blob)).id,
  };
}
