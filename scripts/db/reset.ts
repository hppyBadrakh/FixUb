// npm run db:reset           local database: drop everything, re-apply all migrations, re-seed
// npm run db:reset -- --yes  the same on a remote database (your own Neon branch)
//
// Destroys all data in the database DATABASE_URL points at. Never run it on production.
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { isLocalDatabase } from "../../src/db/client";
import { seedDatabase } from "../../src/db/seed";
import { main, openDatabase } from "./env";

void main(async () => {
  const { db, close, label, options } = openDatabase();
  try {
    if (!isLocalDatabase(options.connectionString) && !process.argv.includes("--yes")) {
      throw new Error(
        `${label} is not a local database, and db:reset deletes ALL of its data.\n` +
          "If this is your own dev branch, run `npm run db:reset -- --yes`.",
      );
    }
    console.log(`Resetting ${label} …`);
    // `drizzle` holds the list of applied migrations; PostGIS lives in `public` and is re-created by 0000.
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await migrate(db, { migrationsFolder: "drizzle" });
    const n = await seedDatabase(db);
    console.log(`Done: migrations applied, ${n.reports} reports seeded.`);
  } finally {
    await close();
  }
});
