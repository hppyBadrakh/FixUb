// What already runs on the real database: sign-in, the categories console, photo upload.
import { expect, test } from "@playwright/test";
import { me, signInAs, testJpeg, TEST_PHOTO, USERS } from "./helpers";

test("the server has a database and the demo login", async ({ page }) => {
  expect(await me(page)).toMatchObject({ configured: true, demoLogin: true, user: null });
});

test("a visitor sees the public map page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("main")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the role picker signs in as the admin and opens the console", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Бадрах/ }).click();
  await expect(page).toHaveURL(/\/admin/);
  expect((await me(page)).user).toMatchObject({ id: USERS.admin, role: "admin" });
});

test("the categories console shows the tree from the database", async ({ page }) => {
  await signInAs(page, "admin");
  const loaded = page.waitForResponse((r) => r.url().endsWith("/api/v1/categories") && r.request().method() === "GET");
  await page.goto("/admin/categories");
  const body = (await (await loaded).json()) as { data: { categories: { name: { mn: string } }[] } };
  expect(body.data.categories.length).toBeGreaterThan(0);

  // The first category's Mongolian name is in one of the editor's fields.
  const name = body.data.categories[0].name.mn;
  await expect
    .poll(() => page.locator("input").evaluateAll((els, n) => els.some((el) => (el as HTMLInputElement).value === n), name))
    .toBe(true);
});

test("a photo uploaded by a citizen is served back to them, and to nobody else yet", async ({ page, browser }) => {
  await signInAs(page, "citizen");
  const bytes = testJpeg();
  const upload = await page.request.post("/api/v1/photos", { headers: { "Content-Type": "image/jpeg" }, data: bytes });
  expect(upload.status()).toBe(200);
  const photo = ((await upload.json()) as { data: { id: string; url: string; width: number; height: number } }).data;
  expect(photo).toMatchObject({ ...TEST_PHOTO, url: `/api/v1/photos/${photo.id}` });

  const mine = await page.request.get(photo.url);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toBe("image/jpeg");
  expect(Buffer.compare(await mine.body(), bytes)).toBe(0);

  // Not on a report yet: a visitor can't see it.
  const visitor = await browser.newContext();
  expect((await visitor.request.get(photo.url)).status()).toBe(404);
  await visitor.close();
});

test("a visitor can't upload a photo", async ({ page }) => {
  const res = await page.request.post("/api/v1/photos", { headers: { "Content-Type": "image/jpeg" }, data: testJpeg() });
  expect(res.status()).toBe(401);
});
