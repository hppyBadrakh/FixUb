# FixUB — 4-week build plan for 3 developers

**Goal:** turn the working demo into a fully functional app in 4 weeks. Real database, real sign-in, photos stored on a server, and every user and device seeing the same data, deployed on Cloudflare.

**Out of scope** (this is a university project): government partners, user research, a real pilot, legal review, load testing at city scale.

**Where we start:** the demo in this repo already has every screen, the full workflow and the design system. All its data lives in each user's browser (`localStorage`). The work is putting a real server and database behind those screens. We don't redesign anything.

The task-by-task checklist is in **`FixUB_Team_Checklist.xlsx`**: one sheet per person, plus a Summary and a Shared sheet.

| Person | Name | Owns |
| --- | --- | --- |
| **A — Lead / Platform** | _you_ | Database, schema and migrations, sign-in, data-access pattern, permissions, deployment, CI, merging |
| **B — Citizen side** | _name_ | Everything a resident touches: report flow, photos, public map, report pages, My reports, me-too and verdicts, flags, public statistics |
| **C — Operations side** | _name_ | Everything an admin or staff member touches: review queue, priority, assignment, status workflow, staff queue, categories, organizations, moderation, admin dashboard |

---

## 1. Technical decisions (fixed, so nobody has to debate them)

| Topic | Decision | Why |
| --- | --- | --- |
| Hosting | **Cloudflare Workers** via OpenNext (already deployed) | Already working and free |
| Database | **Neon Postgres + PostGIS**, Singapore region | Free tier, real spatial queries |
| DB access | **Drizzle ORM** with the `@neondatabase/serverless` driver (WebSocket `Pool`, created per request) | Runs on Workers and supports transactions, which status changes need |
| Migrations | `drizzle-kit generate` → SQL files committed in `drizzle/`. **Only A writes migrations** | Avoids two people creating conflicting migrations |
| Sign-in | **Better Auth** with Google, users stored in our Postgres. Plus a **demo login** (the current role picker), enabled only when `DEMO_LOGIN=true` | Real sign-in for users, one-click role switching for the presentation |
| Photos | **Cloudflare R2** bucket (Worker binding). The browser re-encodes photos to JPEG (already in the demo, which strips location data); the server checks file type by magic bytes and size ≤ 4 MB | `sharp` (native) can't run on Workers; the canvas re-encode already removes EXIF |
| Reads | `GET` route handlers under `/api/v1/…`, fetched in client components with **SWR** (`refreshInterval: 15000` on dashboards) | Keeps the demo's client screens; 15 s polling matches the design system's live-update policy |
| Writes | **Server Actions**, one per demo action (`createReport`, `changeStatus`, `setPriority`, …) | The demo's `src/lib/domain/actions.ts` already has the rules: port them, don't rewrite |
| Validation | **Zod** schema for every input | One place for rules and types |
| Next.js config | Keep `cacheComponents` **off** | It makes every page return 500 on Workers |

### How the demo turns into the real app

```
Demo today:   Screen → useStore().run(action) → pure function → localStorage
Real app:     Screen → server action → getActor() + Zod → same rules → Postgres (transaction)
              Screen ← SWR fetch ← GET /api/v1/... ← Postgres
```

- Every function in `src/lib/domain/actions.ts` becomes a server action in `src/server/actions/*`. The business rules (`lifecycle.ts`, validation, "can't me-too your own report"…) are copied over unchanged.
- Each screen's owner swaps `useStore()` for SWR hooks and server actions. Screens are converted one by one; until a screen is converted, it keeps working on demo data.

---

## 2. Who owns which folders (the main way we avoid merge conflicts)

**Rule:** only edit files you own. If you need a change in someone else's file, ask them in the team chat, or make a small PR and tag them.

| Path | Owner |
| --- | --- |
| `src/db/*` (schema, client, seed), `drizzle/*` (migrations), `drizzle.config.ts` | A |
| `src/server/auth.ts`, `src/server/actor.ts`, `src/server/db.ts`, `src/server/errors.ts` | A |
| `src/app/api/auth/*`, `src/app/(public)/login/*`, `next.config.ts`, `wrangler.jsonc`, `package.json` | A |
| `src/server/actions/reports-citizen.ts`, `src/server/actions/photos.ts`, `src/app/api/v1/reports/*` | B |
| `src/components/pages/{home,report-flow,report-detail,my-reports,statistics}.tsx`, `src/components/fixub/{camera,report-map}.tsx` | B |
| `src/server/actions/{reports-admin,organizations,categories,moderation}.ts`, `src/app/api/v1/admin/*`, `src/app/api/v1/staff/*` | C |
| `src/components/pages/{admin-*,console-report,staff-queue}.tsx` | C |
| `src/components/ui/*`, `src/lib/domain/*`, `src/lib/meta.ts` (shared) | Anyone, but **announce in chat first** and keep the PR small |

`package.json`: if you need a new library, ask A, who adds it. This keeps `package-lock.json` from conflicting.

---

## 3. Week by week

**Day 1 is the most important day:** A pushes the schema early, so B and C can write real queries from day 2.

