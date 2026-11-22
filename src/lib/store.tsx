"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useApi, useLiveApi } from "./api/hooks";
import type { CategoriesResponse, MeResponse, OrganizationsResponse, ReportsResponse, SessionUser, StaffResponse } from "./api/types";
import { authClient } from "./auth-client";
import { makeCatalog, type Catalog } from "./catalog";
import type { ActionResult } from "./domain/actions";
import { clearPhotos } from "./data/photoStore";
import { createLocalRepository, type FixubRepository } from "./data/repository";
import { demoActions, serverActions, type StoreActions } from "./store-actions";
import type { ActivityEvent, DemoState, Report, User } from "./types";

/** What the server offers. Without a database (`configured: false`) the app is the browser-only demo. */
export interface ServerInfo {
  /** A database and sign-in are set up: the session comes from the server, and `/api/v1` works. */
  configured: boolean;
  /** Google sign-in is available. */
  google: boolean;
  /** The demo role picker is enabled on the server (DEMO_LOGIN=true). */
  demoLogin: boolean;
  /** The server could not be reached or failed; the app fell back to the browser-only demo. */
  unreachable: boolean;
}

export type SignInResult = { ok: true } | { ok: false; message: string };

interface StoreValue {
  ready: boolean;
  /**
   * What the screens show. With a server it is put together from `/api/v1` (what this user may
   * see, re-read every 15 s); without one it is the demo data in this browser.
   */
  state: DemoState;
  /** Everything a screen can change: `await act.setPriority(…)`. See src/lib/store-actions.ts. */
  act: StoreActions;
  /**
   * The signed-in user. With a server it is the server's session (Google or demo login);
   * without one it is the demo persona chosen in this browser.
   */
  user: User | null;
  server: ServerInfo;
  /** Sign in as a demo persona. With a server this creates a real session (needs DEMO_LOGIN=true). */
  signIn: (userId: string) => Promise<SignInResult>;
  /** Start Google sign-in; the browser leaves the page. `next` is where to land afterwards. */
  signInWithGoogle: (next?: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** Browser-only demo: apply a pure action to the local state. Screens use `act` instead. */
  run: <T>(action: (s: DemoState, user: User | null, now: number) => ActionResult<T>) => ActionResult<T>;
  reset: () => Promise<void>;
  /** Reports changed in the last ~1.6 s (here or in another tab) — for the highlight wash. */
  freshIds: ReadonlySet<string>;
  /** Category and subcategory lookups (the tree is editable by admins). */
  catalog: Catalog;
}

const EMPTY: DemoState = { schema: 2, seededAt: 0, seq: 0, reports: [], organizations: [], categories: [], users: [], activity: [] };
const SESSION_KEY = "fixub-session";
const StoreContext = createContext<StoreValue | null>(null);

function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(id: string | null) {
  try {
    for (const s of [window.sessionStorage, window.localStorage]) {
      if (id) s.setItem(SESSION_KEY, id);
      else s.removeItem(SESSION_KEY);
    }
  } catch {}
}

const NO_SERVER: ServerInfo = { configured: false, google: false, demoLogin: false, unreachable: false };

/**
 * The server's user in the demo's `User` shape. Organization and unit use their slugs
 * ("org-road"), because those are the ids in the demo data that unconverted screens still read.
 */
function toDemoUser(u: SessionUser): User {
  return { id: u.id, name: u.name, role: u.role, organizationId: u.organizationSlug ?? undefined, unitId: u.unitSlug ?? undefined };
}

/**
 * The activity feed, read off the reports' timelines: created, assigned, status changes and
 * priority decisions, newest first.
 */
function activityFrom(reports: Report[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const r of reports) {
    for (const e of r.timeline) {
      const base = { id: `${r.id}:${e.id}`, at: e.at, reportId: r.id, actorLabel: e.actorLabel };
      if (e.type === "assigned") out.push({ ...base, type: "assigned", organizationId: e.organizationId });
      else if (e.from === null) out.push({ ...base, type: "created", actorLabel: undefined });
      else out.push({ ...base, type: "status", to: e.to, reason: e.reason });
    }
    if (r.priority && r.priorityDecision) {
      out.push({ id: `${r.id}:priority`, at: r.priorityDecision.at, reportId: r.id, type: "prioritized", priority: r.priority, actorLabel: { mn: "FixUB баг", en: "FixUB team" } });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 400);
}

function changedIds(prev: DemoState, next: DemoState): string[] {
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

export function FixubProvider({ children }: { children: React.ReactNode }) {
  const repoRef = useRef<FixubRepository | null>(null);
  const stateRef = useRef<DemoState>(EMPTY);
  const [state, setState] = useState<DemoState>(EMPTY);
  const [userId, setUserId] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  // Who is signed in on the server, and what it supports. Re-checked when the tab regains focus,
  // so signing in or out in another tab shows up here too.
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

  useEffect(() => {
    const repo = createLocalRepository();
    repoRef.current = repo;
    const initial = repo.load();
    stateRef.current = initial;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from browser storage after mount */
    setState(initial);
    setUserId(readSession());
    setLocalReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    return repo.subscribe((next) => {
      const ids = changedIds(stateRef.current, next);
      stateRef.current = next;
      setState(next);
      flash(ids);
    });
  }, [flash]);

  const server = useMemo<ServerInfo>(() => {
    if (me.data?.configured) return { configured: true, google: me.data.google, demoLogin: me.data.demoLogin, unreachable: false };
    return me.error ? { ...NO_SERVER, unreachable: true } : NO_SERVER;
  }, [me.data, me.error]);
  const serverUser = me.data?.configured ? me.data.user : null;
  const user = useMemo<User | null>(
    () => (server.configured ? (serverUser ? toDemoUser(serverUser) : null) : (state.users.find((u) => u.id === userId) ?? null)),
    [server.configured, serverUser, state.users, userId],
  );
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /* ---- With a server: the lists come from /api/v1 and are re-read every 15 s ---- */
  const on = server.configured;
  const role = on ? user?.role : undefined;
  const isStaff = role === "org_staff" || role === "org_manager";
  const publicReports = useLiveApi<ReportsResponse>(on ? "/api/v1/reports" : null);
  const myReports = useLiveApi<ReportsResponse>(role ? "/api/v1/reports?mine=1" : null);
  const staffReports = useLiveApi<ReportsResponse>(isStaff ? "/api/v1/staff/reports" : null);
  const adminReports = useLiveApi<ReportsResponse>(role === "admin" ? "/api/v1/admin/reports" : null);
  const organizations = useLiveApi<OrganizationsResponse>(on ? "/api/v1/organizations" : null);
  // Not polled: the categories editor reads the same data and must not change under the admin's hands.
  const categories = useApi<CategoriesResponse>(on ? "/api/v1/categories" : null);
  const staff = useApi<StaffResponse>(role === "admin" ? "/api/v1/admin/users" : null);

  const serverState = useMemo<DemoState>(() => {
    // Each list is what its endpoint lets this user see. A later list knows more about a report
    // (the reporter's own, the assigned staff's, the admin's), so it replaces the earlier entry.
    const byId = new Map<string, Report>();
    for (const list of [publicReports.data, myReports.data, staffReports.data, adminReports.data]) {
      for (const r of list?.reports ?? []) byId.set(r.id, r);
    }
    const reports = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
    // The demo personas (for the role picker) plus, for admins, who works where.
    const users = new Map([...state.users, ...(staff.data?.users ?? [])].map((u) => [u.id, u]));
    return {
      schema: 2,
      seededAt: 0,
      seq: 0,
      reports,
      organizations: organizations.data?.organizations ?? [],
      categories: categories.data?.categories ?? [],
      users: [...users.values()],
      activity: activityFrom(reports),
    };
  }, [publicReports.data, myReports.data, staffReports.data, adminReports.data, organizations.data, categories.data, staff.data, state.users]);
  const shown = on ? serverState : state;

  // Rows that changed since the last answer of the server get the same highlight as in the demo.
  const lastShown = useRef<DemoState | null>(null);
  useEffect(() => {
    if (!on) return;
    const prev = lastShown.current;
    lastShown.current = serverState;
    if (prev) flash(changedIds(prev, serverState));
  }, [on, serverState, flash]);

  // Wait for the server's answers before rendering: otherwise consoles flash "sign in", or an
  // empty list, on every load.
  const answered = (list: { data?: unknown; error?: unknown }, needed = true) => !needed || list.data !== undefined || list.error !== undefined;
  const ready =
    localReady &&
    !me.isLoading &&
    (!on ||
      (answered(publicReports) &&
        answered(organizations) &&
        answered(categories) &&
        answered(myReports, !!role) &&
        answered(staffReports, isStaff) &&
        answered(adminReports, role === "admin")));

  const run = useCallback(
    <T,>(action: (s: DemoState, user: User | null, now: number) => ActionResult<T>) => {
      const current = stateRef.current;
      const result = action(current, userRef.current, Date.now());
      if (result.ok && result.state !== current) {
        const ids = changedIds(current, result.state);
        stateRef.current = result.state;
        repoRef.current?.save(result.state);
        setState(result.state);
        flash(ids);
      }
      return result;
    },
    [flash],
  );

  // Reads everything from the server again: after a write, and when the signed-in user changes.
  const { mutate: mutateCache } = useSWRConfig();
  const refresh = useCallback(() => mutateCache((key) => typeof key === "string" && key.startsWith("/api/v1/")), [mutateCache]);
  const refreshSession = refresh;
  // eslint-disable-next-line react-hooks/refs -- `run` reads its refs when an action is called (an event handler), never during render
  const act = useMemo(() => (on ? serverActions(refresh) : demoActions(run)), [on, refresh, run]);
  const signIn = useCallback(
    async (id: string): Promise<SignInResult> => {
      if (server.configured) {
        const res = await authClient.$fetch("/demo/sign-in", { method: "POST", body: { userId: id } });
        if (res.error) return { ok: false, message: res.error.message ?? "Demo sign-in failed." };
        await refreshSession();
      }
      // Kept in step with the server session, so the browser-only demo has the same persona.
      writeSession(id);
      setUserId(id);
      return { ok: true };
    },
    [server.configured, refreshSession],
  );
  const signInWithGoogle = useCallback(async (next = "/"): Promise<SignInResult> => {
    const res = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login" });
    return res.error ? { ok: false, message: res.error.message ?? "Google sign-in failed." } : { ok: true };
  }, []);
  const signOut = useCallback(async () => {
    writeSession(null);
    setUserId(null);
    if (server.configured) {
      await authClient.signOut().catch(() => {});
      await refreshSession();
    }
  }, [server.configured, refreshSession]);

  const reset = useCallback(async () => {
    await clearPhotos();
    const next = repoRef.current?.reset();
    if (next) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const catalog = useMemo(() => makeCatalog(shown.categories), [shown.categories]);

  const value = useMemo<StoreValue>(
    () => ({
      catalog,
      ready,
      state: shown,
      act,
      user,
      server,
      signIn,
      signInWithGoogle,
      signOut,
      run,
      reset,
      freshIds,
    }),
    [ready, shown, act, user, server, signIn, signInWithGoogle, signOut, run, reset, freshIds, catalog],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore must be used inside FixubProvider");
  return v;
}

/** A clock that ticks so relative times ("5 min ago") stay current. */
export function useNow(intervalMs = 30_000): number {
  // Starts at 0 on the server; pages only render data after the store hydrates on the client.
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the clock on the client only
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
