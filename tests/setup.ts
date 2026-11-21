// Runs before every test file: reads .env.local (the same database `npm run dev` uses), and
// replaces the one thing the server code needs from a live Next.js request: `headers()`.
import { existsSync } from "node:fs";
import { vi } from "vitest";
import { requestHeaders } from "./helpers/request";

// Variables that are already set (CI) win over the file.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in CI: the permission tests would be skipped silently.");
}

vi.mock("next/headers", () => ({ headers: async () => requestHeaders() }));
