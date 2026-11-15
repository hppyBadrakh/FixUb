// Shared setup for the db:* scripts: load .env.local the same way Next.js does, then open the database.
import { loadEnvConfig } from "@next/env";
import { createDb, dbOptionsFromEnv, describeDatabase, type DbHandle, type DbOptions } from "../../src/db/client";

export function openDatabase(): DbHandle & { options: DbOptions; label: string } {
  // Quiet logger: db scripts print their own, shorter output.
  loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
  const options = dbOptionsFromEnv();
  if (!options) {
    console.error(
      [
        "DATABASE_URL is not set.",
        "Copy .env.example to .env.local and fill it in. For a local database run `docker compose up -d`",
        "and use the local values shown in .env.example.",
      ].join("\n"),
    );
    process.exit(1);
  }
  return { ...createDb(options), options, label: describeDatabase(options.connectionString) };
}

/** Runs a script body, closes the pool, and exits non-zero with a readable message on failure. */
export async function main(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    console.error(`\nFailed: ${e.message ?? String(err)}`);
    if (e.cause?.message) console.error(`Cause: ${e.cause.message}`);
    process.exitCode = 1;
  }
}
