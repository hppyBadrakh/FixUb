# FixUB

FixUB is a civic infrastructure reporting and tracking platform for Ulaanbaatar. Citizens photograph
a problem with their camera, choose a category and subcategory, confirm the location and describe
it. The FixUB team reviews each report, sets its priority and assigns it to an organization and
repair unit; staff move it through the lifecycle; citizens see the result and confirm whether it's
actually fixed.

**Where the project is.** It started as a browser-only demo (all data in `localStorage`) and is
being moved onto a real backend, screen by screen, following [TEAM_PLAN.md](TEAM_PLAN.md):
Neon Postgres + PostGIS, Drizzle, Better Auth, Cloudflare Workers.

- The database, sign-in, permissions and the pattern for APIs and server actions are in place.
- One screen, `/admin/categories`, already reads and writes Postgres. It is the reference example.
- Every other screen still runs on demo data in the browser until its owner converts it.
- Without a `DATABASE_URL` the whole app still runs as the original browser-only demo.

Organizations are fictional ("demo") and are not connected to any government body.

## Setup

You need **Node 22 or newer**, and **Docker Desktop** if you want a local database.

```bash
git clone https://github.com/hppyBadrakh/FixUb.git && cd FixUb
npm install
cp .env.example .env.local      # then edit .env.local (see "Environment variables")
```

Then choose a database:

**A. Local database in Docker** (works offline, nothing to sign up for). `.env.example` already has
the right values for it.

```bash
npm run db:up        # starts Postgres + PostGIS on port 54329, and Neon's WebSocket proxy on 54330
npm run db:migrate   # creates the tables
npm run db:seed      # loads the 32 sample reports, organizations, categories and users
npm run dev          # http://localhost:3000
```

**B. Your own Neon branch** (`dev-a`, `dev-b`, `dev-c`; A sends you the connection string).
In `.env.local` set `DATABASE_URL` to that string and leave `DATABASE_WS_PROXY` **empty**. Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

**C. No database.** Leave `DATABASE_URL` empty and run `npm run dev`: you get the browser-only demo.

