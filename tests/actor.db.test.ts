// getActor(): session cookie → the user's role and organization, read from the database.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { getActor } from "@/server/actor";
import { withDb } from "@/server/db";
import { as, cookieOf, hasDatabase, PERSONAS, signOutEveryone, withCookie } from "./helpers/personas";

const whoAmI = () => withDb(getActor);

describe.skipIf(!hasDatabase)("getActor", () => {
  afterAll(signOutEveryone);

  it("is null for a visitor who isn't signed in", async () => {
    expect(await as("signedOut", whoAmI)).toBeNull();
  });

  it("ignores a forged or tampered session cookie", async () => {
    const real = (await cookieOf("admin"))!;
    expect(await withCookie(real, whoAmI)).toMatchObject({ id: PERSONAS.admin });

    // Same cookie with one character of the session token changed: the signature no longer fits.
    const at = real.indexOf("=") + 1;
    const tampered = real.slice(0, at) + (real[at] === "A" ? "B" : "A") + real.slice(at + 1);
    expect(await withCookie(tampered, whoAmI)).toBeNull();

    const name = real.slice(0, at - 1);
    expect(await withCookie(`${name}=not-a-session.not-a-signature`, whoAmI)).toBeNull();
  });

  it("gives a citizen no organization", async () => {
    const actor = await as("citizen", whoAmI);
    expect(actor).toMatchObject({ id: PERSONAS.citizen, role: "citizen", platformRole: "citizen", memberships: [] });
    expect(actor?.organizationId).toBeUndefined();
  });

  it("gives an admin the admin role and no organization", async () => {
    const actor = await as("admin", whoAmI);
    expect(actor).toMatchObject({ id: PERSONAS.admin, role: "admin", platformRole: "admin" });
    expect(actor?.organizationId).toBeUndefined();
  });

  it("gives staff and managers their own organization", async () => {
    const staff = await as("roadStaff", whoAmI);
    const manager = await as("roadManager", whoAmI);
    const other = await as("lightStaff", whoAmI);
    expect(staff).toMatchObject({
      role: "org_staff",
      memberships: [{ organizationSlug: "org-road", role: "org_staff", unitSlug: "unit-road-a" }],
    });
    expect(manager).toMatchObject({ role: "org_manager", memberships: [{ organizationSlug: "org-road", role: "org_manager" }] });
    expect(other).toMatchObject({ role: "org_staff", memberships: [{ organizationSlug: "org-light" }] });
    expect(staff?.organizationId).toBeTruthy();
    expect(manager?.organizationId).toBe(staff?.organizationId);
    expect(other?.organizationId).not.toBe(staff?.organizationId);
  });

  it("signs a banned user out at once, without waiting for the session to expire", async () => {
    const id = PERSONAS.otherCitizen;
    expect(await as("otherCitizen", whoAmI)).toMatchObject({ id });
    await withDb((db) => db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, id)));
    try {
      expect(await as("otherCitizen", whoAmI)).toBeNull();
    } finally {
      await withDb((db) => db.update(users).set({ bannedAt: null }).where(eq(users.id, id)));
    }
    expect(await as("otherCitizen", whoAmI)).toMatchObject({ id });
  });
});
