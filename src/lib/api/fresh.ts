// Which rows changed between two answers of the server. Pure, so it can be tested without React.

/** id → a value that changes whenever the row does (`updatedAt`, `version`). */
export type Stamps = ReadonlyMap<string, unknown>;

/**
 * Ids that are new in `next` or whose stamp differs from `prev`. With no previous answer
 * (the first load) nothing counts as changed. Rows that disappeared are not reported.
 */
export function changedIds(prev: Stamps | null, next: Stamps): string[] {
  if (!prev) return [];
  const out: string[] = [];
  for (const [id, stamp] of next) {
    if (!prev.has(id) || prev.get(id) !== stamp) out.push(id);
  }
  return out;
}
