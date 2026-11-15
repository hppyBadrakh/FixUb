import "server-only";
import * as z from "zod";
import type { Db } from "@/db/client";
import { withDb } from "./db";
import { AppError, toErrorBody, type ErrorCode } from "./errors";

/**
 * What every server action returns. Same shape as the demo's `run(...)` result, so screens keep
 * their `if (!res.ok) … res.error` handling.
 */
export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };

/**
 * The frame of every server action: validate the input with Zod, open the database, run the
 * body, and turn any AppError into `{ ok: false, error }`.
 *
 *   export async function setPriority(input: unknown) {
 *     return action(setPrioritySchema, input, async ({ db, input }) => {
 *       const admin = requireRole(await getActor(db), "admin");
 *       …rules from src/lib/domain…
 *       await db.transaction(async (tx) => { … });
 *       return {};
 *     });
 *   }
 *
 * `input` arrives as `unknown` on purpose: a server action is a public POST endpoint, and the
 * TypeScript type of its argument proves nothing about what a caller actually sends.
 */
export async function action<S extends z.ZodType, T extends object>(
  schema: S,
  rawInput: unknown,
  body: (ctx: { db: Db; input: z.output<S> }) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError("invalid_input", undefined, z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }
    const result = await withDb((db) => body({ db, input: parsed.data }));
    return { ok: true, ...result };
  } catch (err) {
    const { code, message, fieldErrors } = toErrorBody(err);
    return { ok: false, error: code, message, fieldErrors };
  }
}
