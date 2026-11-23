// Citizen screens on a small phone (360 px wide), in Mongolian and in English: the page must
// not scroll sideways, and must not throw.
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

const PAGES = ["/", "/?view=list", "/statistics", "/login", "/my-reports", "/reports/new", "/privacy", "/terms"];

for (const lang of ["mn", "en"] as const) {
  test(`citizen screens fit a 360 px phone (${lang})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, permissions: ["camera"] });
    await context.addInitScript((l) => window.localStorage.setItem("fixub-lang", l), lang);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await signInAs(page, "citizen");

    // A real report page too: the first one the public list links to.
    const reports = (await (await page.request.get("/api/v1/reports")).json()) as { data: { reports: { id: string }[] } };
    const paths = [...PAGES, `/reports/${reports.data.reports[0].id}`];

    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      // Loading skeletons are replaced by the page once the store has its answers.
      await expect(page.locator(".fx-skeleton").first()).toBeHidden();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}
