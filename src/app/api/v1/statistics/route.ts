// GET /api/v1/statistics?days=30
//
// The numbers of the public statistics page, counted in SQL over visible reports. `days` (7, 30
// or 90; default 30) is the period of "resolved" and "median first response"; everything else is
// the current state or the last 14 days. Public, like the map. Nobody is identified.
import * as z from "zod";
import type { StatisticsResponse } from "@/lib/api/types";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { loadStatistics } from "@/server/queries/statistics";

const querySchema = z.object({
  days: z
    .enum(["7", "30", "90"])
    .transform((d) => Number(d) as StatisticsResponse["days"])
    .default(30),
});

export async function GET(request: Request) {
  return api<StatisticsResponse>(() =>
    withDb(async (db) => loadStatistics(db, parseSearchParams(querySchema, request).days)),
  );
}
