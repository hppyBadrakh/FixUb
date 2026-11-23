"use client";

// The report form's duplicate hint, from the server (PostGIS, 50 m, 90 days).
//
//   const { candidates, loading } = useNearbyReports(draft.pick, draft.category);
//
// Pass `null` for the point or the category to skip the request. If the server can't answer, there
// are no candidates: the hint is a convenience, so it must never keep anyone from reporting.
import { useApi } from "./hooks";
import type { NearbyResponse } from "./types";
import type { LngLat } from "../types";

const NONE: NearbyResponse["candidates"] = [];

export function useNearbyReports(point: LngLat | null | undefined, category: string | null | undefined) {
  const path =
    point && category ? `/api/v1/reports/nearby?${new URLSearchParams({ lng: point.lng.toFixed(6), lat: point.lat.toFixed(6), category })}` : null;
  // The point moves while the user drags the pin: never show candidates of an earlier point.
  const { data, error, isLoading } = useApi<NearbyResponse>(path, { keepPreviousData: false, revalidateOnFocus: false, errorRetryCount: 1 });
  return { candidates: data?.candidates ?? NONE, loading: !!path && isLoading && !error };
}
