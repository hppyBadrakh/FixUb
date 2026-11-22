import "server-only";
import { asc } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { categories, organizations, organizationUnits } from "@/db/schema";
import type { ApiOrganization } from "@/lib/api/operations-types";

/**
 * Every organization with its units and the categories it is the suggested owner for.
 * Inactive ones are included (`isActive`): the admin page shows them, pickers filter them out.
 */
export async function listOrganizations(db: Db | Tx): Promise<ApiOrganization[]> {
  const [orgs, units, cats] = await Promise.all([
    db.select().from(organizations).orderBy(asc(organizations.createdAt), asc(organizations.slug)),
    db.select().from(organizationUnits).orderBy(asc(organizationUnits.sortOrder), asc(organizationUnits.slug)),
    db
      .select({ slug: categories.slug, organizationId: categories.defaultOrganizationId })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id)),
  ]);

  return orgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: { mn: o.nameMn, en: o.nameEn },
    isActive: o.isActive,
    categories: cats.filter((c) => c.organizationId === o.id).map((c) => c.slug),
    units: units
      .filter((u) => u.organizationId === o.id)
      .map((u) => ({ id: u.id, slug: u.slug, name: { mn: u.nameMn, en: u.nameEn }, isActive: u.isActive })),
  }));
}
