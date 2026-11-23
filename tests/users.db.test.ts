// User management: what an admin can give and take away, and the first admins from ADMIN_EMAILS.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET as accountsRoute } from "@/app/api/v1/admin/accounts/route";
import { organizationMembers, organizations, reportConfirmations, reportImages, reports, sessions, users } from "@/db/schema";
import type { Account, AccountsResponse } from "@/lib/api/types";
import { deleteUser, setUserAccess, setUserBanned } from "@/server/actions/users";
import { getActor } from "@/server/actor";
import { withDb } from "@/server/db";
import { as, hasDatabase, PERSONAS, signOutEveryone } from "./helpers/personas";
import { storePhoto } from "@/server/photos";
import { bucketObjects, cleanUpPhotos, jpeg } from "./helpers/photos";
import { cleanUpReports, makeReport } from "./helpers/reports";
import { cleanUpUsers, makeUser } from "./helpers/users";

async function account(id: string): Promise<Account | undefined> {
  // The id is unique enough to search for: the email starts with it.
  const res = await as("admin", () => accountsRoute(new Request(`http://localhost:3000/api/v1/admin/accounts?q=${id}`)));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: AccountsResponse }).data.accounts.find((a) => a.id === id);
}

const membershipsOf = (userId: string) =>
  withDb((db) =>
    db
      .select({ organization: organizations.slug, role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId)),
  );

