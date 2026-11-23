// The public statistics page shows the server's numbers (GET /api/v1/statistics, counted in SQL),
// to a visitor who is not signed in, and follows the period switch.
import { expect, test, type Page } from "@playwright/test";

async function numbers(page: Page, days: 7 | 30 | 90) {
  const res = await page.request.get(`/api/v1/statistics?days=${days}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { data: { open: number; resolved: number; openOver14: number; total: number; byStatus: Record<string, number> } }).data;
}

/** The big number of a KPI card, found by the card's label. */
const kpi = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..").locator("p").nth(1);

test("a visitor sees the database's numbers, for the period they pick", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  const page = await context.newPage();

  const month = await numbers(page, 30);
  await page.goto("/statistics");
  await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
  await expect(kpi(page, "Open reports")).toHaveText(String(month.open));
  await expect(kpi(page, "Resolved · 30 days")).toHaveText(String(month.resolved));
  await expect(kpi(page, "Open > 14 days")).toHaveText(String(month.openOver14));
  // The footer says where the numbers come from.
  await expect(page.getByText(`Figures are counted in the database (last 30 days).`)).toBeVisible();

  const week = await numbers(page, 7);
  const asked = page.waitForResponse((r) => r.url().includes("/api/v1/statistics?days=7") && r.ok());
  await page.getByRole("radio", { name: "7 days" }).click();
  await asked;
  await expect(kpi(page, "Resolved · 7 days")).toHaveText(String(week.resolved));
  // Current-state numbers do not depend on the period.
  await expect(kpi(page, "Open reports")).toHaveText(String(week.open));
  expect(week.open).toBe(month.open);
});
