import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { categories, organizationMembers, organizations, organizationUnits, users } from "@/db/schema";
import type { Organization, User } from "@/lib/types";

/**
 * Every organization with its units and the categories it is the suggested owner of, in the
 * demo's `Organization` shape. Ids are slugs ("org-road", "unit-road-a"). Public: these names
 * appear on every report's timeline.
 */
export async function listOrganizations(db: Db | Tx): Promise<Organization[]> {
  const [orgs, units, owned] = await Promise.all([
    db.select().from(organizations).orderBy(asc(organizations.createdAt), asc(organizations.slug)),
    db.select().from(organizationUnits).orderBy(asc(organizationUnits.sortOrder), asc(organizationUnits.slug)),
    db
      .select({ slug: categories.slug, organizationId: categories.defaultOrganizationId })
      .from(categories)
      .orderBy(asc(categories.sortOrder)),
  ]);
  return orgs.map((o) => ({
    id: o.slug,
    name: { mn: o.nameMn, en: o.nameEn },
    units: units.filter((u) => u.organizationId === o.id).map((u) => ({ id: u.slug, name: { mn: u.nameMn, en: u.nameEn } })),
    categories: owned.filter((c) => c.organizationId === o.id).map((c) => c.slug),
    isActive: o.isActive,
  }));
}

/** The people who work for an organization, for the admin's organizations page. */
export async function listStaff(db: Db | Tx): Promise<User[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: organizationMembers.role,
      organizationId: organizations.slug,
      unitId: organizationUnits.slug,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .leftJoin(organizationUnits, eq(organizationUnits.id, organizationMembers.unitId))
    .orderBy(asc(organizations.slug), asc(users.name));
  return rows.map((r) => ({ ...r, unitId: r.unitId ?? undefined }));
}
