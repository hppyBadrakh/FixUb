// GET /api/v1/reports/{id}: one report with its timeline. A hidden report is only for its
// reporter, admins and the staff it is assigned to; everyone else gets 404.
import type { ReportResponse } from "@/lib/api/types";
import { getActor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { loadReport } from "@/server/queries/reports";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api<ReportResponse>(() =>
    withDb(async (db) => {
      const report = await loadReport(db, await getActor(db), (await params).id);
      if (!report) throw new AppError("not_found");
      return { report };
    }),
  );
}
