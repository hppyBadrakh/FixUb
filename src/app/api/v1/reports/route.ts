// GET /api/v1/reports: the public list behind the map, the list view and the statistics.
//
//   ?bbox=west,south,east,north   only reports inside this map viewport (PostGIS)
//   ?status=reported,resolved     only these statuses
//   ?category=roads               only this category
//   ?mine=1                       the signed-in user's own reports instead, hidden ones included
//   ?ref=FX-26-04133              the one report with this reference (the "track a report" box)
//
// Without `mine` or `ref` the list holds every open report plus those resolved or closed in the
// last 90 days, so it stays a bounded size as history grows. Older ones are still reachable
// by reference and at GET /api/v1/reports/{id}.
//
// Everyone gets public reports only (see wherePublic). Nobody is identified in the answer (see queries/reports.ts).
import { and, eq, gte, inArray, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { reports } from "@/db/schema";
import type { ReportsResponse } from "@/lib/api/types";
import { getActor, requireActor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadReports, whereCategory, whereInBox, wherePublic, whereReportedBy } from "@/server/queries/reports";
import { REPORT_STATUSES } from "@/server/schemas";
import { LIMITS, OPEN_STATUSES } from "@/lib/meta";

const list = (s: string) => s.split(",").filter(Boolean);

// NaN fails every comparison, so a box with a non-number in it is refused too.
const isBox = (b: number[]) =>
  b.length === 4 && b[0] < b[2] && b[1] < b[3] && Math.abs(b[0]) <= 180 && Math.abs(b[2]) <= 180 && Math.abs(b[1]) <= 90 && Math.abs(b[3]) <= 90;

const querySchema = z.object({
  bbox: z
    .string()
    .transform((s) => list(s).map(Number))
    .refine(isBox)
    .optional(),
  status: z
    .string()
    .transform(list)
    .pipe(z.array(z.enum(REPORT_STATUSES)).max(REPORT_STATUSES.length))
    .optional(),
  category: z
    .string()
    .regex(/^[a-z0-9_-]{1,60}$/)
    .optional(),
  mine: z.literal("1").optional(),
  ref: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^FX-\d{2}-\d{5,}$/)
    .optional(),
});

export async function GET(request: Request) {
  return api<ReportsResponse>(() =>
    withDb(async (db) => {
      const q = parseSearchParams(querySchema, request);
      const actor = await getActor(db);

      const filters: (SQL | undefined)[] = [q.mine ? whereReportedBy(requireActor(actor).id) : wherePublic()];
      if (q.ref) filters.push(eq(reports.ref, q.ref));
      else if (!q.mine) {
        const since = new Date(Date.now() - LIMITS.publicHistoryDays * 864e5);
        filters.push(or(inArray(reports.status, OPEN_STATUSES), gte(reports.statusChangedAt, since)));
      }
      if (q.bbox) filters.push(whereInBox(q.bbox as [number, number, number, number]));
      if (q.status?.length) filters.push(inArray(reports.status, q.status));
      if (q.category) filters.push(whereCategory(q.category));
      return { reports: await loadReports(db, actor, and(...filters)) };
    }),
  );
}
