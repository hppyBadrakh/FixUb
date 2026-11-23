// The report form's "is it one of these?" hint, with the nearby reports found by the server
// (GET /api/v1/reports/nearby, PostGIS). Another citizen's open report is put on the spot the
// form is about to pick; the signed-in citizen is offered it, and can add a "me too" instead.
import { existsSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { categories, reports, reportStatusEvents, subcategories } from "../src/db/schema";
import { signInAs, USERS } from "./helpers";

// Narantuul market in src/lib/places.ts. The full loop reports at Zaisan: keep them apart.
const PLACE = { name: "Narantuul market", lng: 106.9549, lat: 47.9095 };
const LANDMARK = "E2E nearby pothole";
// When the map can't load (offline CI), it moves the pick back to the city centre (src/lib/meta.ts),
// so the same report is filed there too: whichever spot the form ends up on has one to offer.
const SPOTS = [PLACE, { lng: 106.917, lat: 47.918 }];

async function fileNearbyReport(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { db, close } = createDb({
    connectionString: process.env.DATABASE_URL!.trim(),
    wsProxy: process.env.DATABASE_WS_PROXY?.trim() || undefined,
  });
  try {
    const [sub] = await db
      .select({ id: subcategories.id, categoryId: subcategories.categoryId })
      .from(subcategories)
      .innerJoin(categories, eq(categories.id, subcategories.categoryId))
      .where(and(eq(categories.slug, "roads"), eq(subcategories.slug, "pothole")));
    for (const spot of SPOTS) {
      const [report] = await db
        .insert(reports)
        .values({
          ref: `FX-00-${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
          reporterId: USERS.otherCitizen,
          clientRequestId: crypto.randomUUID(),
          categoryId: sub.categoryId,
          subcategoryId: sub.id,
          // "E2E:" is what e2e/teardown.ts looks for to delete it again.
          description: "E2E: a pothole on the market road, filed to be found as a nearby report.",
          location: { x: spot.lng, y: spot.lat },
          addressHint: LANDMARK,
          district: "bayanzurkh",
        })
        .returning({ id: reports.id });
      await db.insert(reportStatusEvents).values({
        reportId: report.id,
        fromStatus: null,
        toStatus: "reported",
        actorId: USERS.otherCitizen,
        actorKind: "citizen",
      });
    }
  } finally {
    await close();
  }
}

async function openLocationStep(page: Page) {
  await page.goto("/reports/new");
  await expect.poll(() => page.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retake photo 1" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="category"][value="roads"]').check({ force: true });
  await page.locator('input[name="subcategory"]').first().check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Search a street or place").fill("Narantuul");
  await page.getByRole("button", { name: PLACE.name }).click();
}

/** A fresh browser, signed in as the citizen, taken to the location step with the hint on its way. */
async function citizenAtTheHint(browser: Browser): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ permissions: ["camera"] });
  await context.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  const page = await context.newPage();
  await signInAs(page, "citizen");
  const answered = page.waitForResponse((r) => r.url().includes("/api/v1/reports/nearby") && r.status() === 200);
  await openLocationStep(page);
  // One tap is enough, even if the server is still looking when it happens.
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await (await answered).json()).data.candidates.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Is it one of these?" })).toBeVisible();
  await expect(page.getByText(LANDMARK).first()).toBeVisible();
  return { page, context };
}

test.describe("nearby reports in the report form", () => {
  test.setTimeout(120_000);
  test.beforeAll(fileNearbyReport);

  test("a me-too on the hint adds to the existing report instead of filing a duplicate", async ({ browser }) => {
    const { page, context } = await citizenAtTheHint(browser);
    await page.getByRole("button", { name: "Me too" }).first().click();
    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
    await expect(page.getByText(LANDMARK).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "You added yourself" })).toBeVisible();
    await context.close();
  });

  test('"None of these" goes on with a new report', async ({ browser }) => {
    const { page, context } = await citizenAtTheHint(browser);
    await page.getByRole("button", { name: /None of these/ }).click();
    await expect(page.getByLabel("What's wrong?")).toBeVisible();
    await context.close();
  });
});
