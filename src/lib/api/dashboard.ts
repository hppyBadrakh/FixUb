"use client";

// The overview's numbers, counted on the server in SQL (GET /api/v1/admin/dashboard and
// /staff/dashboard), re-read every 15 s.
//
//   const dashboard = useDashboard("admin", days);
//   const s = dashboard?.summary ?? summarize(visible, now, days);
//
// It is `undefined` without a server (the browser-only demo) and while the first answer is on
// its way: the screen then counts the same numbers itself with src/lib/domain/metrics.ts, which
// the SQL is tested against, so nothing jumps when the answer arrives.
import { useStore } from "@/lib/store";
import { useLiveApi } from "./hooks";
import type { DashboardResponse } from "./types";

export function useDashboard(area: "admin" | "staff", days: 1 | 7 | 30 = 7): DashboardResponse | undefined {
  const { server, user } = useStore();
  const mayRead = area === "admin" ? user?.role === "admin" : user?.role === "org_staff" || user?.role === "org_manager";
  return useLiveApi<DashboardResponse>(server.configured && mayRead ? `/api/v1/${area}/dashboard?days=${days}` : null).data;
}
