// Building blocks shared by the server-side input schemas (citizen and operations sides).
// Schemas only check the *shape* of input. Rules that need the database (does this category
// exist? is the report visible? is it resolved?) stay in the server actions.
import { z } from "zod";
import type { DistrictId } from "@/lib/types";

/** Same ids as `DistrictId` in src/lib/types.ts; the check below fails to compile if they drift. */
export const DISTRICTS = [
  "sukhbaatar",
  "chingeltei",
  "bayanzurkh",
  "khan_uul",
  "bayangol",
  "songinokhairkhan",
] as const;
type _DistrictsMatch = [DistrictId] extends [(typeof DISTRICTS)[number]]
  ? [(typeof DISTRICTS)[number]] extends [DistrictId]
    ? true
    : never
  : never;
export const _districtsMatch: _DistrictsMatch = true;

/** Report, category and photo ids. The exact format is decided by the database schema. */
export const idSchema = z.string().trim().min(1).max(64);

export const districtSchema = z.enum(DISTRICTS);

/** WGS84 coordinates. The service-area check is a separate rule (see reports.ts). */
export const lngSchema = z.number().min(-180).max(180);
export const latSchema = z.number().min(-90).max(90);

/**
 * Flattens a Zod error to `{ field: message }` (first message per field) so a server action can
 * return field errors to a form. Form-level problems use the key `_form`.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
