"use client";

// How screens read from the server: `useApi("/api/v1/...")`, built on SWR.
//
//   const { data, error, isLoading, mutate } = useApi<CategoriesResponse>("/api/v1/categories");
//
// - `data` is the unwrapped `data` field of the response.
// - `error` is an ApiError with the server's `code` ("signed_out", "forbidden", …).
// - After a server action changes something, call `mutate()` to re-read it.
// - Dashboards that must stay live pass `{ refreshInterval: LIVE_REFRESH_MS }` (15 s polling).
// - Pass `null` as the path to skip the request (e.g. until the user is known).
import useSWR, { type SWRConfiguration } from "swr";
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
