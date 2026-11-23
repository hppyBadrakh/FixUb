// GET /api/v1/statistics: the numbers of the public statistics page, counted in SQL over the
// visible reports (see src/server/queries/statistics.ts).
//
//   ?days=7|30|90   the period of "resolved" and "median first response"; default 30
//
// Public: everything in it is a count of reports anyone can already see.
import * as z from "zod";
import type { StatisticsResponse } from "@/lib/api/types";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadStatistics } from "@/server/queries/statistics";

const querySchema = z.object({ days: z.enum(["7", "30", "90"]).default("30").transform(Number) });

export async function GET(request: Request) {
  return api<StatisticsResponse>(() =>
    withDb(async (db) => {
      const { days } = parseSearchParams(querySchema, request);
      return loadStatistics(db, { now: Date.now(), days });
    }),
  );
}
