// npm run db:migrate: applies every SQL file in drizzle/ that this database hasn't run yet.
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { main, openDatabase } from "./env";

void main(async () => {
  const { db, close, label } = openDatabase();
  try {
    console.log(`Migrating ${label} …`);
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Migrations are up to date.");
  } finally {
    await close();
  }
});