describe.skipIf(!hasDatabase)("user management", () => {
  afterAll(cleanUpUsers);
  afterAll(signOutEveryone);

  it("a new account is a citizen; an admin makes them staff, moves them, and takes it back", async () => {
    const id = await makeUser();
    expect(await account(id)).toMatchObject({ role: "citizen", banned: false, fixedAdmin: false, email: `${id}@test.fixub.invalid` });

    const give = (access: object) => as("admin", () => setUserAccess({ userId: id, access }));
    expect(await give({ kind: "staff", organizationId: "org-road", role: "org_staff", unitId: "unit-road-a" })).toMatchObject({ ok: true });
    expect(await account(id)).toMatchObject({ role: "org_staff", organizationId: "org-road", unitId: "unit-road-a" });

    // A person works for one organization: the new one replaces the old one.
    expect(await give({ kind: "staff", organizationId: "org-light", role: "org_manager" })).toMatchObject({ ok: true });
    expect(await membershipsOf(id)).toEqual([{ organization: "org-light", role: "org_manager" }]);
    expect((await account(id))?.unitId).toBeUndefined();

    expect(await give({ kind: "citizen" })).toMatchObject({ ok: true });
    expect(await account(id)).toMatchObject({ role: "citizen" });
    expect(await membershipsOf(id)).toEqual([]);
  });

  it("blocking signs the account out everywhere; unblocking lets it back in", async () => {
    const id = await makeUser();
    const sessionCount = () => withDb(async (db) => (await db.select().from(sessions).where(eq(sessions.userId, id))).length);
    expect(await sessionCount()).toBe(1);

    expect(await as("admin", () => setUserBanned({ userId: id, banned: true }))).toMatchObject({ ok: true });
    expect(await sessionCount()).toBe(0);
    expect(await account(id)).toMatchObject({ banned: true });

    expect(await as("admin", () => setUserBanned({ userId: id, banned: false }))).toMatchObject({ ok: true });
    expect(await account(id)).toMatchObject({ banned: false });
  });

  it("an admin can't change or block their own account", async () => {
    expect(await as("admin", () => setUserAccess({ userId: PERSONAS.admin, access: { kind: "citizen" } }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await as("admin", () => setUserBanned({ userId: PERSONAS.admin, banned: true }))).toMatchObject({ ok: false, error: "forbidden" });
    const [me] = await withDb((db) => db.select({ role: users.platformRole, bannedAt: users.bannedAt }).from(users).where(eq(users.id, PERSONAS.admin)));
    expect(me).toEqual({ role: "admin", bannedAt: null });
  });
});

describe.skipIf(!hasDatabase)("deleting an account", () => {
  afterAll(cleanUpUsers);
  afterAll(cleanUpReports);
  afterAll(cleanUpPhotos);
  afterAll(signOutEveryone);

  it("removes the person and everything personal, and keeps their reports as nobody's", async () => {
    const id = await makeUser("Устгагдах Хүн");
    // They filed a report, said "me too" on another, and uploaded a photo they never used.
    const [own, other] = [await makeReport(), await makeReport()];
    const loose = await withDb(async (db) => {
      await db.update(reports).set({ reporterId: id }).where(eq(reports.id, own));
      await db.insert(reportConfirmations).values({ reportId: other, userId: id });
      await db.update(reports).set({ confirmationCount: 1 }).where(eq(reports.id, other));
      return storePhoto(db, { id }, jpeg());
    });
    expect(bucketObjects.has(`photos/${loose.id}.jpg`)).toBe(true);

    expect(await as("admin", () => deleteUser({ userId: id }))).toMatchObject({ ok: true });

    expect(await account(id)).toBeUndefined();
    const left = await withDb(async (db) => ({
      user: (await db.select().from(users).where(eq(users.id, id))).length,
      sessions: (await db.select().from(sessions).where(eq(sessions.userId, id))).length,
      own: (await db.select({ reporterId: reports.reporterId }).from(reports).where(eq(reports.id, own)))[0],
      other: (await db.select({ n: reports.confirmationCount }).from(reports).where(eq(reports.id, other)))[0],
      photo: (await db.select().from(reportImages).where(eq(reportImages.id, loose.id))).length,
    }));
    expect(left).toEqual({ user: 0, sessions: 0, own: { reporterId: null }, other: { n: 0 }, photo: 0 });
    expect(bucketObjects.has(`photos/${loose.id}.jpg`)).toBe(false);
  });
});

describe.skipIf(!hasDatabase)("only an owner (ADMIN_EMAILS) decides who is an admin", () => {
  const before = process.env.ADMIN_EMAILS;
  const restore = () => {
    if (before === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = before;
  };
  afterEach(restore);
  afterAll(cleanUpUsers);
  afterAll(signOutEveryone);

  const makeAdmin = async () => {
    const id = await makeUser();
    await withDb((db) => db.update(users).set({ platformRole: "admin" }).where(eq(users.id, id)));
    return id;
  };
  const roleOf = async (id: string) => (await withDb((db) => db.select({ role: users.platformRole }).from(users).where(eq(users.id, id))))[0]?.role;

  it("an admin who isn't an owner can't make an admin, nor change, block or delete one", async () => {
    process.env.ADMIN_EMAILS = "";
    const citizen = await makeUser();
    expect(await as("admin", () => setUserAccess({ userId: citizen, access: { kind: "admin" } }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await roleOf(citizen)).toBe("citizen");

    const other = await makeAdmin();
    expect(await as("admin", () => setUserAccess({ userId: other, access: { kind: "citizen" } }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await as("admin", () => setUserBanned({ userId: other, banned: true }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await as("admin", () => deleteUser({ userId: other }))).toMatchObject({ ok: false, error: "forbidden" });
    expect(await roleOf(other)).toBe("admin");

    // Everything else an admin does to non-admins still works.
    expect(await as("admin", () => setUserAccess({ userId: citizen, access: { kind: "staff", organizationId: "org-road", role: "org_staff" } }))).toMatchObject({ ok: true });
    expect(await as("admin", () => setUserBanned({ userId: citizen, banned: true }))).toMatchObject({ ok: true });
  });

  it("an owner makes an admin and takes it back", async () => {
    process.env.ADMIN_EMAILS = `${PERSONAS.admin}@demo.fixub.invalid`;
    expect(await as("admin", () => withDb(getActor))).toMatchObject({ owner: true });

    const id = await makeUser();
    const give = (access: object) => as("admin", () => setUserAccess({ userId: id, access }));
    expect(await give({ kind: "staff", organizationId: "org-road", role: "org_staff" })).toMatchObject({ ok: true });
    expect(await give({ kind: "admin" })).toMatchObject({ ok: true });
    expect(await account(id)).toMatchObject({ role: "admin" });
    expect(await membershipsOf(id)).toEqual([]);

    expect(await give({ kind: "citizen" })).toMatchObject({ ok: true });
    expect(await roleOf(id)).toBe("citizen");

    const other = await makeAdmin();
    expect(await as("admin", () => setUserBanned({ userId: other, banned: true }))).toMatchObject({ ok: true });
  });

  it("a new account is never an owner, and neither is an admin from the database", async () => {
    process.env.ADMIN_EMAILS = "";
    expect(await as("admin", () => withDb(getActor))).toMatchObject({ role: "admin", owner: false });
    expect(await as("citizen", () => withDb(getActor))).toMatchObject({ role: "citizen", owner: false });
  });
});

describe.skipIf(!hasDatabase)("ADMIN_EMAILS: the first admins", () => {
  const before = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (before === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = before;
  });
  afterAll(signOutEveryone);

  it("makes a listed, verified email an admin without touching the database", async () => {
    expect(await as("citizen", () => withDb(getActor))).toMatchObject({ role: "citizen" });

    process.env.ADMIN_EMAILS = ` someone@example.org, ${PERSONAS.citizen.toUpperCase()}@demo.fixub.invalid `;
    expect(await as("citizen", () => withDb(getActor))).toMatchObject({ role: "admin", platformRole: "admin" });
    expect(await as("otherCitizen", () => withDb(getActor))).toMatchObject({ role: "citizen" });
    expect(await account(PERSONAS.citizen)).toMatchObject({ role: "admin", fixedAdmin: true });

    const [row] = await withDb((db) => db.select({ role: users.platformRole }).from(users).where(eq(users.id, PERSONAS.citizen)));
    expect(row.role).toBe("citizen");
  });
});