Open http://localhost:3000/login and pick a demo role (needs `DEMO_LOGIN=true`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run lint` · `npm run typecheck` · `npm run build` | Run all three before asking for review. CI runs them too |
| `npm run e2e` | Browser tests in `e2e/` (Playwright); see "End-to-end tests" |
| `npm test` | Server-side tests: permissions and rate limiting, against the database in `.env.local` (see [Tests](#tests)). `npm run test:watch` re-runs them as you edit |
| `npm run preview` | Runs the built app on the real Workers runtime (reads `.dev.vars`) |
| `npm run db:up` · `npm run db:down` | Start / stop the local Docker database |
| `npm run db:migrate` | Applies the migrations in `drizzle/` that your database hasn't run yet. Run it after every `git pull` that brings a new migration |
| `npm run db:seed` | Loads the sample data into an **empty** database. `npm run db:seed -- --force` replaces existing data |
| `npm run db:reset` | Drops everything, re-applies all migrations and re-seeds. On a Neon branch it asks for `-- --yes`. **Never on production** |
| `npm run db:generate` | **A only.** Turns a change in `src/db/schema.ts` into a new SQL file in `drizzle/` |

## Environment variables

All of them are listed with comments in [.env.example](.env.example). Local development reads
`.env.local`; `npm run preview` reads `.dev.vars`; production reads the secrets set in the
Cloudflare dashboard. Never commit `.env.local` or `.dev.vars`.

| Variable | Needed | Value |
| --- | --- | --- |
| `DATABASE_URL` | for the real app | Postgres connection string. Neon: the **pooled** string of your branch. Local Docker: `postgres://fixub:fixub@localhost:54329/fixub` |
| `DATABASE_WS_PROXY` | local Docker and CI only | `localhost:54330/v1`. Must be **empty** for Neon |
| `BETTER_AUTH_SECRET` | for sign-in | 32+ random characters: `openssl rand -base64 32`. Different in production |
| `BETTER_AUTH_URL` | for sign-in | The site's origin, no trailing slash: `http://localhost:3000` locally, the `workers.dev` URL in production |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | From a Google Cloud OAuth client (type "Web application"). Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`. Without them the login page says Google isn't set up |
| `DEMO_LOGIN` | optional | `true` shows the demo role picker on `/login`. Anything else turns it off, and the server refuses demo sign-ins |

## How the real app is built

```
Demo:      Screen → useStore().run(action) → pure function → localStorage
Real app:  Screen → server action → Zod → getActor() → same rules → Postgres (one transaction)
           Screen ← useApi() (SWR) ← GET /api/v1/... ← Postgres
```

Copy the reference example. Each file starts with a comment explaining the pattern:

| Piece | File |
| --- | --- |
| Read endpoint | [src/app/api/v1/categories/route.ts](src/app/api/v1/categories/route.ts) |
| Its SQL | [src/server/queries/categories.ts](src/server/queries/categories.ts) |
| Server action (write) | [src/server/actions/categories.ts](src/server/actions/categories.ts) |
| Converted screen | [src/components/pages/admin-categories.tsx](src/components/pages/admin-categories.tsx) |
| Response types shared by server and screens | [src/lib/api/types.ts](src/lib/api/types.ts) |

The building blocks (all owned by A):

- **`withDb(fn)`** (`src/server/db.ts`): opens the database for one request and closes it. Call it
  once per route handler or server action. Workers can't keep a connection between requests.
- **`getActor(db)`** (`src/server/actor.ts`): who is calling, or `null`. An `Actor` has the same
  shape as the demo's `User` (`id`, `name`, `role`, `organizationId`, `unitId`), so the rules in
  `src/lib/domain` (`checkTransition`, `canWorkOn`, …) take it unchanged.
- **Permission helpers**, which return the actor or throw:
  `requireActor(actor)` (signed in), `requireRole(actor, "admin")`,
  `requireOrgMember(actor, organizationId)` (admins pass; other organizations get *not found*, so
  they can't learn what another organization holds), and `{ manager: true }` for close / reopen.
- **`api(fn)`** (`src/server/api.ts`) wraps a `GET` handler: `{ data }` on success, `{ error: { code, message } }` otherwise.
- **`action(schema, input, fn)`** (`src/server/action.ts`) wraps a server action: Zod validation,
  database, and `{ ok: false, error }` with the same error codes the demo screens already handle.
- **`AppError`** (`src/server/errors.ts`): `throw new AppError("not_found")` anywhere on the server.
- **`rateLimit(db, actor, "report.create")`** (`src/server/rate-limit.ts`): call it in every server
  action that writes, right after the permission check. It counts the write for that user and
  throws `rate_limited` (429) over the limit: 10 reports an hour, 300 console changes an hour;
  the whole list is in that file. Screens show a "too many requests" text for `rate_limited`.
- **Photos** (`src/server/photos.ts`, `src/lib/api/photos.ts`): see "Photos" below.
- **`useApi<T>(path)`** (`src/lib/api/hooks.ts`): SWR. Call `mutate()` after a server action; pass
  `{ refreshInterval: LIVE_REFRESH_MS }` on dashboards that must stay live (15 s).
- **`useStore().server.configured`** tells a screen whether there is a database. A converted screen
  keeps its demo version for the "no database" case until week 4.

**Database rules.** Only A edits `src/db/schema.ts` and creates migrations. Need a column? Ask in
chat. Ids: reports, organizations and units are UUIDs; users are text; categories and subcategories
are exposed by their slug (`roads`, `pothole`), which is what the demo already used as ids. Seeded
rows have stable ids, so links survive `db:reset`.

**Sign-in.** Better Auth serves `/api/auth/*` and stores users and sessions in our Postgres.
`GET /api/v1/me` returns who is signed in and what the server supports; the client store
(`useStore().user`) uses it whenever a database is configured. Demo personas exist in the database
with the same ids as in the demo (`u-citizen`, `u-admin`, `u-road-staff`, …), so unconverted
screens keep working after a demo login.

## Photos

Photos are stored in Cloudflare R2 (the Worker binding `PHOTOS`), with one row per photo in
`report_images`. A photo is uploaded first and attached afterwards:

1. **Upload** (screen): `const photo = await uploadPhoto(blob)` from `src/lib/api/photos.ts`,
   with the Blob the camera gives you. It calls `POST /api/v1/photos`. The server accepts only a
   real JPEG (checked by its bytes, not its name) of at most 4 MB, from a signed-in user, 40 an hour.
2. **Attach** (server action): pass the ids as `photoIds` to `createReport`, which calls
   `attachReportPhotos(tx, actor, reportId, input.photoIds)` inside its transaction. A completion
   photo goes through `attachCompletionPhoto(tx, actor, { reportId, statusEventId }, photoId)` in
   `changeStatus`. Both refuse a photo someone else uploaded or one that is already used.
3. **Show**: `<img src={photoUrl(id)} />`, which is `GET /api/v1/photos/{id}`. Everyone can see
   the photos of a visible report. A photo that isn't attached yet, or belongs to a hidden report,
   is only served to its uploader and to admins; everyone else gets 404.

`npm run dev` uses a simulated bucket on your disk (`.wrangler/`), so uploads work locally with
no Cloudflare account. **Production has no bucket yet**: R2 must first be enabled on the
Cloudflare account (see the comment in `wrangler.jsonc`). Until then the deployed site answers
503 `not_configured` to photo requests.

## Tests

`npm test` runs the server-side tests in `tests/` with Vitest. CI runs them on every pull request.

- They use the database in your `.env.local` (your own Neon branch, or local Docker) and need
  `DEMO_LOGIN=true` and the seed, because they sign in as the demo personas through the real
  demo-login endpoint. Without `DATABASE_URL` only the tests that need no database run.
- Photos go to an in-memory stand-in for the R2 bucket, so no Cloudflare account is needed.
- They clean up after themselves (sessions, rate-limit counters, photos). Allowed calls really run, so
  the inputs in the matrix must be safe to repeat.
- **Every server action and every `/api/v1/...` endpoint needs a line in
  [tests/permission-matrix.ts](tests/permission-matrix.ts)**: who may call it, and a valid input.
  The tests then call it as a visitor, a citizen, staff, a manager and an admin, and fail if a
  wrong role gets through, or if an action or endpoint has no line. Add the line in the same
  pull request as the action. Use `refusals` for cases that depend on the data, such as staff
  opening another organization's report (`not_found`).

## Troubleshooting

- **The page keeps reloading in development.** A Next.js 16.4 / Turbopack problem: if an `/api`
  route is the first thing compiled after the dev server starts, every page reloads forever.
  `npm run dev` prevents it by loading a page first. If you still see it (for example after
  starting `next dev` directly), stop the server and run `npm run dev` again.
- **`DATABASE_URL is not set`** from a `db:` script: copy `.env.example` to `.env.local`.
- **`db:migrate` or the app can't connect to the local database:** is Docker running?
  `npm run db:up`, then `docker compose ps` should show `db` (healthy) and `ws-proxy`.
- **Can't connect to Neon:** `DATABASE_WS_PROXY` must be empty, and use the *pooled* connection string.
- **Demo login says the users are missing:** run `npm run db:seed`.

### End-to-end tests

`npm run e2e` drives a real browser (Playwright, Chromium) through the app in `e2e/`. The first
time, install the browser: `npx playwright install chromium`.

- It starts `npm run dev` on port 3000 itself, or uses the one you already have running. Same
  needs as `npm test`: your database, `DEMO_LOGIN=true`, the seed.
- `e2e/smoke.spec.ts` covers what runs on the database today (sign-in, categories, photo upload).
- `e2e/full-loop.spec.ts` is the full loop (report → priority → assign → resolve → confirm), one
  step per test. A step is marked `test.fixme` until its screens are converted: when you convert
  one, write its step and remove the `fixme`.
- CI runs it as the "End-to-end" job; a failed run keeps a trace you can open with
  `npx playwright show-trace`.

## Deploy to Cloudflare Workers

Pushing to `main` deploys through Cloudflare Workers Builds, using the `npm run build` and
`npx wrangler deploy` commands. `npm run build` runs the OpenNext adapter, which calls
`npm run build:next` (plain `next build`) and writes the Worker to `.open-next/`.

- `wrangler.jsonc` sets the Worker name. Its `WORKER_SELF_REFERENCE` service must match that name.
- Production values for the variables above are set as **secrets** in the Cloudflare dashboard
  (Worker → Settings → Variables and Secrets), or with `npx wrangler secret put <NAME>`. Only A does this.
- Try it locally on the real Workers runtime: copy your `.env.local` values to `.dev.vars` with
  `BETTER_AUTH_URL=http://localhost:8787`, then `npm run build && npm run preview`.
- **Don't run `npm run deploy` from your laptop.** The build copies the values of your `.env.local`
  into the Worker, so a local deploy would ship your development database URL and secret. Deploy by
  merging to `main`: Cloudflare's build has no `.env.local`.
- Keep `cacheComponents` and `partialPrefetching` off in `next.config.ts`: with them on, every
  page returns 500 on Workers.
- The Worker is about 2.4 MB compressed; the free plan allows 3 MB. Check
  `npx wrangler deploy --dry-run` before adding a large library.

Requires Node 22+ and a network connection for the map tiles (OpenFreeMap / OpenStreetMap).
`npm install` copies MapLibre's web worker into `public/vendor/` (see
`scripts/copy-maplibre-worker.mjs`); `dev` and `build` do it again.

Reporting starts with the camera, and browsers only allow the camera (and "Use my location") on
HTTPS or `localhost`. To demo on a phone, serve over HTTPS:

```bash
npm run dev -- --experimental-https -H 0.0.0.0   # then open https://<your-ip>:3000 and accept the certificate warning
```

With a database, also set `BETTER_AUTH_URL` to that `https://<your-ip>:3000` address for the session,
or sign-in is refused (the origin must match).

On plain `http://<your-ip>` the in-page camera is blocked; phones then get an explicit
"Open phone camera" button that opens the camera app directly (never the photo gallery).

## A 5-minute demo script

This walks through the screens that still run on demo data in the browser. Open two browser tabs
side by side. Changes in one tab appear in the other immediately.

1. **Tab 1 — citizen.** Go to `/login` → **Бат (Citizen)**. Press **Асуудал мэдээлэх / Report a
   problem**. The camera opens straight away: take a photo (retake if needed), choose a category
   and then a subcategory, confirm the location on the map (search "Gandan" or move the map), add a
   description and submit. The report starts as **Pending review**; there is no priority choice
   for citizens. Note the reference (e.g. `FX-26-04133`).
   - Choose *Roads → Pothole* near Peace Avenue / School No. 3 to see the duplicate check.
2. **Tab 2 — admin.** `/login` → **Х. Бадрах (FixUB admin)**. The report is in the review queue on
   `/admin`. Open it, set the **priority** (Low / Medium / High / Critical, with an optional internal
   note), then choose an organization and repair unit and **Assign**.
3. **Tab 2 — staff.** Switch role to the matching staff persona (e.g. **Э. Ганбаатар**, Street
   Lighting). The report is in `/staff`, most urgent first, showing the admin's priority (staff
   can't change it). Move it to *Investigating* → *In progress* → *Resolved* with a public note and
   a completion photo taken with the camera.
4. **Tab 1 — citizen.** The report page and `/my-reports` show the new status, the priority, the
   timeline with public notes, and "Is it actually fixed?". Answer it.
5. Also worth showing: clicking a map marker (its info panel opens directly), `/admin/reports`
   filters (status, priority, category, subcategory, district) and sorting, `/admin/categories`
   (rename, reorder, add categories and subcategories), `/statistics`, `/admin/moderation`, the
   МН/EN toggle, dark mode, and a 360–390 px phone width.

**Reset demo data** (on `/login` or in the admin sidebar) restores the 32 seeded reports.

## Categories and priority

- Eight main categories, each with its own subcategories (Roads and streets, Sidewalks and
  pedestrian areas, Street lighting and electricity, Waste and cleanliness, Water and drainage,
  Public infrastructure, Green spaces, Other). Both are required and stored on every report. The
  tree lives in demo state and is editable at `/admin/categories`; categories or subcategories that
  reports use can be renamed and reordered but not removed. Defaults are in `src/lib/meta.ts`.
- Priority (`low` · `medium` · `high` · `critical`) is set only by admins. New reports have
  `priority: null`, shown everywhere as **Pending review**. The admin's decision (who, when, and an
  internal note that is never shown publicly) is stored on the report.

## Camera-only photos

Reporting opens the camera first (`getUserMedia`, rear camera preferred) and offers no gallery,
file picker or drag-and-drop. If the camera is blocked or missing, the page explains how to allow
it and offers **Try again**. This discourages misleading reports but can't prove a photo is genuine;
the production system will need further verification.

## Roles

| Persona | Role | Can |
| --- | --- | --- |
| Бат, Д. Номин | Citizen | Report, track, "me too", fixed/still-broken verdicts, flag |
| Х. Бадрах | FixUB admin | Set priority, assign, any status change, moderation, organizations, categories |
| Г. Бат-Эрдэнэ / С. Оюунчимэг | Road Maintenance staff / manager | Work their organization's reports; managers can also close and reopen |
| Э. Ганбаатар, Ц. Мөнхзул, П. Ариунбат | Staff of Lighting / Sanitation / Drainage | Work their organization's reports |

Allowed status moves are in `src/lib/domain/lifecycle.ts`. Staff opening another organization's report get "doesn't exist".

## Code map

```
src/app/                     routes: (public) site, /admin console, /staff console
src/app/api/auth/            Better Auth endpoints (sign-in, callback, sign-out)
src/app/api/v1/              read endpoints (GET), one folder per resource; photos/ also takes uploads
src/server/                  server-only code: db, auth, actor + permissions, errors, api/action wrappers
src/server/actions/          server actions (writes), one per demo action
src/server/queries/          SQL for the read endpoints
src/db/                      Drizzle schema, database client, seed
drizzle/                     SQL migrations (generated; only A adds them)
scripts/db/                  db:migrate, db:seed, db:reset
src/lib/api/                 useApi() hook, uploadPhoto() and the API's response types
src/components/ui/           design-system primitives (Button, form controls, Dialog, Sheet, Toasts…)
src/components/fixub/        FixUB components (StatusBadge, ReportCard, StatusTimeline, ReportMap, KpiCard…)
src/components/pages/        one client component per screen
src/lib/domain/              pure rules: lifecycle, actions, metrics, geo — no React, no storage
src/lib/data/                seed data, localStorage repository, IndexedDB photo store
src/lib/store.tsx            React provider: state, demo session, cross-tab sync
src/lib/i18n.tsx             Mongolian-first МН/EN toggle
```

Every demo mutation is a pure function in `src/lib/domain/actions.ts` taking
`(state, user, input, now)`. Each one becomes a server action in `src/server/actions/` that keeps
the same rules and error codes, so converting a screen means swapping its data source, not
rewriting it (see "How the real app is built").

Visual tokens, components and copy follow the FixUB Design System v1.0 (Golos Text, Tengri navy,
five status colours with icon + word, Lucide icons).

## Known limits

- Screens that aren't converted yet keep their data per browser: another device or a private window
  starts from the seed. Only `/admin/categories` is shared through the database so far, so a
  category edited there doesn't reach the (still demo) report form yet.
- Google sign-in needs a Google OAuth client to be configured; there is no consent screen yet.
- Place search uses a small built-in list of Ulaanbaatar landmarks (no geocoding API).
- District is guessed from the nearest district centre, not real boundaries.
- Mongolian copy is a first draft and should be reviewed by a native editor.
