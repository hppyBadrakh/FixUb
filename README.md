# FixUB

FixUB is a civic infrastructure reporting and tracking platform for Ulaanbaatar. Citizens photograph
a problem with their camera, choose a category and subcategory, confirm the location and describe
it. The FixUB team reviews each report, sets its priority and assigns it to an organization and
repair unit; staff move it through the lifecycle; citizens see the result and confirm whether it's
actually fixed.

**Where the project is.** Every screen reads and writes one shared Postgres database through the
server; nothing is kept in the browser except the language and theme. It runs on Neon Postgres +
PostGIS, Drizzle, Better Auth (Google sign-in) and Cloudflare Workers.

A deployment is one of two kinds, decided by one setting on the server:

- **Demonstration** (`DEMO_LOGIN=true`, as on a developer's machine and in CI): the database holds
  32 sample reports and fictional organizations, the login page offers one-click sample users, and
  screens carry a "Sample data" note.
- **Real** (`DEMO_LOGIN` unset): people sign in with Google only, there are no sample users and
  no "sample data" notes. See [Going live](#going-live).

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

Open http://localhost:3000/login and pick a sample user (needs `DEMO_LOGIN=true`, which
`.env.example` sets). Without a `DATABASE_URL` the app only shows a "server not configured" page.

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
| `npm run db:go-live` | Shows what removing the sample data would delete; with `-- --yes` it does it. Once, on production (see [Going live](#going-live)) |
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
| `DEMO_LOGIN` | development only | `true` makes this a demonstration deployment: sample users on `/login` and "Sample data" notes. Anything else turns both off, and the server refuses sample sign-ins. **Never `true` on the real site** |
| `REVIEW_BEFORE_PUBLIC` | optional | `true`: a new report is only public once an admin has reviewed it (set its priority). Until then only its reporter, admins and assigned staff see it. Default: public at once |
| `NEXT_PUBLIC_MAP_STYLE_URL` | optional, **build time** | A MapLibre style URL for the map. Default: OpenFreeMap's free public server (no service guarantee). Set it in the Cloudflare build's variables, not as a runtime secret |
| `ADMIN_EMAILS` | on the real site | Comma-separated Google emails that are always admins. This is how the first admin gets in; everyone else is given access on `/admin/users` |

## How the real app is built

```
Screen → useStore().act.x() → server action → Zod → getActor() → rules → Postgres (one transaction)
Screen ← useStore().state ← GET /api/v1/... (SWR, every 15 s) ← Postgres
```

**Every screen reads `useStore().state` and writes through `useStore().act`**
([src/lib/store.tsx](src/lib/store.tsx)):

- **Reading.** `state` is put together from `/api/v1`: the public reports, plus
  what the signed-in user may see on top (their own reports, their organization's queue, or
  everything for an admin), re-read every 15 seconds. The server cuts each report down to what
  the caller may see (`src/server/queries/reports.ts`): other people are never identified, the
  internal priority note is only for admins and assigned staff, flags only for admins.
- **Writing.** `await act.setPriority(report.id, "high", note)` returns `{ ok: true }` or
  `{ ok: false, error }`: it calls the server action and reads the lists again
  ([src/lib/store-actions.ts](src/lib/store-actions.ts)).

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /api/v1/reports` | everyone | Visible reports. `?bbox=w,s,e,n`, `?status=`, `?category=`; `?mine=1` for your own (needs sign-in) |
| `GET /api/v1/reports/{id}` | everyone | One report; a hidden one only for its reporter, admins and assigned staff |
| `GET /api/v1/admin/reports` | admin | Every report, with flags and internal notes. `?status=`, `?priority=` (incl. `pending`), `?category=`, `?organizationId=org-road\|none`, `?sort=priority\|oldest\|newest`, `?limit=` |
| `GET /api/v1/staff/reports` | staff, manager | Reports assigned to their organization; same filters |
| `GET /api/v1/organizations`, `/categories` | everyone | Organizations with units; the category tree |
| `GET /api/v1/admin/users` | admin | Who works for which organization |
| `GET /api/v1/admin/accounts` | admin | Everyone who has signed in, with their access (`?q=` searches name and email) |
| `GET /api/v1/admin/dashboard`, `/staff/dashboard` | admin; staff, manager | The overview's numbers counted in SQL (`?days=1\|7\|30`). Screens read them with `useDashboard()` |
| `GET /api/v1/admin/activity`, `/staff/activity` | admin; staff, manager | The activity feed from the database (`?limit=`); it becomes `useStore().state.activity` |
| `GET /api/v1/notifications` | signed in | The bell: the caller's newest 30 notifications and the unread count |
| `GET /api/v1/statistics` | everyone | The public statistics page counted in SQL (`?days=7\|30\|90`) |
| `POST /api/v1/photos`, `GET /api/v1/photos/{id}` | see "Photos" | Upload and show photos |

| Server actions | File |
| --- | --- |
| `createReport`, `toggleMeToo`, `setVerdict`, `flagReport` | `src/server/actions/reports-citizen.ts` |
| `setPriority`, `assignReport`, `changeStatus` | `src/server/actions/reports-admin.ts` |
| `moderateReport`, `undoModeration` | `src/server/actions/moderation.ts` |
| `saveOrganization`, `saveCategories` | `src/server/actions/organizations.ts`, `categories.ts` |
| `setUserAccess`, `setUserBanned`, `deleteUser` | `src/server/actions/users.ts` |
| `acceptTerms`, `markNotificationsRead` | `src/server/actions/account.ts` |

To add something new, copy the reference example. Each file starts with a comment explaining the pattern:

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
  shape as the screens' `User` (`id`, `name`, `role`, `organizationId`, `unitId`), so the rules in
  `src/lib/domain` (`checkTransition`, `canWorkOn`, …) take it unchanged.
- **Permission helpers**, which return the actor or throw:
  `requireActor(actor)` (signed in), `requireRole(actor, "admin")`,
  `requireOrgMember(actor, organizationId)` (admins pass; other organizations get *not found*, so
  they can't learn what another organization holds), and `{ manager: true }` for close / reopen.
- **`api(fn)`** (`src/server/api.ts`) wraps a `GET` handler: `{ data }` on success, `{ error: { code, message } }` otherwise.
- **`action(schema, input, fn)`** (`src/server/action.ts`) wraps a server action: Zod validation,
  database, and `{ ok: false, error }` with a code the screens have a text for.
- **`AppError`** (`src/server/errors.ts`): `throw new AppError("not_found")` anywhere on the server.
- **`rateLimit(db, actor, "report.create")`** (`src/server/rate-limit.ts`): call it in every server
  action that writes, right after the permission check. It counts the write for that user and
  throws `rate_limited` (429) over the limit: 10 reports an hour, 300 console changes an hour;
  the whole list is in that file. Screens show a "too many requests" text for `rate_limited`.
- **Photos** (`src/server/photos.ts`, `src/lib/api/photos.ts`): see "Photos" below.
- **`useApi<T>(path)`** (`src/lib/api/hooks.ts`): SWR. Call `mutate()` after a server action.
- **`useLiveApi<T>(path)`**: the same, re-read every 15 s while the tab is visible. Use it for
  everything other people change (map, lists, queues, a report's timeline), so a change on one
  device shows up on every other. `useFreshIds(data?.reports, "updatedAt")`
  gives the ids that just changed, for the `fx-fresh` highlight (instead of `useStore().freshIds`).
  Don't poll a form the user is editing.
- **`useStore().server.configured`** tells a screen whether there is a database, for the few
  places that differ (a banner text, where a photo is loaded from).

**Database rules.** Only A edits `src/db/schema.ts` and creates migrations. Need a column? Ask in
chat. Ids: reports, organizations and units are UUIDs; users are text; categories and subcategories
are exposed by their slug (`roads`, `pothole`), organizations and units too (`org-road`). Seeded
rows have stable ids, so links survive `db:reset`.

**Sign-in and access.** Better Auth serves `/api/auth/*` and stores users and sessions in our
Postgres; Google is the only way in. `GET /api/v1/me` returns who is signed in.

- Everyone who signs in is a **citizen**. Before their first report they accept a short notice
  about what becomes public (`users.consented_at`; change `CONSENT_VERSION` in `src/lib/meta.ts`
  to ask everyone again).
- An admin gives people their access on **`/admin/users`**: staff or manager of one organization
  (and unit), or admin. The person has to have signed in once so that they are in the list.
  Admins can also block an account, which signs it out everywhere, and delete one when its
  owner asks: the account and everything personal goes, the reports stay public and unlinked.
- An admin can't change or block their own account, so one admin can't lock everybody out.
- The first admin comes from `ADMIN_EMAILS` on the server.
- On a demonstration deployment the sample users (`u-citizen`, `u-admin`, `u-road-staff`, …) are
  also offered on `/login`.

## What happens around a report

Rules that go beyond the status lifecycle (`src/lib/domain/lifecycle.ts`):

- **Notifications (the bell).** Written in the same transaction as the change they report
  (`notify()` in `src/server/notifications.ts`), never naming a person:
  the reporter hears about the review, the assignment, every status change, and hiding or
  restoring; people who said "me too" are asked when it is resolved; the organization's staff
  hear about an assignment; its managers and the admins hear about a dispute. Nobody is told
  about what they did themselves. There is no email yet.
- **"Is it actually fixed?"** Only the reporter and people who said "me too" may answer. When
  "still broken" overtakes "fixed", the report is marked **disputed** (`reports.disputed_at`):
  the manager and admins are notified once, the consoles count it, and the next status change
  clears it. The official status stays the staff's decision.
- **Response targets.** `RESPONSE_TARGET_DAYS` in `src/lib/meta.ts` (critical 2, high 7, medium
  14, low 30 days after the priority is set). An open report past its target is **overdue** in
  the consoles. `dueAt` is only sent to admins and assigned staff: it is a target for them,
  not a promise to citizens.
- **Review before public** (`REVIEW_BEFORE_PUBLIC=true`): see "Environment variables". The rule
  is `wherePublic()` / `isPublic()` in `src/server/queries/reports.ts`, used by the public list,
  report pages, photos, statistics and the citizen actions.

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
no Cloudflare account, and never touch the real bucket. Production uses the R2 bucket
`fixub-photos` (the `PHOTOS` binding in `wrangler.jsonc`).

A Worker without that binding keeps photo bytes in Postgres instead (table `photo_blobs`); that
is how production ran before R2 was enabled. Photos stored there move to R2 the first time each
is read, so the table empties itself with use.

## Tests

`npm test` runs the server-side tests in `tests/` with Vitest. CI runs them on every pull request.

- They use the database in your `.env.local` (your own Neon branch, or local Docker) and need
  `DEMO_LOGIN=true` and the seed, because they sign in as the sample users through the real
  sample-login endpoint. Without `DATABASE_URL` only the tests that need no database run.
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
- **Sample login says the users are missing, or reporting says "accept the notice":** your
  database was seeded before a change to the seed. Run `npm run db:reset` (add `-- --yes` on Neon).

### End-to-end tests

`npm run e2e` drives a real browser (Playwright, Chromium) through the app in `e2e/`. The first
time, install the browser: `npx playwright install chromium`.

- It starts `npm run dev` on port 3000 itself, or uses the one you already have running. Same
  needs as `npm test`: your database, `DEMO_LOGIN=true`, the seed.
- `e2e/smoke.spec.ts` covers what runs on the database today (sign-in, categories, photo upload).
- `e2e/mobile.spec.ts` opens the citizen screens on a 360 px phone, in Mongolian and English,
  and fails if a page scrolls sideways or throws.
- `e2e/full-loop.spec.ts` is the full loop on three separate browsers: a citizen reports with a
  photo, an admin sets the priority and assigns it, staff resolve it with a completion photo, and
  the citizen sees that without reloading and confirms the fix. Chromium runs with a fake camera.
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
- The Worker is about 2.45 MB compressed; the free plan allows 3 MB. Check
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

## A 5-minute walk-through

On a demonstration deployment (sample users on `/login`). Use two browsers, or a normal and a
private window, so you can be two people at once. A change in one appears in the other within
15 seconds.

1. **Browser 1 — citizen.** `/login` → **Бат (Citizen)**. Press **Асуудал мэдээлэх / Report a
   problem**. The camera opens straight away: take a photo (retake if needed), choose a category
   and then a subcategory, confirm the location on the map (search "Gandan" or move the map), add a
   description and submit. The report starts as **Pending review**; there is no priority choice
   for citizens. Note the reference (e.g. `FX-26-04133`).
   - Choose *Roads → Pothole* near Peace Avenue / School No. 3 to see the duplicate check.
2. **Browser 2 — admin.** `/login` → **Х. Бадрах (FixUB admin)**. The report is in the review queue
   on `/admin`. Open it, set the **priority** (Low / Medium / High / Critical, with an optional
   internal note), then choose an organization and repair unit and **Assign**.
3. **Browser 2 — staff.** Sign in as the matching staff user (e.g. **Г. Бат-Эрдэнэ**, Road
   Maintenance). The report is in `/staff`, most urgent first, showing the admin's priority (staff
   can't change it). Move it to *In progress* → *Resolved* with a public note and a completion
   photo taken with the camera.
4. **Browser 1 — citizen.** The report page and `/my-reports` show the new status, the priority, the
   timeline with public notes, and "Is it actually fixed?". Answer it.
5. Also worth showing: clicking a map marker (its info panel opens directly), `/admin/reports`
   filters and sorting, `/admin/categories`, `/admin/users`, `/statistics`, `/admin/moderation`,
   the МН/EN toggle, dark mode, and a 360–390 px phone width.

To put the sample data back: `npm run db:reset` (your own database only, never production).

## Categories and priority

- Eight main categories, each with its own subcategories (Roads and streets, Sidewalks and
  pedestrian areas, Street lighting and electricity, Waste and cleanliness, Water and drainage,
  Public infrastructure, Green spaces, Other). Both are required and stored on every report. The
  tree is editable at `/admin/categories`; categories or subcategories that
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
src/server/actions/          server actions (writes)
src/server/queries/          SQL for the read endpoints
src/db/                      Drizzle schema, database client, seed
drizzle/                     SQL migrations (generated; only A adds them)
scripts/db/                  db:migrate, db:seed, db:reset, db:go-live
src/lib/api/                 useApi() hook, uploadPhoto() and the API's response types
src/components/ui/           design-system primitives (Button, form controls, Dialog, Sheet, Toasts…)
src/components/fixub/        FixUB components (StatusBadge, ReportCard, StatusTimeline, ReportMap, KpiCard…)
src/components/pages/        one client component per screen
src/lib/domain/              pure rules: lifecycle, rules, metrics, geo — no React, no storage
src/lib/data/                the sample data set that `npm run db:seed` loads
src/lib/store.tsx            React provider: state (from /api/v1), session
src/lib/store-actions.ts     useStore().act: one function per server action
src/lib/i18n.tsx             Mongolian-first МН/EN toggle
```

The rules that screens and server share are pure functions in `src/lib/domain/` (who may make
which status change, what a valid category tree is, which reports count as open). Server actions
call them inside a transaction; screens call them to show only what is allowed.

Visual tokens, components and copy follow the FixUB Design System v1.0 (Golos Text, Tengri navy,
five status colours with icon + word, Lucide icons).

## Going live

What turns a demonstration deployment into the real service. Do it in this order: each step
keeps a way to sign in.

**Production (ubfix.site) went live on 2026-11-23:** steps 1, 2, 5, 6 and 7 are done. The sample
data is kept on the Neon branch `backup-before-go-live-2026-11-23`. Steps 3, 4 and 8 wait for
real partner organizations, their staff, and the plan decisions.

1. **Google sign-in works on the site.** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set and
   the OAuth client's redirect URI is `<site>/api/auth/callback/google`.
2. **Name the first admins.** Set `ADMIN_EMAILS` (comma-separated Google emails) as a secret in
   the Cloudflare dashboard and redeploy. Sign in with Google and check that `/admin/users` opens.
3. **Set up the real organizations** on `/admin/organizations` and adjust `/admin/categories`.
4. **Give staff their access.** Each person signs in with Google once; then an admin sets their
   organization, unit and role on `/admin/users`.
5. **Remove the sample data.** Take a backup (a Neon branch is enough), then, with `DATABASE_URL`
   pointing at production:
   ```bash
   npm run db:go-live           # shows what would be deleted
   npm run db:go-live -- --yes  # deletes all reports, the sample users and sample organizations
   ```
   It keeps the category tree, real accounts and real organizations, and refuses to run while
   there is no real account. It can't be undone.
6. **Turn the sample login off.** Remove `DEMO_LOGIN` (or set it to anything but `true`) in the
   Cloudflare dashboard and redeploy. The sample users and the "Sample data" notes disappear and
   `/api/auth/demo/sign-in` no longer exists.
7. **Photos.** Done: production stores photos in the R2 bucket `fixub-photos`. The sample
   data's photos are not removed from the bucket by `db:go-live`; empty it separately if needed.
8. **Plans and monitoring.** See [Operations](#operations): the Workers paid plan, the Neon
   plan, and who gets the Monitor workflow's emails.

Not software, and still needed before real use:

- **Organizations that have agreed to act on reports.** What to ask of them and what to settle
  in writing: [docs/partner-onboarding.md](docs/partner-onboarding.md).
- **People to triage and moderate every day.** The routine, the requests that come up and what
  to do when the site is down: [docs/operations-runbook.md](docs/operations-runbook.md).
- **A first use small enough to learn from.** [docs/pilot-plan.md](docs/pilot-plan.md).
- **Reviewed legal texts.** `/privacy` and `/terms` are drafts written from what the software
  does. Name the operator and a contact address in `src/lib/operator.ts`, have a lawyer check
  the texts in `src/components/pages/legal.tsx` against Mongolian law, then set `reviewed: true`
  there: until then both pages carry a "Draft" banner. If the notice before a first report
  changes in meaning, raise `CONSENT_VERSION` so everyone is asked again.

## Operations

What keeps the site running, what it costs, and what to do before real traffic.

### Watching it

- **`GET /api/health`** answers `{ ok: true }` when the Worker runs and reaches the database, 503 otherwise.
- **Round-the-clock monitoring is not set up.** Point an uptime service (UptimeRobot, Better
  Stack and similar have free plans) at `https://<site>/api/health`, expecting `"ok":true`, and
  have it email or message you. It needs an account, so it is yours to create.
- **The Monitor workflow** (`.github/workflows/monitor.yml`) does the same checks from GitHub,
  but only when run by hand: Cloudflare blocks GitHub's servers from reaching ubfix.site, so on
  a schedule it would fail every time. It is useful against an address Cloudflare doesn't
  guard, or after that block is lifted.
- **Errors and logs**: Cloudflare dashboard → Workers → fixub → Observability. Server errors are
  logged with a `[server]` prefix. There is no error-tracking service or paging yet.

### Backups

The repository is public, so a database dump must never be stored as a workflow artifact.
Backups are Neon's:

- **Point-in-time restore**: Neon keeps the history of the production branch (6 hours on the
  Free plan, up to 7 days on Launch, more on Scale). Restore from the Neon console → Branches.
- **Before anything risky** (`db:go-live`, a migration that drops something): create a branch
  of production in the Neon console first. It is a full copy and takes seconds.
- Photos stored in R2 are not covered by either: turn on object versioning for the bucket if
  they matter.

### Limits of the free plans, and what real use needs

| Limit | Free | Why it matters here |
| --- | --- | --- |
| Cloudflare Workers requests | 100,000 a day | An open console tab re-reads its lists every 15 s (about 6 requests): roughly 35,000 requests in a working day **per person**. A visitor's tab re-reads once a minute. Three staff with the console open all day use the whole allowance. The paid plan ($5 a month) includes 10 million requests a month |
| Worker size | 3 MB compressed | The Worker is about 2.45 MB (check with `npx wrangler deploy --dry-run` after a build). The paid plan allows 10 MB |
| Worker CPU time | 10 ms per request | Large lists (the admin's, with every report) are the first to hit it. The paid plan allows 30 s |
| Neon compute and storage | 0.5 GB, compute sleeps when idle | The first request after a sleep is slow |
| R2 | 10 GB, then paid | Photos live here (`fixub-photos`) |

So before real use: **the Workers paid plan is needed; Neon's Launch plan is strongly advised** (7-day restore, no sleeping).

Measures already in the code: tabs in the background don't poll; only the consoles poll every
15 s; the public list holds open reports plus the last 90 days and is capped at 1,000; writes
are rate limited per user.

### A staging site

Today every merge to `main` goes straight to the live site, after CI (lint, build, the server
tests and the browser tests). To get a place to try things first:

1. Neon console: create a branch `staging` from production.
2. Cloudflare dashboard: create a second Worker (`fixub-staging`) with Workers Builds connected
   to a `staging` Git branch, the same build and deploy commands, and its own variables:
   `DATABASE_URL` (the staging branch), `BETTER_AUTH_SECRET` (a new one), `BETTER_AUTH_URL`
   (its `workers.dev` address), `DEMO_LOGIN=true`. In `wrangler.jsonc` the Worker name and the
   `WORKER_SELF_REFERENCE` service must then come from the environment being deployed.
3. Merge to `staging` first, look, then merge to `main`.

This is not set up: it needs the two dashboards.

### Security

- Every answer carries `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` (camera and location for our own pages only) and HSTS (`next.config.ts`).
  There is no Content-Security-Policy yet.
- Permissions are checked on the server for every action and endpoint, and the permission
  matrix test fails when one is added without a rule.
- Not done: a load test and an outside security review.

## Known limits

- The store loads the reports the user may see and filters in the browser. The public list is
  bounded (open reports plus 90 days, at most 1,000); the admin's list is not bounded by age.
  The `?bbox=` viewport filter exists on the API but the map doesn't use it yet.
- The dashboards and the statistics page count in SQL, but fall back to counting the loaded
  reports in the browser until the first answer arrives (same definitions, tested against each other).
- Google sign-in needs a Google OAuth client to be configured; there is no consent screen yet.
- Place search uses a small built-in list of Ulaanbaatar landmarks (no geocoding API).
- District is guessed from the nearest district centre, not real boundaries.
- Mongolian copy is a first draft and should be reviewed by a native editor.
