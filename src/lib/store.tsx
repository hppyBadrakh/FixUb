"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { PUBLIC_REFRESH_MS, useApi, useLiveApi } from "./api/hooks";
import type { ActivityResponse, CategoriesResponse, MeResponse, OrganizationsResponse, ReportsResponse, SessionUser, StaffResponse } from "./api/types";
import { authClient } from "./auth-client";
import { makeCatalog, type Catalog } from "./catalog";
import { storeActions, type StoreActions } from "./store-actions";
import type { AppState, Report, User } from "./types";

/** What this deployment offers (from GET /api/v1/me). */
export interface ServerInfo {
  /** Google sign-in is available. */
  google: boolean;
  /**
   * This is a demonstration deployment (DEMO_LOGIN=true on the server): the login page offers
   * one-click sample users, and screens say that the data is sample data.
   */
  demoLogin: boolean;
  /** New reports are only public once an admin has reviewed them. */
  reviewBeforePublic: boolean;
  /** The sample users the login page offers there; empty everywhere else. */
  sampleUsers: User[];
}

export type SignInResult = { ok: true } | { ok: false; message: string };

interface StoreValue {
  ready: boolean;
  /**
   * What the screens show, put together from `/api/v1`: what this user may see, re-read every
   * 15 s. The server decides what is in it; the screens only filter and sort.
   */
  state: AppState;
  /** Everything a screen can change: `await act.setPriority(…)`. See src/lib/store-actions.ts. */
  act: StoreActions;
  /** The signed-in user (the server's session), or null. */
  user: User | null;
  /** The user has accepted the notice about what a report makes public (`act.acceptTerms()`). */
  consented: boolean;
  server: ServerInfo;
  /** Sign in as one of the sample users. Only works where the server has DEMO_LOGIN=true. */
  signInAsSample: (userId: string) => Promise<SignInResult>;
  /** Start Google sign-in; the browser leaves the page. `next` is where to land afterwards. */
  signInWithGoogle: (next?: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** Reads everything from the server again. `act` does it itself after each write. */
  refresh: () => Promise<unknown>;
  /** Reports changed in the last ~1.6 s (by anyone) — for the highlight wash. */
  freshIds: ReadonlySet<string>;
  /** Category and subcategory lookups (the tree is editable by admins). */
  catalog: Catalog;
}

const StoreContext = createContext<StoreValue | null>(null);

/** The session's user in the screens' `User` shape: organization and unit by slug ("org-road"). */
function toUser(u: SessionUser): User {
  return { id: u.id, name: u.name, role: u.role, organizationId: u.organizationSlug ?? undefined, unitId: u.unitSlug ?? undefined };
}

function changedIds(prev: AppState, next: AppState): string[] {
  const before = new Map(prev.reports.map((r) => [r.id, r]));
  return next.reports
    .filter((r) => {
      const b = before.get(r.id);
      if (!b) return prev.reports.length > 0;
      if (b === r) return false;
      return (
        b.version !== r.version ||
        b.updatedAt !== r.updatedAt ||
        b.visibility !== r.visibility ||
        b.confirmations.length !== r.confirmations.length ||
        b.feedback.length !== r.feedback.length ||
        b.flags.length !== r.flags.length
      );
    })
    .map((r) => r.id);
}

/** Shown instead of the app when the server can't serve it at all. */
function Unavailable({ unreachable, onRetry }: { unreachable: boolean; onRetry: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-title-2 font-[650]">{unreachable ? "Сервертэй холбогдож чадсангүй" : "Сервер тохируулагдаагүй байна"}</h1>
      <p className="mt-2 text-body text-ink-muted">
        {unreachable
          ? "The server can't be reached. Check your connection and try again."
          : "This server has no database or sign-in secret configured (DATABASE_URL, BETTER_AUTH_SECRET). See the README."}
      </p>
      <button type="button" onClick={onRetry} className="mt-6 rounded-md border border-line-strong px-4 py-2 text-label font-[600]">
        Дахин оролдох / Try again
      </button>
    </main>
  );
}

export function FixubProvider({ children }: { children: React.ReactNode }) {
  // Who is signed in, and what the server offers. Re-checked when the tab regains focus, so
  // signing in or out in another tab shows up here too.
  const me = useApi<MeResponse>("/api/v1/me", { shouldRetryOnError: false });
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const flash = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setFreshIds((s) => new Set([...s, ...ids]));
    for (const id of ids) {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          setFreshIds((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
        }, 1600),
      );
    }
  }, []);

  const on = !!me.data?.configured;
  const server = useMemo<ServerInfo>(
    () => ({
      google: !!me.data?.google,
      demoLogin: !!me.data?.demoLogin,
      reviewBeforePublic: !!me.data?.reviewBeforePublic,
      sampleUsers: me.data?.sampleUsers ?? [],
    }),
    [me.data],
  );
  const sessionUser = me.data?.user ?? null;
  const user = useMemo<User | null>(() => (sessionUser ? toUser(sessionUser) : null), [sessionUser]);

  /* ---- The lists come from /api/v1 and are re-read every 15 s ---- */
  const role = user?.role;
  const isStaff = role === "org_staff" || role === "org_manager";
  // The consoles need every list fresh. For everyone else the big public list is re-read once a
  // minute (their own reports, below, stay at 15 s): most traffic is visitors looking at the map.
  const calm = role === "admin" || isStaff ? undefined : { refreshInterval: PUBLIC_REFRESH_MS };
  const publicReports = useLiveApi<ReportsResponse>(on ? "/api/v1/reports" : null, calm);
  const myReports = useLiveApi<ReportsResponse>(role ? "/api/v1/reports?mine=1" : null);
  const staffReports = useLiveApi<ReportsResponse>(isStaff ? "/api/v1/staff/reports" : null);
  const adminReports = useLiveApi<ReportsResponse>(role === "admin" ? "/api/v1/admin/reports" : null);
  const organizations = useLiveApi<OrganizationsResponse>(on ? "/api/v1/organizations" : null, calm);
  // Not polled: the categories editor reads the same data and must not change under the admin's hands.
  const categories = useApi<CategoriesResponse>(on ? "/api/v1/categories" : null);
  const staff = useApi<StaffResponse>(role === "admin" ? "/api/v1/admin/users" : null);
  // The activity feed exists only in the consoles: everything for admins, their own organization for staff.
  const activity = useLiveApi<ActivityResponse>(role === "admin" ? "/api/v1/admin/activity?limit=200" : isStaff ? "/api/v1/staff/activity?limit=200" : null);

  const state = useMemo<AppState>(() => {
    // Each list is what its endpoint lets this user see. A later list knows more about a report
    // (the reporter's own, the assigned staff's, the admin's), so it replaces the earlier entry.
    const byId = new Map<string, Report>();
    for (const list of [publicReports.data, myReports.data, staffReports.data, adminReports.data]) {
      for (const r of list?.reports ?? []) byId.set(r.id, r);
    }
    const reports = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
    return {
      reports,
      organizations: organizations.data?.organizations ?? [],
      categories: categories.data?.categories ?? [],
      users: staff.data?.users ?? [],
      activity: activity.data?.events ?? [],
    };
  }, [publicReports.data, myReports.data, staffReports.data, adminReports.data, organizations.data, categories.data, staff.data, activity.data]);

  // Rows that changed since the server's last answer are highlighted for a moment.
  const lastState = useRef<AppState | null>(null);
  useEffect(() => {
    const prev = lastState.current;
    lastState.current = state;
    if (prev) flash(changedIds(prev, state));
  }, [state, flash]);

  // Wait for the server's answers before rendering: otherwise consoles flash "sign in", or an
  // empty list, on every load.
  const answered = (list: { data?: unknown; error?: unknown }, needed = true) => !needed || list.data !== undefined || list.error !== undefined;
  const ready =
    on &&
    answered(publicReports) &&
    answered(organizations) &&
    answered(categories) &&
    answered(myReports, !!role) &&
    answered(staffReports, isStaff) &&
    answered(adminReports, role === "admin");

  // Reads everything from the server again: after a write, and when the signed-in user changes.
  const { mutate: mutateCache } = useSWRConfig();
  const refresh = useCallback(() => mutateCache((key) => typeof key === "string" && key.startsWith("/api/v1/")), [mutateCache]);
  const act = useMemo(() => storeActions(refresh), [refresh]);

  const signInAsSample = useCallback(
    async (id: string): Promise<SignInResult> => {
      const res = await authClient.$fetch("/demo/sign-in", { method: "POST", body: { userId: id } });
      if (res.error) return { ok: false, message: res.error.message ?? "Sign-in failed." };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );
  const signInWithGoogle = useCallback(async (next = "/"): Promise<SignInResult> => {
    const res = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login" });
    return res.error ? { ok: false, message: res.error.message ?? "Google sign-in failed." } : { ok: true };
  }, []);
  const signOut = useCallback(async () => {
    await authClient.signOut().catch(() => {});
    await refresh();
  }, [refresh]);

  const catalog = useMemo(() => makeCatalog(state.categories), [state.categories]);

  const value = useMemo<StoreValue>(
    () => ({ catalog, ready, state, act, user, consented: !!sessionUser?.consented, server, signInAsSample, signInWithGoogle, signOut, refresh, freshIds }),
    [ready, state, act, user, sessionUser, server, signInAsSample, signInWithGoogle, signOut, refresh, freshIds, catalog],
  );

  // No answer at all, or a server without a database: there is nothing to show.
  const unavailable = !me.isLoading && !on;
  return (
    <StoreContext.Provider value={value}>
      {unavailable ? <Unavailable unreachable={!me.data} onRetry={() => void me.mutate()} /> : children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore must be used inside FixubProvider");
  return v;
}

/** A clock that ticks so relative times ("5 min ago") stay current. */
export function useNow(intervalMs = 30_000): number {
  // Starts at 0 on the server; pages only render data after the store has its answers on the client.
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the clock on the client only
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
