// The map library, for the browser only.
//
// `import("@/lib/map-library")` gives MapLibre GL in the browser and this empty module on the
// server: next.config.ts aliases it to "maplibre-gl" for browser builds only. The map is drawn
// in an effect, which never runs on the server, but a plain `import("maplibre-gl")` still made
// the bundler put the whole library (about 1 MB) into the Worker.
export {};
