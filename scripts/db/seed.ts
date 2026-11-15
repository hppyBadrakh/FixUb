// npm run db:seed            load the sample data into an EMPTY database
// npm run db:seed -- --force  replace whatever is there with the sample data
import { isDatabaseEmpty, seedDatabase } from "../../src/db/seed";
import { main, openDatabase } from "./env";

void main(async () => {
  const force = process.argv.includes("--force");
  const { db, close, label } = openDatabase();
  try {
    if (!force && !(await isDatabaseEmpty(db))) {
      throw new Error(
        `${label} already has data. Seeding deletes everything in it.\n` +
          "Run `npm run db:seed -- --force` to replace the data, or `npm run db:reset` to rebuild the database.",
      );
    }
    console.log(`Seeding ${label} …`);
    const n = await seedDatabase(db);
    console.log(
      `Seeded ${n.reports} reports, ${n.organizations} organizations (${n.units} units), ` +
        `${n.categories} categories (${n.subcategories} subcategories), ${n.users} users, ` +
        `${n.statusEvents} status events, ${n.confirmations} confirmations, ${n.feedback} verdicts, ${n.flags} flags.`,
    );
  } finally {
    await close();
  }
});
