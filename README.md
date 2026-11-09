# FixUB — interactive prototype

A working demo of FixUB, a civic infrastructure reporting and tracking platform for Ulaanbaatar.
Citizens photograph a problem with their camera, choose a category and subcategory, confirm the
location and describe it. The FixUB team reviews each report, sets its priority and assigns it to an
organization and repair unit; staff move it through the lifecycle; citizens see the result and
confirm whether it's actually fixed.

This is a **functional prototype, not the production system**. There is no backend: all data
(reports, photos, sign-in) lives in the browser. Organizations are fictional ("demo") and are not
connected to any government body.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploy to Cloudflare Workers

Pushing to `main` deploys through Cloudflare Workers Builds, using the `npm run build` and
`npx wrangler deploy` commands. `npm run build` runs the OpenNext adapter, which calls
`npm run build:next` (plain `next build`) and writes the Worker to `.open-next/`.

- `wrangler.jsonc` sets the Worker name. Its `WORKER_SELF_REFERENCE` service must match that name.
- Try it locally on the real Workers runtime: `npm run build && npm run preview`.
- Keep `cacheComponents` and `partialPrefetching` off in `next.config.ts`: with them on, every
  page returns 500 on Workers.

Requires Node 20+ and a network connection for the map tiles (OpenFreeMap / OpenStreetMap).
`npm install` copies MapLibre's web worker into `public/vendor/` (see
`scripts/copy-maplibre-worker.mjs`); `dev` and `build` do it again.

Reporting starts with the camera, and browsers only allow the camera (and "Use my location") on
HTTPS or `localhost`. To demo on a phone, serve over HTTPS:

```bash
npm run dev -- --experimental-https -H 0.0.0.0   # then open https://<your-ip>:3000 and accept the certificate warning
```

On plain `http://<your-ip>` the in-page camera is blocked; phones then get an explicit
"Open phone camera" button that opens the camera app directly (never the photo gallery).

## A 5-minute demo script

Open two browser tabs side by side. Changes in one tab appear in the other immediately.

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
src/components/ui/           design-system primitives (Button, form controls, Dialog, Sheet, Toasts…)
src/components/fixub/        FixUB components (StatusBadge, ReportCard, StatusTimeline, ReportMap, KpiCard…)
src/components/pages/        one client component per screen
src/lib/domain/              pure rules: lifecycle, actions, metrics, geo — no React, no storage
src/lib/data/                seed data, localStorage repository, IndexedDB photo store
src/lib/store.tsx            React provider: state, demo session, cross-tab sync
src/lib/i18n.tsx             Mongolian-first МН/EN toggle
```

Every mutation is a pure function in `src/lib/domain/actions.ts` taking `(state, user, input, now)`.
The UI reads and writes only through `FixubRepository` (`src/lib/data/repository.ts`), so swapping
localStorage for the real `/api/v1` endpoints means replacing the repository and moving these
functions behind the API, not rewriting screens.

Visual tokens, components and copy follow the FixUB Design System v1.0 (Golos Text, Tengri navy,
five status colours with icon + word, Lucide icons).

## Known limits of the prototype

- Data is per browser. Another device or a private window starts from the seed.
- Sign-in is a role picker, not Google OAuth; there is no consent screen.
- Place search uses a small built-in list of Ulaanbaatar landmarks (no geocoding API).
- District is guessed from the nearest district centre, not real boundaries.
- Mongolian copy is a first draft and should be reviewed by a native editor.
