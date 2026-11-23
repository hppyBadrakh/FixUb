// npm run db:go-live           shows what would be deleted, and deletes nothing
// npm run db:go-live -- --yes  deletes it
//
// Turns a database that was filled with `npm run db:seed` into an empty one for real use:
//
//   deleted   every report (with its photos, timeline, flags and "me too"), the audit log,
//             the sample users (…@demo.fixub.invalid) and the sample organizations ("… (demo)")
//   kept      the category tree, real accounts and their access, real organizations
//
// The reference numbers start again at FX-yy-00001. This can't be undone: take a backup or a
// Neon branch first. After it, turn the sample login off (DEMO_LOGIN) — see "Going live" in the README.
import { count, inArray, like, or, sql } from "drizzle-orm";
import * as s from "../../src/db/schema";
import { main, openDatabase } from "./env";

void main(async () => {
  const { db, close, label } = openDatabase();
  try {
    const sampleUsers = like(s.users.email, "%@demo.fixub.invalid");
    const sampleOrgs = or(like(s.organizations.nameEn, "%(demo)"), like(s.organizations.nameMn, "%(демо)"));
    const n = async (query: PromiseLike<{ n: number }[]>) => (await query)[0].n;
    const reports = await n(db.select({ n: count() }).from(s.reports));
    const photos = await n(db.select({ n: count() }).from(s.reportImages));
    const audit = await n(db.select({ n: count() }).from(s.auditEvents));
    const users = await n(db.select({ n: count() }).from(s.users).where(sampleUsers));
    const realUsers = (await n(db.select({ n: count() }).from(s.users))) - users;
    const orgs = await n(db.select({ n: count() }).from(s.organizations).where(sampleOrgs));
    const realOrgs = (await n(db.select({ n: count() }).from(s.organizations))) - orgs;
    console.log(`Database: ${label}`);
    console.log(`  to delete: ${reports} reports, ${photos} photos, ${audit} audit entries, ${users} sample users, ${orgs} sample organizations`);
    console.log(`  to keep:   ${realUsers} real accounts, ${realOrgs} real organizations, the category tree`);

    if (!process.argv.includes("--yes")) {
      console.log("\nNothing was deleted. To delete, run: npm run db:go-live -- --yes");
      return;
    }
    if (realUsers === 0) {
      throw new Error(
        "There is no real account yet, so nobody could sign in afterwards.\n" +
          "Set ADMIN_EMAILS, sign in with Google once, check that /admin/users opens, then run this again.",
      );
    }

    await db.transaction(async (tx) => {
      // Photo bytes kept in Postgres have no foreign key to their photo: delete them by key first.
      const keys = (await tx.select({ key: s.reportImages.storageKey }).from(s.reportImages)).map((r) => r.key);
      if (keys.length) await tx.delete(s.photoBlobs).where(inArray(s.photoBlobs.storageKey, keys));
      await tx.delete(s.reportImages);
      // Duplicates point at other reports: unlink them so the delete order doesn't matter.
      await tx.execute(sql`UPDATE ${s.reports} SET status = 'reported', closure_reason = NULL, duplicate_of_id = NULL, resolved_at = NULL`);
      await tx.delete(s.reports); // timeline, confirmations, verdicts and flags go with them
      await tx.delete(s.auditEvents);
      await tx.delete(s.rateLimitBuckets);
      await tx.delete(s.users).where(sampleUsers); // their sessions and memberships go with them
      await tx.delete(s.organizations).where(sampleOrgs); // their units go with them; categories lose their owner
      await tx.execute(sql`SELECT setval('report_ref_seq', 1, false)`);
    });
    console.log("\nDone. The database is empty and ready for real reports.");
    console.log("Photos stored in R2 (if the bucket is in use) are not touched: empty the bucket separately.");
  } finally {
    await close();
  }
});
