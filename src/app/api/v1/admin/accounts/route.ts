// GET /api/v1/admin/accounts: the people who have signed in, with what each may do (the admin's
// Users page). `?q=` searches name and email.
//
// Admin only: 401 when signed out, 403 for everyone else.
import * as z from "zod";
import type { AccountsResponse } from "@/lib/api/types";
import { getActor, requireRole } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { parseSearchParams } from "@/server/parse";
import { listAccounts } from "@/server/queries/accounts";

const querySchema = z.object({ q: z.string().trim().max(100).optional() });

export async function GET(request: Request) {
  return api<AccountsResponse>(() =>
    withDb(async (db) => {
      requireRole(await getActor(db), "admin");
      const { q } = parseSearchParams(querySchema, request);
      return listAccounts(db, q);
    }),
  );
}
