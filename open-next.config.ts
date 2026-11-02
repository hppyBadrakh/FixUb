import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All demo data lives in the browser, so no incremental cache (R2/KV) is needed.
export default {
  ...defineCloudflareConfig(),
  // `npm run build` runs OpenNext, so OpenNext must call Next.js directly to avoid a loop.
  buildCommand: "npm run build:next",
};
