"use server";

// REFERENCE EXAMPLE — a write. Copy this shape for every server action:
//
//   1. Zod        validate the input (shape, lengths, enums). Field names match the demo action.
//   2. getActor() who is calling, then requireRole / requireOrgMember. Never trust the UI.
//      Then rateLimit(): every write is counted per user (limits in src/server/rate-limit.ts).
//   3. Rules      the same pure functions the demo used, from src/lib/domain.
//   4. Postgres   read what the rules need and write, all inside ONE transaction.
//
// It replaces the demo's `saveCategories(state, user, categories)` in src/lib/domain/actions.ts
// and returns the same `{ ok: false, error }` codes, so the screen's error handling is unchanged.
import { and, eq, inArray, notInArray } from "drizzle-orm";
import * as z from "zod";
import { auditEvents, categories, reports, subcategories } from "@/db/schema";
import { checkCategoryTree } from "@/lib/domain/actions";
import { ICON_KEYS } from "@/lib/api/schemas";
import { action } from "@/server/action";
import { getActor, requireRole } from "@/server/actor";
import { AppError, PG, pgErrorCode } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";

/* 1. Zod: one schema per action. The limits match the CHECK constraints in src/db/schema.ts. */
const slug = z.string().regex(/^[a-z0-9_-]{1,60}$/);
const name = z.object({ mn: z.string().trim().min(1).max(120), en: z.string().trim().min(1).max(120) });
const saveCategoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        id: slug,
        name,
        icon: z.enum(ICON_KEYS),
        subcategories: z.array(z.object({ id: slug, name })).min(1).max(40),
      }),
    )
    .min(1)
    .max(40),
});

/**
 * Admin-only: replace the category tree. Categories and subcategories that reports still use
 * can't be removed (`in_use`); renaming and reordering are always fine.
 */
export async function saveCategories(input: unknown) {
  return action(saveCategoriesSchema, input, async ({ db, input }) => {
    /* 2. Who is calling? Citizens and staff are refused here, whatever the UI showed them. */
    const admin = requireRole(await getActor(db), "admin");
    await rateLimit(db, admin, "console.write");

    /* 3. Rules from src/lib/domain: the same check the demo ran. */
    const problem = checkCategoryTree(input.categories);
    if (problem) throw new AppError(problem);

    /* 4. One transaction: either the whole tree is saved or nothing changes. */
    try {
      await db.transaction(async (tx) => {
        const keepSlugs = input.categories.map((c) => c.id);

        // "Can't remove what reports use." The foreign keys enforce it too (caught below);
        // checking first gives the precise error without relying on a failed statement.
        const [blocked] = await tx
          .select({ id: reports.id })
          .from(reports)
          .innerJoin(categories, eq(categories.id, reports.categoryId))
          .where(notInArray(categories.slug, keepSlugs))
          .limit(1);
        if (blocked) throw new AppError("in_use");

        await tx.delete(categories).where(notInArray(categories.slug, keepSlugs)); // subcategories cascade

        for (const [i, c] of input.categories.entries()) {
          const [row] = await tx
            .insert(categories)
            .values({ slug: c.id, nameMn: c.name.mn, nameEn: c.name.en, icon: c.icon, sortOrder: i })
            .onConflictDoUpdate({
              target: categories.slug,
              set: { nameMn: c.name.mn, nameEn: c.name.en, icon: c.icon, sortOrder: i },
            })
            .returning({ id: categories.id });

          const keepSubSlugs = c.subcategories.map((sc) => sc.id);
          const [blockedSub] = await tx
            .select({ id: reports.id })
            .from(reports)
            .innerJoin(subcategories, eq(subcategories.id, reports.subcategoryId))
            .where(and(eq(subcategories.categoryId, row.id), notInArray(subcategories.slug, keepSubSlugs)))
            .limit(1);
          if (blockedSub) throw new AppError("in_use");

          await tx
            .delete(subcategories)
            .where(and(eq(subcategories.categoryId, row.id), notInArray(subcategories.slug, keepSubSlugs)));

          const existing = await tx
            .select({ slug: subcategories.slug })
            .from(subcategories)
            .where(and(eq(subcategories.categoryId, row.id), inArray(subcategories.slug, keepSubSlugs)));
          const known = new Set(existing.map((x) => x.slug));
          for (const [j, sc] of c.subcategories.entries()) {
            if (known.has(sc.id)) {
              await tx
                .update(subcategories)
                .set({ nameMn: sc.name.mn, nameEn: sc.name.en, sortOrder: j })
                .where(and(eq(subcategories.categoryId, row.id), eq(subcategories.slug, sc.id)));
            } else {
              await tx
                .insert(subcategories)
                .values({ categoryId: row.id, slug: sc.id, nameMn: sc.name.mn, nameEn: sc.name.en, sortOrder: j });
            }
          }
        }

        // Admin actions leave an audit trail, written in the same transaction.
        await tx.insert(auditEvents).values({
          actorId: admin.id,
          action: "categories.save",
          targetType: "categories",
          targetId: "tree",
          metadata: { categories: input.categories.length },
        });
      });
    } catch (err) {
      // A report created between our check and the delete: the foreign key still stops it.
      if (pgErrorCode(err) === PG.foreignKeyViolation) throw new AppError("in_use");
      throw err;
    }

    // Return only what the screen needs. It then re-reads the tree with `mutate()` (see the screen).
    return {};
  });
}
