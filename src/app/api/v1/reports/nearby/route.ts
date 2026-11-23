// GET /api/v1/reports/nearby?lng=106.9177&lat=47.9186&category=roads
//
// The report form's "is it one of these?" hint: open, visible reports of the same category within
// 50 m and 90 days of the point, nearest first, at most five (PostGIS; see queries/duplicates.ts).
// A signed-in citizen's own reports are left out. Nobody is identified in the answer.
import * as z from "zod";
import type { NearbyResponse } from "@/lib/api/types";
import { getActor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { findDuplicateCandidates } from "@/server/queries/duplicates";

// Plain decimal numbers only: "", "1e3" and "NaN" must not become coordinates.
const coordinate = (limit: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,9})?$/)
    .transform(Number)
    .refine((n) => Math.abs(n) <= limit);

const querySchema = z.object({
  lng: coordinate(180),
  lat: coordinate(90),
  category: z.string().regex(/^[a-z0-9_-]{1,60}$/),
});

export async function GET(request: Request) {
  return api<NearbyResponse>(() =>
    withDb(async (db) => {
      const q = parseSearchParams(querySchema, request);
      const actor = await getActor(db);
      return { candidates: await findDuplicateCandidates(db, actor, q) };
    }),
  );
}
