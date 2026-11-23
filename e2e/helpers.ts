import { expect, type Browser, type Page } from "@playwright/test";

/** Seeded demo users (src/lib/data/seed.ts). */
export const USERS = {
  citizen: "u-citizen",
  otherCitizen: "u-citizen-2",
  admin: "u-admin",
  roadStaff: "u-road-staff",
  roadManager: "u-road-mgr",
  lightStaff: "u-light-staff",
} as const;
export type DemoUser = keyof typeof USERS;

interface Me {
  configured: boolean;
  demoLogin: boolean;
  user: { id: string; role: string } | null;
}

export async function me(page: Page): Promise<Me> {
  const res = await page.request.get("/api/v1/me");
  expect(res.status()).toBe(200);
  return ((await res.json()) as { data: Me }).data;
}

/** Signs this browser in through the demo-login endpoint (the same call the role picker makes). */
export async function signInAs(page: Page, user: DemoUser): Promise<void> {
  // Signing in is setup, not what a test checks: one dropped database connection must not fail it.
  await expect(async () => {
    const res = await page.request.post("/api/auth/demo/sign-in", { data: { userId: USERS[user] } });
    expect(res.status(), `demo sign-in as ${user}: is DEMO_LOGIN=true and the database seeded?`).toBe(200);
  }).toPass({ intervals: [500, 2000], timeout: 20_000 });
  expect((await me(page)).user?.id).toBe(USERS[user]);
}

/**
 * A tiny JPEG with a size no camera produces, so e2e/teardown.ts can find and delete the
 * photos these tests leave unattached.
 */
export const TEST_PHOTO = { width: 1234, height: 777 } as const;
export function testJpeg(): Buffer {
  const { width, height } = TEST_PHOTO;
  const jfif = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const frame = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  return Buffer.from([0xff, 0xd8, ...jfif, ...frame, 0xff, 0xd9]);
}

/** A fresh browser (its own cookies and storage), in English, signed in as a demo user. */
export async function device(browser: Browser, user: DemoUser): Promise<Page> {
  const context = await browser.newContext({ permissions: ["camera"] });
  await context.addInitScript(() => window.localStorage.setItem("fixub-lang", "en"));
  // An empty map style, served here: the tests then don't depend on the map provider being
  // reachable, and the map still becomes ready (it jumps to a searched place, which sets the pick).
  await context.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  const page = await context.newPage();
  await signInAs(page, user);
  return page;
}

/** Presses the shutter once the (fake) camera is delivering frames. */
export async function takePhoto(page: Page) {
  await expect.poll(() => page.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
}
