// The error codes of the business rules. Shared by the demo's pure actions (./actions.ts) and the
// server (src/server/errors.ts). Pure: types only.
import type { TransitionError } from "./lifecycle";

export type ActionError =
  | TransitionError
  | "forbidden"
  | "signed_out"
  | "conflict"
  | "out_of_area"
  | "description_length"
  | "too_many_photos"
  | "own_report"
  | "not_open"
  | "not_resolved"
  | "already_flagged"
  | "photo_required"
  | "invalid_category"
  | "in_use"
  | "invalid_input";
