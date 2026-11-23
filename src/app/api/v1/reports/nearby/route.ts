// GET /api/v1/reports/nearby?lng=106.9&lat=47.9&category=roads
//
// The duplicate hint of the report flow: open reports of the same category within 50 m, from the
// last 90 days, nearest first (at most 5). Public, like the map; the signed-in reporter's own
// reports are left out. Nobody is identified in the answer (see queries/reports.ts).
import * as z from "zod";
import type { NearbyResponse } from "@/lib/api/types";
import { inServiceArea } from "@/lib/domain/geo";
import { getActor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { findNearbyReports } from "@/server/queries/reports";

// Number("") is 0, so an empty value must be refused before it is read as a coordinate.
// A browser's float can have 15+ decimals (106.93770000000001), so the digits are not limited tightly.
const coordinate = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,20})?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max));

const querySchema = z.object({
  lng: coordinate(-180, 180),
  lat: coordinate(-90, 90),
  category: z.string().regex(/^[a-z0-9_-]{1,60}$/),
});

export async function GET(request: Request) {
  return api<NearbyResponse>(() =>
    withDb(async (db) => {
      const q = parseSearchParams(querySchema, request);
      // Nobody can file a report outside the service area, so there is nothing to find there.
      return { candidates: inServiceArea(q) ? await findNearbyReports(db, await getActor(db), q) : [] };
    }),
  );
}
