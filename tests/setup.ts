// Runs before every test file: reads .env.local (the same database `npm run dev` uses), and
// replaces the two things the server code needs from outside: `headers()` of the live Next.js
// request, and the Cloudflare R2 bucket for photos.
import { existsSync } from "node:fs";
import { vi } from "vitest";
import { requestHeaders } from "./helpers/request";

// Variables that are already set (CI) win over the file.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in CI: the permission tests would be skipped silently.");
}

vi.mock("next/headers", () => ({ headers: async () => requestHeaders() }));

// The R2 bucket binding: an in-memory stand-in, so photo tests need no Cloudflare account.
vi.mock("@opennextjs/cloudflare", async () => {
  const { fakeBucket } = await import("./helpers/photos");
  return { getCloudflareContext: async () => ({ env: { PHOTOS: fakeBucket } }) };
});
