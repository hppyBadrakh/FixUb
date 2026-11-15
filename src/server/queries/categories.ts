import "server-only";
import { asc, count } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { categories, reports, subcategories } from "@/db/schema";
import type { ApiCategory } from "@/lib/api/types";
import type { IconKey } from "@/lib/types";

/**
 * The whole category tree in display order. Public ids are the slugs ("roads", "pothole"),
 * never the numeric database ids. Takes `Db | Tx` so it also works inside a transaction.
 */
export async function listCategories(db: Db | Tx): Promise<ApiCategory[]> {
  const [cats, subs, usage] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
    db.select().from(subcategories).orderBy(asc(subcategories.sortOrder), asc(subcategories.id)),
    // Hidden reports count too: they still block removing their category.
    db.select({ subcategoryId: reports.subcategoryId, n: count() }).from(reports).groupBy(reports.subcategoryId),
  ]);
  const used = new Map(usage.map((u) => [u.subcategoryId, u.n]));
  return cats.map((c) => {
    const children = subs
      .filter((sc) => sc.categoryId === c.id)
      .map((sc) => ({ id: sc.slug, name: { mn: sc.nameMn, en: sc.nameEn }, reportCount: used.get(sc.id) ?? 0 }));
    return {
      id: c.slug,
      name: { mn: c.nameMn, en: c.nameEn },
      icon: c.icon as IconKey,
      reportCount: children.reduce((n, sc) => n + sc.reportCount, 0),
      subcategories: children,
    };
  });
}
