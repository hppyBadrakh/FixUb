import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { reports } from "@/db/schema";
import { AppError } from "./errors";

// Small pieces the report actions share (citizen and operations side).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Locks one report for the rest of the transaction and returns what the rules need. Throws
 * `not_found` for an id that doesn't exist or isn't an id at all. The lock makes two people
 * changing the same report wait for each other instead of overwriting each other.
 */
export async function lockReport(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new AppError("not_found");
  const [report] = await tx
    .select({
      id: reports.id,
      reporterId: reports.reporterId,
      status: reports.status,
      visibility: reports.visibility,
      version: reports.version,
      organizationId: reports.assignedOrganizationId,
    })
    .from(reports)
    .where(eq(reports.id, id))
    .for("update");
  if (!report) throw new AppError("not_found");
  return report;
}

/**
 * The form's idempotency key as a UUID (the column's type). The demo form sends a short random
 * string, so anything that isn't a UUID already is hashed into one: the same key always gives
 * the same UUID, which is all a double submit needs.
 */
export async function requestUuid(clientRequestId: string): Promise<string> {
  if (UUID.test(clientRequestId)) return clientRequestId.toLowerCase();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fixub-request:${clientRequestId}`)));
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash.subarray(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
