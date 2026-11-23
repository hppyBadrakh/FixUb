// requireActor / requireRole / requireOrgMember: the rules themselves, without a database.
import { describe, expect, it } from "vitest";
import { requireActor, requireOrgMember, requireRole, type Actor, type Membership } from "@/server/actor";
import { AppError, type ErrorCode } from "@/server/errors";

const ROAD = "00000000-0000-4000-8000-00000000000a";
const LIGHT = "00000000-0000-4000-8000-00000000000b";

function member(organizationId: string, role: Membership["role"]): Membership {
  return { organizationId, organizationSlug: organizationId, role, unitId: null, unitSlug: null };
}
function actor(role: Actor["role"], memberships: Membership[] = []): Actor {
  return {
    id: `u-${role}`,
    name: role,
    email: `${role}@example.test`,
    role,
    platformRole: role === "admin" ? "admin" : "citizen",
    consented: true,
    organizationId: role === "admin" ? undefined : memberships[0]?.organizationId,
    memberships,
  };
}

const citizen = actor("citizen");
const admin = actor("admin");
const roadStaff = actor("org_staff", [member(ROAD, "org_staff")]);
const roadManager = actor("org_manager", [member(ROAD, "org_manager")]);

function outcome(fn: () => unknown): ErrorCode | "allowed" {
  try {
    fn();
    return "allowed";
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe("requireActor", () => {
  it("refuses a visitor who isn't signed in", () => {
    expect(outcome(() => requireActor(null))).toBe("signed_out");
  });
  it("returns the signed-in user", () => {
    expect(requireActor(citizen)).toBe(citizen);
  });
});

describe("requireRole", () => {
  it.each([
    ["signed out", "signed_out", null],
    ["citizen", "forbidden", citizen],
    ["staff", "forbidden", roadStaff],
    ["manager", "forbidden", roadManager],
    ["admin", "allowed", admin],
  ] as const)("admin-only: %s → %s", (_name, expected, who) => {
    expect(outcome(() => requireRole(who, "admin"))).toBe(expected);
  });

  it.each([
    ["signed out", "signed_out", null],
    ["citizen", "forbidden", citizen],
    ["staff", "allowed", roadStaff],
    ["manager", "allowed", roadManager],
    ["admin", "allowed", admin],
  ] as const)("console roles: %s → %s", (_name, expected, who) => {
    expect(outcome(() => requireRole(who, "org_staff", "org_manager", "admin"))).toBe(expected);
  });

  it("does not let an admin through a citizen-only check", () => {
    expect(outcome(() => requireRole(admin, "citizen"))).toBe("forbidden");
  });
});

describe("requireOrgMember", () => {
  it("lets staff work on their own organization", () => {
    expect(requireOrgMember(roadStaff, ROAD)).toBe(roadStaff);
    expect(requireOrgMember(roadManager, ROAD)).toBe(roadManager);
  });

  it("hides another organization's work as not_found, never forbidden", () => {
    expect(outcome(() => requireOrgMember(roadStaff, LIGHT))).toBe("not_found");
    expect(outcome(() => requireOrgMember(roadManager, LIGHT))).toBe("not_found");
    expect(outcome(() => requireOrgMember(roadManager, LIGHT, { manager: true }))).toBe("not_found");
  });

  it("refuses citizens and visitors", () => {
    expect(outcome(() => requireOrgMember(citizen, ROAD))).toBe("not_found");
    expect(outcome(() => requireOrgMember(null, ROAD))).toBe("signed_out");
  });

  it("leaves an unassigned report to admins only", () => {
    expect(outcome(() => requireOrgMember(roadStaff, null))).toBe("not_found");
    expect(outcome(() => requireOrgMember(roadManager, undefined))).toBe("not_found");
    expect(requireOrgMember(admin, null)).toBe(admin);
  });

  it("lets admins into every organization, also for manager-only steps", () => {
    expect(requireOrgMember(admin, ROAD)).toBe(admin);
    expect(requireOrgMember(admin, LIGHT, { manager: true })).toBe(admin);
  });

  it("keeps manager-only steps from staff of the same organization", () => {
    expect(outcome(() => requireOrgMember(roadStaff, ROAD, { manager: true }))).toBe("forbidden");
    expect(requireOrgMember(roadManager, ROAD, { manager: true })).toBe(roadManager);
  });

  it("checks every membership, not only the first", () => {
    const both = actor("org_staff", [member(ROAD, "org_staff"), member(LIGHT, "org_manager")]);
    expect(requireOrgMember(both, LIGHT, { manager: true })).toBe(both);
    expect(outcome(() => requireOrgMember(both, ROAD, { manager: true }))).toBe("forbidden");
  });
});
