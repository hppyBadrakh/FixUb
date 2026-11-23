// The duplicate hint of the report flow (FR-004), on two "devices": one person reports, a second
// person reporting the same problem at the same spot is offered the first report, and the first
// person (whose own report it is) is not.
import { expect, test, type Page } from "@playwright/test";
import { device, takePhoto } from "./helpers";

const DESCRIPTION = `E2E: hint test, a broken kerb at the bus stop (${Date.now().toString(36)}).`;

/** Photo → roads → Zaisan → Continue on the location step. Leaves the flow on whatever comes next. */
async function reportUpToLocation(page: Page) {
  await page.goto("/reports/new");
  await takePhoto(page);
  await expect(page.getByRole("button", { name: "Retake photo 1" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="category"][value="roads"]').check({ force: true });
  await page.locator('input[name="subcategory"]').first().check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Search a street or place").fill("Zaisan");
  await page.getByRole("button", { name: "Zaisan" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

const hint = (page: Page) => page.getByRole("heading", { name: "Is it one of these?" });
const description = (page: Page) => page.getByLabel("What's wrong?");

test.describe.serial("duplicate hint", () => {
  test.setTimeout(180_000);

  test("a report is filed", async ({ browser }) => {
    const first = await device(browser, "citizen");
    await reportUpToLocation(first);
    await expect(hint(first).or(description(first))).toBeVisible();
    if (await hint(first).isVisible()) await first.getByRole("button", { name: "None of these — continue with a new report" }).click();
    await description(first).fill(DESCRIPTION);
    await first.getByRole("button", { name: "Continue" }).click();
    await first.getByRole("button", { name: "Submit report" }).click();
    await expect(first.getByText("Your report is public now")).toBeVisible();
  });

  test("somebody else at the same spot is offered it, and can still report anyway", async ({ browser }) => {
    const second = await device(browser, "otherCitizen");
    await reportUpToLocation(second);
    await expect(hint(second)).toBeVisible();
    // Only the report from the first test is open, in this category, within 50 m of this spot.
    await expect(second.getByRole("listitem")).toHaveCount(1);
    await expect(second.getByRole("listitem")).toContainText("Zaisan");
    // The hint is a suggestion: carrying on goes to the description.
    await second.getByRole("button", { name: "None of these — continue with a new report" }).click();
    await expect(description(second)).toBeVisible();
  });

  test("the person who filed it is not offered their own report", async ({ browser }) => {
    const first = await device(browser, "citizen");
    await reportUpToLocation(first);
    await expect(description(first)).toBeVisible();
    await expect(hint(first)).toHaveCount(0);
  });
});
