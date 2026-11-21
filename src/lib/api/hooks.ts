"use client";

// How screens read from the server: `useApi("/api/v1/...")`, built on SWR.
//
//   const { data, error, isLoading, mutate } = useApi<CategoriesResponse>("/api/v1/categories");
//
// - `data` is the unwrapped `data` field of the response.
// - `error` is an ApiError with the server's `code` ("signed_out", "forbidden", …).
// - After a server action changes something, call `mutate()` to re-read it.
// - Pass `null` as the path to skip the request (e.g. until the user is known).
//
// Lists and dashboards that other people change (the map, the queues, a report's timeline) use
// `useLiveApi` instead: the same hook, re-read every 15 s. This replaces the demo's cross-tab
// sync, and works across devices. `useFreshIds` gives the rows that just changed, for the
// `fx-fresh` highlight the demo got from `useStore().freshIds`:
//
//   const { data } = useLiveApi<ReviewQueueResponse>("/api/v1/admin/reports");
//   const fresh = useFreshIds(data?.reports, "updatedAt");
//   <li className={fresh.has(r.id) ? "fx-fresh" : ""}>
import { useEffect, useRef, useState } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { changedIds, type Stamps } from "./fresh";
import type { ErrorCode } from "@/server/errors";
import type { ApiEnvelope } from "./types";

export const LIVE_REFRESH_MS = 15_000;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...init?.headers } });
  } catch {
    throw new ApiError("internal", "Network error: the server can't be reached.", 0);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body || body.error) {
    throw new ApiError(body?.error?.code ?? "internal", body?.error?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return body.data as T;
}

export function useApi<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useSWR<T, ApiError>(path, fetchApi, {
    // A 4xx answer won't change by asking again; only retry real failures.
    shouldRetryOnError: (err) => err.status === 0 || err.status >= 500,
    errorRetryCount: 3,
    ...config,
  });
}

/**
 * `useApi` for data that must stay live: re-reads every 15 s while the tab is visible, and at
 * once when the tab gets focus or the network comes back. The previous data stays on screen
 * while a new filter or page loads, so lists don't blink.
 */
export function useLiveApi<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useApi<T>(path, { refreshInterval: LIVE_REFRESH_MS, keepPreviousData: true, ...config });
}

const NONE: ReadonlySet<string> = new Set();
/** How long a changed row stays highlighted (the `fx-fresh` animation). */
const FRESH_MS = 1600;

/**
 * The ids of the rows that are new or changed since the previous answer of the server, for
 * 1.6 s after it arrives. `stamp` names a field that changes whenever the row does (`updatedAt`
 * or `version`). Nothing is fresh on the first load.
 */
export function useFreshIds<T extends { id: string }>(items: readonly T[] | undefined, stamp: keyof T): ReadonlySet<string> {
  const seen = useRef<Stamps | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [fresh, setFresh] = useState(NONE);

  useEffect(() => {
    if (!items) return;
    const next: Stamps = new Map(items.map((item) => [item.id, item[stamp]]));
    const changed = changedIds(seen.current, next);
    seen.current = next;
    if (!changed.length) return;
    setFresh(new Set(changed));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh(NONE), FRESH_MS);
  }, [items, stamp]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return fresh;
}
