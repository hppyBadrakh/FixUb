// Better Auth's endpoints: /api/auth/sign-in/social, /api/auth/callback/google, /api/auth/sign-out,
// /api/auth/get-session and, when DEMO_LOGIN=true, /api/auth/demo/sign-in.
import { createAuth } from "@/server/auth";
import { withDb } from "@/server/db";
import { toErrorBody } from "@/server/errors";

async function handle(request: Request): Promise<Response> {
  try {
    return await withDb((db) => createAuth(db).handler(request));
  } catch (err) {
    // Not configured (no DATABASE_URL / BETTER_AUTH_SECRET) or the database is unreachable.
    const { status, ...error } = toErrorBody(err);
    return Response.json({ error, message: error.message }, { status });
  }
}

export { handle as GET, handle as POST };
