import "server-only";
import type { z } from "zod";
import { AppError } from "./errors";

/**
 * Validates the query string of a GET request with a Zod schema.
 * Invalid input → AppError `invalid_input` (400) with the messages per field.
 *
 *   const filters = parseSearchParams(queueFiltersSchema, req);
 */
export function parseSearchParams<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const result = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_query";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new AppError("invalid_input", undefined, fieldErrors);
}
