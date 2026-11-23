import "server-only";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { Db } from "@/db/client";
import { organizationMembers, organizations, organizationUnits, users } from "@/db/schema";
import { CONSENT_VERSION } from "@/lib/meta";
import type { Role, User } from "@/lib/types";
import { createAuth } from "./auth";
import { serverEnv } from "./env";
import { AppError } from "./errors";

export interface Membership {
  organizationId: string;
  organizationSlug: string;
  role: "org_staff" | "org_manager";
  unitId: string | null;
  unitSlug: string | null;
}

/**
 * The signed-in user, as the server sees them. It has the same shape as the `User`
 * (id, name, role, organizationId, unitId), so the rules in `src/lib/domain` (checkTransition,
 * canWorkOn, …) take an Actor unchanged.
 *
 * `role` is the one effective role: `admin` if the user is a platform admin, otherwise the role
 * in their organization, otherwise `citizen`. v1 assumes a user works for at most one
 * organization; with several memberships the oldest one is used (all are in `memberships`).
 */
export interface Actor extends User {
  email: string;
  platformRole: "citizen" | "admin";
  /**
   * An owner: an admin through ADMIN_EMAILS. Only an owner decides who is an admin — giving or
   * taking the admin role, and changing, blocking or deleting another admin.
   */
  owner: boolean;
  /** Accepted the current notice about what a report makes public (asked before the first report). */
  consented: boolean;
  memberships: Membership[];
}

/**
 * The first admins: an account whose verified email is listed in ADMIN_EMAILS is an admin
 * whatever the database says, so a new deployment has someone who can open the Users page and
 * give everyone else their access. Google sign-in verifies the email.
 */
export function isBootstrapAdmin(user: { email: string; emailVerified: boolean }): boolean {
  return user.emailVerified && serverEnv().adminEmails.includes(user.email.toLowerCase());
}

/**
 * Who is making this request? Reads the session cookie, then loads the user's role and
 * organization from the database on every call, so a role change or a ban applies at once.
 * Returns null for visitors who aren't signed in (and for banned accounts).
 */
export async function getActor(db: Db): Promise<Actor | null> {
  const session = await createAuth(db).api.getSession({ headers: await headers() });
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      platformRole: users.platformRole,
      bannedAt: users.bannedAt,
      consentedAt: users.consentedAt,
      consentVersion: users.consentVersion,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user || user.bannedAt) return null;

  const memberships = await db
    .select({
      organizationId: organizationMembers.organizationId,
      organizationSlug: organizations.slug,
      role: organizationMembers.role,
      unitId: organizationMembers.unitId,
      unitSlug: organizationUnits.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .leftJoin(organizationUnits, eq(organizationUnits.id, organizationMembers.unitId))
    .where(eq(organizationMembers.userId, user.id))
    .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.organizationId));

  const primary = memberships[0];
  const owner = isBootstrapAdmin(user);
  const platformRole = user.platformRole === "admin" || owner ? "admin" : "citizen";
  const role: Role = platformRole === "admin" ? "admin" : (primary?.role ?? "citizen");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    platformRole,
    owner,
    consented: user.consentedAt !== null && user.consentVersion === CONSENT_VERSION,
    role,
    organizationId: role === "admin" ? undefined : primary?.organizationId,
    unitId: role === "admin" ? undefined : (primary?.unitId ?? undefined),
    memberships,
  };
}

/* ------------------------------------------------------------------ */
/* Permission helpers. Each returns the actor or throws an AppError,  */
/* so a server action can't forget to handle the refusal.             */
/* ------------------------------------------------------------------ */

/** Any signed-in user. Throws `signed_out` (401). */
export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new AppError("signed_out");
  return actor;
}

/**
 * The actor must have one of these roles. Throws `signed_out` (401) or `forbidden` (403).
 *
 *   const admin = requireRole(await getActor(db), "admin");
 *   const staff = requireRole(actor, "org_staff", "org_manager", "admin");
 */
export function requireRole(actor: Actor | null, ...roles: Role[]): Actor {
  const a = requireActor(actor);
  if (!roles.includes(a.role)) throw new AppError("forbidden");
  return a;
}

/**
 * The actor must work for this organization (admins always pass). Use it for anything scoped
 * to an organization: its queue, a report assigned to it.
 *
 * Throws `not_found` (404), not `forbidden`: staff of organization A must not learn which
 * reports organization B holds. A report with no organization can only be handled by admins.
 *
 *   requireOrgMember(actor, report.assignedOrganizationId);
 *   requireOrgMember(actor, report.assignedOrganizationId, { manager: true }); // close / reopen
 */
export function requireOrgMember(
  actor: Actor | null,
  organizationId: string | null | undefined,
  options: { manager?: boolean } = {},
): Actor {
  const a = requireActor(actor);
  if (a.role === "admin") return a;
  const membership = organizationId ? a.memberships.find((m) => m.organizationId === organizationId) : undefined;
  if (!membership) throw new AppError("not_found");
  if (options.manager && membership.role !== "org_manager") throw new AppError("forbidden");
  return a;
}
