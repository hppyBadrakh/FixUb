import { defineConfig } from "drizzle-kit";

// Used by `npm run db:generate` only, which compares src/db/schema.ts with the snapshots in
// drizzle/meta and needs no database. Migrations are applied by scripts/db-migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // PostGIS creates its own tables (spatial_ref_sys …): never treat them as ours.
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
