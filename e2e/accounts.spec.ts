// Sign-in related screens: the notice before a first report, and the admin's Users page.
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { createDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { signInAs, USERS } from "./helpers";

/** Makes the sample "other citizen" someone who has never accepted the notice. */
async function forgetConsent(userId: string) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { db, close } = createDb({ connectionString: process.env.DATABASE_URL!.trim(), wsProxy: process.env.DATABASE_WS_PROXY?.trim() || undefined });
  try {
    await db.update(users).set({ consentedAt: null, consentVersion: null }).where(eq(users.id, userId));
  } finally {
    await close();
  }
}

test("a first-time reporter is told what becomes public, once", async ({ browser }) => {
  await forgetConsent(USERS.otherCitizen);
  const context = await browser.newContext({ permissions: ["camera"] });
  await context.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  const page = await context.newPage();
  await signInAs(page, "otherCitizen");

  await page.goto("/reports/new");
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  await expect(page.getByText("Your name and email are never shown publicly.")).toBeVisible();
  await page.getByRole("button", { name: "I understand, continue" }).click();
  await expect(page.getByRole("heading", { name: "Take a photo of the problem" })).toBeVisible();

  // Not asked again.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Take a photo of the problem" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before you start" })).toHaveCount(0);
  await context.close();
});

test("the Users page lists accounts, finds one by name, and protects the admin's own row", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  const page = await context.newPage();
  await signInAs(page, "admin");

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  const mine = page.getByRole("listitem").filter({ hasText: "You" }).first();
  await expect(mine).toContainText("you can't change your own access");
  await expect(mine.getByRole("button", { name: "Save" })).toHaveCount(0);

  // A staff member's row shows their organization, and Save only wakes up after a change.
  await page.getByLabel("Search by name or email").fill("u-road-staff");
  const staff = page.getByRole("listitem").filter({ hasText: "u-road-staff@" });
  await expect(staff).toHaveCount(1);
  await expect(staff.getByLabel("Access")).toHaveValue("org_staff");
  await expect(staff.getByLabel("Organization")).toHaveValue("org-road");
  await expect(staff.getByRole("button", { name: "Save" })).toBeDisabled();
  await staff.getByLabel("Unit").selectOption("unit-road-b");
  await expect(staff.getByRole("button", { name: "Save" })).toBeEnabled();
  await context.close();
});

test("a citizen can't open the Users page or its data", async ({ page }) => {
  await signInAs(page, "citizen");
  expect((await page.request.get("/api/v1/admin/accounts")).status()).toBe(403);
  await page.goto("/admin/users");
  await expect(page.getByLabel("Search by name or email")).toHaveCount(0);
});

test("the privacy and terms pages are public, linked, and say they are drafts", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  await page.goto("/login");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await expect(page.getByText("Who filed a report is never shown")).toBeVisible();
  await expect(page.getByText("It has not been reviewed by a lawyer")).toBeVisible();

  await page.getByRole("link", { name: "Terms of use" }).click();
  await expect(page.getByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();
  await expect(page.getByText("FixUB is not an emergency service.")).toBeVisible();
});
