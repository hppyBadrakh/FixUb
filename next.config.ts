import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents and partialPrefetching stay off: they hang on the Cloudflare Workers runtime
  // (every request returns 500), and FixUB gains nothing from them because its data is in the browser.
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