| Week | A — Lead / Platform | B — Citizen | C — Operations | End-of-week check (all three demo it Friday) |
| --- | --- | --- | --- | --- |
| **1 — Foundation** | Day 1: Neon + PostGIS, Drizzle, **full schema merged by evening**. Day 2: seed (same 32 reports as the demo), a Neon branch for each developer. Day 3–4: Better Auth (Google + demo login), `getActor()`, permission helpers. Day 5: **reference example**: one read API + one server action + one screen converted, which B and C copy | Day 1–2: read the demo's citizen code and `actions.ts`; write Zod schemas for create-report, me-too, verdict, flag. Day 3–5: `GET /api/v1/reports` (viewport query with PostGIS), `GET /api/v1/reports/[id]` | Day 1–2: read the demo's console code and `lifecycle.ts`; write Zod schemas for status change, priority, assignment. Day 3–5: `GET` review queue, staff queue, organizations, categories | Everyone signs in with Google on the deployed site; the map shows the 32 seeded reports from the database |
| **2 — Core loop** | Rate limiting on writes. Server-side permission tests (citizen vs staff vs admin, own vs other organization). Help B and C convert their first screens | `createReport` server action (with idempotency key). Home map + list, report detail, My reports read from the API | `setPriority` and `assign` server actions. Admin review queue and report workspace read from the API | Citizen submits a report on a phone → admin sees it on a laptop and sets priority + assigns |
| **3 — Full features** | Photo upload route + R2 binding with B. Replace the demo's cross-tab sync with SWR polling everywhere. Playwright E2E for the full loop | Photo upload to R2 and display; duplicate check (PostGIS `ST_DWithin` 50 m); me-too; fixed/still-broken; flag button | `changeStatus` with optimistic lock (409 on conflict); completion photo; staff queue; categories editor; organizations page; moderation (hide/restore, 3-flag auto-hide) | Full loop works end to end with photos: citizen → admin → staff → citizen confirms |
| **4 — Finish and polish** | Remove leftover `localStorage` code. Production database + seed. Final deploy. README: setup + demo accounts. Code freeze **Thursday** | Public statistics from SQL. Bug fixes. Mongolian/English text check on citizen screens. Mobile check (360 px) | Admin dashboard KPIs and charts from SQL. Activity feed from the database. Bug fixes | Thursday: freeze. Friday: rehearse the presentation on the production URL |

---

## 4. How the three of us work together

### Every day

1. **Morning — get the latest code** (before writing anything):
   ```bash
   git checkout main
   git pull
   git checkout -b b/report-detail-api     # new branch: your letter / short description
   ```
   If you're continuing yesterday's branch instead:
   ```bash
   git checkout b/report-detail-api
   git pull --rebase origin main            # bring in what others merged
   ```
2. **Check-in message** in the team chat by 10:00, three lines:
   ```
   Yesterday: converted report detail to the API
   Today: My reports page
   Blocked: need `report_images` URLs in the detail API (A?)
   ```
3. **Push at least once a day**, even if unfinished (open a *draft* pull request). Then others can see your progress, and nothing lives only on your laptop.
4. **Small pull requests.** Aim for under ~300 changed lines and merge at least every 2 days. Big, long-lived branches are what cause painful merge conflicts.

### Pull requests

- Every change goes through a pull request into `main`. Nobody pushes directly to `main`; A turns on branch protection on GitHub.
- **One other person reviews.** Rotate: A reviews B, B reviews C, C reviews A. A also reviews anything touching the database, sign-in or permissions.
- **Review within the same day.** A pull request waiting overnight blocks someone.
- Before asking for review, run `npm run lint`, `npm run typecheck` and `npm run build` locally. CI runs them too, and a red CI can't be merged.
- Merge with **"Squash and merge"**, then delete the branch.

### Database changes (the easiest place to break each other's work)

- **Only A creates migrations.** If B or C needs a new column or table, post in chat: "need `reports.x`, type, why". A adds it the same day.
- **Each developer has their own Neon branch** (`dev-a`, `dev-b`, `dev-c`), which is a full copy of the database. Your test data never interferes with anyone else's. A creates them on day 2 and sends each person their own connection string privately.
- After pulling a new migration: `npm run db:migrate` (applies it to your branch). If your data gets messy: `npm run db:reset` (re-applies everything and re-seeds).

### Secrets

- Never commit `.env.local` or `.dev.vars`; they're already in `.gitignore`. Everyone copies `.env.example` and fills in their own values.
- Share secrets (Google client secret, database URLs) in a private message or a password manager, never in a commit or a public channel.
- Production secrets are set only by A, in the Cloudflare dashboard.

### When something goes wrong

| Problem | What to do |
| --- | --- |
| Merge conflict | `git pull --rebase origin main`, fix the files Git marks, `git add .`, `git rebase --continue`. If it's in someone else's file, call them. **Don't guess** |
| Blocked by someone else's unfinished work | Say so in the check-in. Meanwhile, use the demo's data or a temporary fake for that piece and keep going |
| CI fails on `main` | Whoever merged last fixes it **first**, before any new work |
| Stuck for more than 1 hour | Ask in chat. A 10-minute call beats a lost afternoon |

### Every Friday (30 minutes, all three)

1. Each person demos their week **on the deployed site**, not on localhost.
2. Update the spreadsheet: statuses and "Current week".
3. Agree on next week's top 3 priorities per person.

---

## 5. Definition of done (for every task)

- Works on the deployed site, not just locally.
- Permission checked on the server: try it as the wrong role and it must be refused.
- Loading, empty and error states shown; Mongolian and English text present.
- Lint, typecheck and build pass; reviewed and merged.
- Status set to **Done** in the spreadsheet.

---

## 6. Final demo checklist (week 4)

- [ ] Production URL works on a phone and a laptop.
- [ ] Demo accounts listed in the README (citizen, admin, staff).
- [ ] Database seeded with the 32 sample reports.
- [ ] Full loop rehearsed: photo report → admin priority + assignment → staff resolves with photo → citizen confirms.
- [ ] Two devices show the same data (proves it's no longer browser-only).
- [ ] Backup plan if the venue's Wi-Fi fails: a screen recording of the full loop.
