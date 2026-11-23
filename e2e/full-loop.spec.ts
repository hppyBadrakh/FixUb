// The full loop, on three "devices" (three separate browser contexts, so nothing is shared
// between them except the server):
//
//   citizen reports with a photo → admin sets the priority and assigns it → staff resolve it
//   with a completion photo → the citizen confirms it is fixed
//
// Chromium runs with a fake camera (see playwright.config.ts), so the camera-only photo steps work.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { signInAs, type DemoUser } from "./helpers";

/** A fresh browser, in English, signed in as a demo user. */
async function device(browser: Browser, user: DemoUser): Promise<Page> {
  const context = await browser.newContext({ permissions: ["camera"] });
  await context.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  const page = await context.newPage();
  await signInAs(page, user);
  return page;
}

/** Presses the shutter once the (fake) camera is delivering frames. */
async function takePhoto(page: Page) {
  await expect.poll(() => page.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
}

const DESCRIPTION = `E2E: a pothole about a metre wide, cars swerve around it (${Date.now().toString(36)}).`;

test.describe.serial("full loop: report → priority → assign → resolve → confirm", () => {
  test.setTimeout(180_000);
  let citizen: Page;
  let ref: string;
  let id: string;

  test("citizen submits a report with a photo", async ({ browser }) => {
    citizen = await device(browser, "citizen");
    await citizen.goto("/reports/new");

    // 1. Photo, straight from the camera.
    await takePhoto(citizen);
    await expect(citizen.getByRole("button", { name: "Retake photo 1" })).toBeVisible();
    await citizen.getByRole("button", { name: "Continue" }).click();

    // 2. Category and what exactly is wrong.
    await citizen.locator('input[name="category"][value="roads"]').check({ force: true });
    await citizen.locator('input[name="subcategory"]').first().check({ force: true });
    await citizen.getByRole("button", { name: "Continue" }).click();

    // 3. Location, through the place search (no dragging the map).
    await citizen.getByLabel("Search a street or place").fill("Zaisan");
    await citizen.getByRole("button", { name: "Zaisan" }).click();
    await citizen.getByRole("button", { name: "Continue" }).click();
    // Nearby open reports of the same kind may be offered first: this is a new one.
    if (await citizen.getByRole("heading", { name: "Is it one of these?" }).isVisible()) {
      await citizen.getByRole("button", { name: "Continue" }).click();
    }

    // 4. Description. 5. Check and submit.
    await citizen.getByLabel("What's wrong?").fill(DESCRIPTION);
    await citizen.getByRole("button", { name: "Continue" }).click();
    await citizen.getByRole("button", { name: "Submit report" }).click();

    await expect(citizen.getByText("Your report is public now")).toBeVisible();
    ref = (await citizen.getByText(/^FX-\d{2}-\d{5,}$/).textContent())!;
    await citizen.getByRole("link", { name: "View my report" }).click();
    await expect(citizen).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
    id = citizen.url().split("/").pop()!;
    await expect(citizen.getByText(DESCRIPTION)).toBeVisible();
    // The photo comes from the server, not from this browser's storage.
    await expect(citizen.locator(`img[src^="/api/v1/photos/"]`).first()).toBeVisible();
  });

  test("admin on another device sees it, sets the priority and assigns it", async ({ browser }) => {
    const admin = await device(browser, "admin");
    await admin.goto("/admin/reports");
    await expect(admin.getByText(ref).first()).toBeVisible();

    await admin.goto(`/admin/reports/${id}`);
    await expect(admin.getByText(DESCRIPTION)).toBeVisible();
    await admin.getByRole("button", { name: "High", exact: true }).click();
    await admin.getByLabel("Internal note").fill("Near a school");
    await admin.getByRole("button", { name: "Set priority" }).click();
    await expect(admin.getByText("Priority set")).toBeVisible();

    await admin.getByLabel("Organization").selectOption("org-road");
    await admin.getByLabel("Repair unit").selectOption("unit-road-a");
    await admin.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(admin.getByText("Assigned", { exact: true })).toBeVisible();
    await expect(admin.getByText("Now:")).toContainText("Road Maintenance");
    await admin.context().close();
  });

  test("staff of that organization resolve it with a completion photo; other staff can't open it", async ({ browser }) => {
    const staff = await device(browser, "roadStaff");
    await staff.goto("/staff");
    await expect(staff.getByText(ref).first()).toBeVisible();

    await staff.goto(`/staff/reports/${id}`);
    await expect(staff.getByText("Near a school")).toBeVisible(); // the internal note, for assigned staff
    await staff.getByLabel("New status").selectOption("resolved");
    await staff.getByLabel("Public note").fill("The pothole has been filled.");
    await staff.getByRole("button", { name: "Take photo with camera" }).click();
    await takePhoto(staff);
    await expect(staff.getByRole("img", { name: "Completion photo" })).toBeVisible();
    await staff.getByRole("button", { name: "Save status" }).click();
    await expect(staff.getByText("Status updated")).toBeVisible();
    await staff.context().close();

    const outsider = await device(browser, "lightStaff");
    await outsider.goto(`/staff/reports/${id}`);
    await expect(outsider.getByText(DESCRIPTION)).toHaveCount(0);
    await expect(outsider.getByLabel("New status")).toHaveCount(0);
    await outsider.context().close();
  });

  test("the citizen sees it resolved without reloading, and confirms it is fixed", async () => {
    // The page has been open since the first step: the change arrives by polling (15 s).
    await expect(citizen.getByText("The pothole has been filled.")).toBeVisible({ timeout: 45_000 });
    await expect(citizen.getByText("Road Maintenance (demo)").first()).toBeVisible();
    await expect(citizen.getByText("Near a school")).toHaveCount(0);

    await citizen.getByRole("button", { name: "Fixed", exact: true }).click();
    await expect(citizen.getByText("Thanks — recorded as fixed")).toBeVisible();
    await expect(citizen.getByText("say fixed")).toContainText("1");
    await citizen.context().close();
  });
});
