import type { NextConfig } from "next";

// Sent with every page and API answer. No Content-Security-Policy yet: the map (web worker,
// tiles from another origin) and the inline theme script need one written and tested with care.
const securityHeaders = [
  // Browsers must not guess a file's type (an upload served as a script, for example).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The site can't be put inside a frame on another site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera and location are used by our own pages only; nothing else is.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // cacheComponents and partialPrefetching stay off: they hang on the Cloudflare Workers runtime
  // (every request returns 500), and FixUB gains nothing from them: its pages show live data.
  reactCompiler: true,
  turbopack: {
    // Keeps the map library out of the server bundle (see src/lib/map-library.ts).
    resolveAlias: {
      "@/lib/map-library": { browser: "maplibre-gl" },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
