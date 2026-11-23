// One error type for the whole server. Throw an AppError anywhere below a route handler or a
// server action; `api()` (src/server/api.ts) turns it into an HTTP response and `action()`
// (src/server/action.ts) into `{ ok: false, error }`, which the screens show a text for.
import type { ActionError } from "@/lib/domain/rules";

/** The rule violations (src/lib/domain/rules.ts), plus the errors only a server can produce. */
export type ErrorCode = ActionError | "consent_required" | "not_configured" | "rate_limited" | "internal";

const STATUS: Record<ErrorCode, number> = {
  signed_out: 401,
  forbidden: 403,
  // Also used when the actor may not know the thing exists (another organization's report).
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  // Signed in, but hasn't accepted the notice shown before a first report.
  consent_required: 403,
  not_configured: 503,
  internal: 500,
  invalid_input: 400,
  invalid_transition: 400,
  note_required: 400,
  reason_required: 400,
  duplicate_required: 400,
  out_of_area: 400,
  description_length: 400,
  too_many_photos: 400,
  own_report: 400,
  not_open: 400,
  not_resolved: 400,
  already_flagged: 400,
  photo_required: 400,
  invalid_category: 400,
  in_use: 409,
};

const DEFAULT_MESSAGE: Partial<Record<ErrorCode, string>> = {
  signed_out: "Sign in to continue.",
  forbidden: "Your role does not allow this.",
  not_found: "Not found.",
  conflict: "Someone else changed this at the same time. Reload and try again.",
  rate_limited: "Too many requests. Try again later.",
  consent_required: "Accept the notice about what becomes public before reporting.",
  not_configured: "The server is not configured for this.",
  internal: "Something went wrong on the server.",
  invalid_input: "The request is not valid.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Per-field validation messages (from Zod), when there are any. */
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, message?: string, fieldErrors?: Record<string, string[]>) {
    super(message ?? DEFAULT_MESSAGE[code] ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = fieldErrors;
  }
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

/** Anything thrown → a safe, serializable error. Unknown errors are logged, never leaked. */
export function toErrorBody(err: unknown): ErrorBody & { status: number } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, fieldErrors: err.fieldErrors, status: err.status };
  }
  console.error("[server] unexpected error:", err);
  return { code: "internal", message: DEFAULT_MESSAGE.internal!, status: 500 };
}

/** Postgres error code of a failed query (drizzle wraps the driver's error in `cause`). */
export function pgErrorCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

export const PG = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
} as const;
