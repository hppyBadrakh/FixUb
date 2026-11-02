// MapLibre GL v6 runs its tile parsing in a separate worker file that bundlers don't emit.
// Copy it into /public so the map can load it from /vendor (see report-map.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs");
mkdirSync("public/vendor", { recursive: true });
copyFileSync(src, "public/vendor/maplibre-gl-worker.mjs");
console.log("Copied maplibre-gl-worker.mjs to public/vendor/");
