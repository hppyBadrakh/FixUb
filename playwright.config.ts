// End-to-end tests: a real browser against the real app and database (`npm run e2e`).
// They need what `npm test` needs: DATABASE_URL, DEMO_LOGIN=true and the seed.
import { defineConfig, devices } from "@playwright/test";

// Sign-in only accepts requests from BETTER_AUTH_URL, which is http://localhost:3000 locally and in CI.
const baseURL = "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  // One database, shared by every test: run them one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  globalTeardown: "./e2e/teardown.ts",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/login`,
    // Locally, a dev server you already have running is used as it is.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
