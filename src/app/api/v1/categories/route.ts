// REFERENCE EXAMPLE — a read endpoint. Copy this shape for every `GET /api/v1/...`.
//
//   route.ts (this file)        thin: api() + withDb() + permission check + one query function
//   src/server/queries/*.ts     the SQL, returning exactly what the screen needs (never raw rows)
//   src/lib/api/hooks.ts        the SWR hook the screen calls: useApi<...>("/api/v1/categories")
//
// The category tree is public (the report form needs it before sign-in), so there is no
// permission check here. An endpoint that isn't public starts like this:
//
//   return api(() =>
//     withDb(async (db) => {
//       const actor = requireRole(await getActor(db), "admin");          // 401 / 403
//       // or: requireOrgMember(actor, organizationId)                    // 404 for other orgs
//       return { reports: await listReviewQueue(db) };
//     }),
//   );
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { listCategories } from "@/server/queries/categories";

export async function GET() {
  return api(() => withDb(async (db) => ({ categories: await listCategories(db) })));
}
