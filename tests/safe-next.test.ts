// safeNextPath: which `?next=` values the login page may redirect to.
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("accepts paths on this site, keeping query and hash", () => {
    expect(safeNextPath("/reports/new")).toBe("/reports/new");
    expect(safeNextPath("/my-reports?tab=open#top")).toBe("/my-reports?tab=open#top");
    expect(safeNextPath("/")).toBe("/");
  });

  it.each([
    ["empty", ""],
    ["relative", "reports/new"],
    ["absolute URL", "https://evil.com"],
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["backslash later", "/a\\b"],
    ["tab inside", "/\t/evil.com"],
    ["newline inside", "/\n/evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
  ])("rejects %s", (_name, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});
