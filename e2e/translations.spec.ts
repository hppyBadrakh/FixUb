// Text the citizen screens must show in the language the visitor picked.
import { expect, test, type Browser } from "@playwright/test";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { categories, reports, reportStatusEvents, subcategories } from "../src/db/schema";
import { me } from "./helpers";

async function page(browser: Browser, lang: "mn" | "en") {
  const context = await browser.newContext();
  await context.addInitScript((l) => window.localStorage.setItem("fixub-lang", l), lang);
  await context.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  return context.newPage();
}

for (const [lang, home] of [["mn", "FixUB — нүүр хуудас"], ["en", "FixUB — home"]] as const) {
  test(`the logo link is named in the page's language (${lang})`, async ({ browser }) => {
    const p = await page(browser, lang);
    await p.goto("/statistics");
    await expect(p.getByRole("link", { name: home })).toBeVisible();
    await expect(p.getByRole("link", { name: lang === "mn" ? "FixUB — home" : "FixUB — нүүр хуудас" })).toHaveCount(0);
  });
}

for (const [lang, title] of [["mn", "Google-ээр нэвтрэх боломжгүй байна"], ["en", "Google sign-in isn't available"]] as const) {
  test(`when Google sign-in isn't configured, the login page says so plainly (${lang})`, async ({ browser }) => {
    const p = await page(browser, lang);
    test.skip((await me(p)).google, "this server has Google sign-in");
    await p.goto("/login");
    await expect(p.getByText(title)).toBeVisible();
    await expect(p.getByText(/isn't set up on this server|тохируулагдаагүй/)).toHaveCount(0);
  });
}

test("a GPS accuracy is shown with the language's unit", async ({ browser }) => {
  // A report with a GPS accuracy (no seeded report has one). Its description starts with "E2E:", so the teardown removes it.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { db, close } = createDb({ connectionString: process.env.DATABASE_URL!.trim(), wsProxy: process.env.DATABASE_WS_PROXY?.trim() || undefined });
  let id: string;
  try {
    const [sub] = await db
      .select({ id: subcategories.id, categoryId: subcategories.categoryId })
      .from(subcategories)
      .innerJoin(categories, eq(categories.id, subcategories.categoryId))
      .where(and(eq(categories.slug, "roads"), eq(subcategories.slug, "pothole")));
    const [row] = await db
      .insert(reports)
      .values({
        ref: `FX-00-${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
        reporterId: "u-citizen",
        clientRequestId: crypto.randomUUID(),
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        description: "E2E: accuracy unit test, a pothole with a GPS fix.",
        location: { x: 106.9177, y: 47.9186 },
        locationAccuracyM: 12,
        addressHint: "E2E",
        district: "sukhbaatar",
        status: "reported",
        visibility: "visible",
      })
      .returning({ id: reports.id });
    id = row.id;
    await db.insert(reportStatusEvents).values({ reportId: id, fromStatus: null, toStatus: "reported", actorId: "u-citizen", actorKind: "citizen" });
  } finally {
    await close();
  }

  for (const [lang, unit] of [["mn", "± 12 м (GPS)"], ["en", "± 12 m (GPS)"]] as const) {
    const p = await page(browser, lang);
    await p.goto(`/reports/${id}`);
    await expect(p.getByText(unit)).toBeVisible();
  }
});
