// Business rules that need no state, so the demo's actions (./actions.ts) and the server's
// actions (src/server/actions) run exactly the same code. Pure: no React, no storage, no server.
import type { CategoryDef, CategorySlug, Organization, Report } from "../types";

export function makeRef(seq: number, now: number): string {
  const yy = String(new Date(now).getFullYear()).slice(2);
  return `FX-${yy}-${String(seq).padStart(5, "0")}`;
}

export function tally(feedback: Report["feedback"]) {
  let fixed = 0;
  let notFixed = 0;
  for (const f of feedback) {
    if (f.verdict === "fixed") fixed++;
    else notFixed++;
  }
  return { fixed, notFixed };
}

/**
 * Shape rules of the category tree, shared by the demo and the server action: every category and
 * subcategory has a Mongolian and an English name, ids are unique, and a category has at least
 * one subcategory.
 */
export function checkCategoryTree(categories: CategoryDef[]): "invalid_input" | null {
  const ids = new Set<string>();
  for (const c of categories) {
    if (!c.name.mn.trim() || !c.name.en.trim() || ids.has(c.id) || !c.subcategories.length) return "invalid_input";
    ids.add(c.id);
    const subIds = new Set<string>();
    for (const sc of c.subcategories) {
      if (!sc.name.mn.trim() || !sc.name.en.trim() || subIds.has(sc.id)) return "invalid_input";
      subIds.add(sc.id);
    }
  }
  return null;
}

/** The organization that owns a category by default: the first active one that lists it. */
export function suggestedOrganization(organizations: readonly Organization[], category: CategorySlug): Organization | undefined {
  return organizations.find((o) => o.isActive && o.categories.includes(category));
}
