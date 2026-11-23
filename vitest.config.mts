// Server-side tests (`npm test`): permissions and rate limiting, run against a real database.
// See "Tests" in README.md.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // Next.js resolves `server-only` itself; outside Next.js it is an empty module.
      "server-only": path("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // The files share one database, and each call opens its own connection to it.
    fileParallelism: false,
    // Generous: against a remote database (Neon from a laptop) every call is a round trip of 100 ms or more.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
