import "server-only";
import { asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { organizationMembers, organizations, organizationUnits, users } from "@/db/schema";
import type { AccountsResponse } from "@/lib/api/types";
import { isBootstrapAdmin } from "@/server/actor";

/** How many accounts one answer holds; `total` says whether there are more. */
const MAX_ACCOUNTS = 200;

/** Escapes what LIKE treats as a wildcard, so a search for "50%" finds exactly that. */
const literal = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Accounts for the admin's Users page: admins first, then staff, then everyone else by newest.
 * `q` searches name and email. Each comes with the one organization the person works for, if any.
 */
export async function listAccounts(db: Db | Tx, q?: string): Promise<AccountsResponse> {
  const where = q ? or(ilike(users.name, `%${literal(q)}%`), ilike(users.email, `%${literal(q)}%`)) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        platformRole: users.platformRole,
        bannedAt: users.bannedAt,
        createdAt: users.createdAt,
        memberRole: organizationMembers.role,
        organizationId: organizations.slug,
        unitId: organizationUnits.slug,
      })
      .from(users)
      .leftJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .leftJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .leftJoin(organizationUnits, eq(organizationUnits.id, organizationMembers.unitId))
      .where(where)
      .orderBy(
        sql`case when ${users.platformRole} = 'admin' then 0 when ${organizationMembers.role} is not null then 1 else 2 end`,
        desc(users.createdAt),
        asc(users.id),
      )
      .limit(MAX_ACCOUNTS),
    db.select({ total: count() }).from(users).where(where),
  ]);

  // A user with two memberships would come back twice; the first one (as in getActor) counts.
  const seen = new Set<string>();
  const accounts = rows
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => {
      const fixedAdmin = isBootstrapAdmin(r);
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.platformRole === "admin" || fixedAdmin ? ("admin" as const) : (r.memberRole ?? ("citizen" as const)),
        organizationId: r.organizationId ?? undefined,
        unitId: r.unitId ?? undefined,
        banned: r.bannedAt !== null,
        fixedAdmin,
        createdAt: r.createdAt.getTime(),
      };
    });
  return { accounts, total };
}
