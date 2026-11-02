"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { makeCatalog, type Catalog } from "./catalog";
import type { ActionResult } from "./domain/actions";
import { clearPhotos } from "./data/photoStore";
import { createLocalRepository, type FixubRepository } from "./data/repository";
import type { DemoState, User } from "./types";

interface StoreValue {
  ready: boolean;
  state: DemoState;
  user: User | null;
  signIn: (userId: string) => void;
  signOut: () => void;
  /** Apply a pure action with the current user; saves and returns its result. */
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
  const [ready, setReady] = useState(false);
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
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    return repo.subscribe((next) => {
      const ids = changedIds(stateRef.current, next);
      stateRef.current = next;
      setState(next);
      flash(ids);
    });
  }, [flash]);

  const run = useCallback(
    <T,>(action: (s: DemoState, user: User | null, now: number) => ActionResult<T>) => {
      const current = stateRef.current;
      const user = current.users.find((u) => u.id === userId) ?? null;
      const result = action(current, user, Date.now());
      if (result.ok && result.state !== current) {
        const ids = changedIds(current, result.state);
        stateRef.current = result.state;
        repoRef.current?.save(result.state);
        setState(result.state);
        flash(ids);
      }
      return result;
    },
    [userId, flash],
  );

  const signIn = useCallback((id: string) => {
    writeSession(id);
    setUserId(id);
  }, []);
  const signOut = useCallback(() => {
    writeSession(null);
    setUserId(null);
  }, []);

  const reset = useCallback(async () => {
    await clearPhotos();
    const next = repoRef.current?.reset();
    if (next) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const catalog = useMemo(() => makeCatalog(state.categories), [state.categories]);

  const value = useMemo<StoreValue>(
    () => ({
      catalog,
      ready,
      state,
      user: state.users.find((u) => u.id === userId) ?? null,
      signIn,
      signOut,
      run,
      reset,
      freshIds,
    }),
    [ready, state, userId, signIn, signOut, run, reset, freshIds, catalog],
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
