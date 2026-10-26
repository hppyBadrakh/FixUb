# FixUb — Project Guide

A community app where Ulaanbaatar (UB) citizens report street problems (broken traffic lights, damaged pavement, potholes, exposed wires…) with a photo and location, send them to the responsible authority, and track the status until it is fixed.

> **Assumptions to confirm:** "UB" = Ulaanbaatar, Mongolia; the audience is mostly mobile users; the app must work in Mongolian (primary) and English. Anything marked **[Verify]** depends on facts only you or the city can confirm (contacts, legal terms, data-sharing agreements).

---

## 1. Vision and principles

**Problem.** Citizens see hazards daily but have no simple, trackable way to report them. Reports get lost, nobody knows who is responsible, and there is no feedback when something is fixed.

**Goal.** Reporting takes under 60 seconds; every report has an owner, a status, and a public history.

**Principles**
1. **Mobile first.** Most reports happen on a phone, on the street, on a weak connection.
2. **Photo + pin = report.** Everything else is optional.
3. **Transparency.** Every report's status and timeline are public (reporter identity is not).
4. **Safety first.** Hazards like exposed wires or broken lights get urgency handling and a "call emergency services" prompt, not just a ticket.
5. **Government-ready.** Output must fit how the city already works (district, category, responsible unit), or nobody will act on it.
6. **Start small.** Ship a useful MVP, then grow.

---

## 2. Users and roles

| Role | Who | Can do |
|---|---|---|
| Visitor | Anyone | Browse map/list, view reports |
| Citizen | Registered user | Create reports, add photos/comments, confirm ("I see this too"), follow reports, get notifications |
| Moderator | App team / volunteers | Review for spam, merge duplicates, fix category/location |
| Authority staff | District / city unit | Receive, acknowledge, assign, update status, attach "fixed" photo |
| Admin | App team | Manage users, categories, districts, authority accounts, analytics |

---

## 3. Core user journeys

**Report a problem (citizen)**
1. Open app → tap **Report**.
2. Take/upload up to 3 photos (GPS read from device; EXIF as fallback).
3. Confirm location on a map pin (adjust if needed).
4. Pick category, optional description, optional "danger level" (Minor / Needs attention / Dangerous).
5. Submit → see a reference number (e.g. `FX-2026-004821`) and the status "Submitted".
6. Duplicate check: if a similar report is within ~30 m, offer "Add your confirmation to this one" instead.

**Track a report**
Report page shows: photos, map, category, current status, timeline of status changes, official responses, confirmation count, and a "fixed" photo when closed.

**Authority workflow**
Inbox (filtered by district/category) → Acknowledge → Assign to team/contractor → In progress → Resolved (with photo) → Citizen can confirm or **reopen** if not really fixed.

---

## 4. Features

### MVP (v1)
- Map + list of reports with filters (category, status, district, date)
- Create report: photos, location pin, category, description
- Report detail page with status timeline
- Citizen accounts (phone or email login)
- Authority dashboard: inbox, change status, add comment, upload resolution photo
- Email/SMS/push notification on status change
- Mongolian + English UI
- Basic moderation and spam protection

### v2
- "Me too" confirmations and upvoting for prioritization
- Duplicate detection and merging
- Reopen disputed fixes
- Anonymous reporting option
- Public stats: reports by district, average time to fix, fix rate
- Installable PWA with offline draft queue

### v3
- Authority API / integration with city systems
- Contractor assignment, SLA timers, escalation when overdue
- Open-data export (CSV/GeoJSON)
- Heat maps, recurring-problem hot spots, seasonal planning (e.g. pothole season after winter)
- Gamification (badges for helpful reporters) — only after the core is trusted

---

## 5. Issue categories

Keep the list short and mappable to a responsible unit. **[Verify]** the owner of each with the city.

| Category | Examples | Default urgency |
|---|---|---|
| Traffic signal / road sign | Broken or dark signal, missing/damaged sign | High |
| Exposed wire / electrical | Hanging cable, open junction box | **Critical** |
| Street lighting | Dead lamp, leaning pole | Medium |
| Pothole / road surface | Pothole, cracked asphalt, sinkhole | Medium–High |
| Pavement / sidewalk | Broken tiles, missing kerb, blocked path | Medium |
| Drainage / manholes | Missing cover, blocked drain, flooding | High |
| Winter hazards | Unplowed road, ice on key paths | Medium |
| Other | Anything else (moderator re-categorizes) | Low |

For **Critical** items show: "This looks dangerous. If someone is at risk, call emergency services now," and keep the report at the top of the authority inbox. **[Verify]** the correct emergency numbers before shipping — do not hardcode unverified numbers.

---

## 6. Status model

```
Submitted → Under review → Accepted → Assigned → In progress → Resolved → Closed
                 │                                                  │
                 └→ Rejected (reason required)        Reopened ←────┘ (citizen disputes)
                 └→ Duplicate (links to original)
```

Rules:
- Every transition is logged: who, when, optional note.
- `Rejected` and `Duplicate` require a public reason.
- `Resolved` should include an after-photo.
- Auto-close `Resolved` after N days with no dispute (e.g. 14).
- Overdue timers per category (v3) trigger escalation.

---

## 7. Government engagement (the make-or-break part)

An app nobody in government reads is a complaint box to nowhere. Before heavy building:

1. **Identify the responsible bodies** [Verify]: the city municipality, district (duureg) administrations, road/transport department, street lighting and electricity utilities, utilities for drainage. Map each category → owner.
2. **Find a champion.** One person in a district office who agrees to try the inbox for a pilot.
3. **Choose the integration level**
   - *Level 0 – Manual:* Daily email/PDF/spreadsheet digest to the right office; you copy responses back. Good for a pilot.
   - *Level 1 – Dashboard:* Authority staff log in to FixUb.
   - *Level 2 – Integration:* API/webhook into existing city complaint systems or hotline.
4. **Existing channels.** Research current hotlines/portals/social channels [Verify] so FixUb complements rather than competes. Reports could be forwarded to them with a reference number.
5. **Agree on service expectations**: acknowledgement within X working days, categories treated as urgent, how "rejected" is communicated.
6. **Pilot in one district** for 2–3 months, publish results, then expand.
7. **Legal/MOU.** Get a written agreement on data sharing, official responses, and who operates what. [Verify] with a lawyer.

Position FixUb as helping the government: structured, located, photo-backed, deduplicated reports, plus data to plan budgets.

---

## 8. Technology

The repo is a fresh Next.js scaffold (`package.json`): **Next.js 16.4.3, React 19.3, TypeScript, Tailwind CSS 4, React Compiler**, with `cacheComponents` and `partialPrefetching` enabled in `next.config.ts`.

> **Important:** `AGENTS.md` warns that this Next.js version has breaking changes from older versions. Before writing code, read the relevant guide in `node_modules/next/dist/docs/` (run `npm install` first if the folder is missing) and heed deprecation notices. In particular, check how `cacheComponents` changes data fetching, caching and dynamic rendering (e.g. pages that read user data/cookies must be handled as dynamic).

### Recommended stack

| Concern | Suggestion | Why |
|---|---|---|
| Framework | Next.js App Router (existing) | SSR for shareable report pages, one codebase |
| Database | PostgreSQL + **PostGIS** | Geo queries (nearby duplicates, district lookup) |
| ORM | Prisma or Drizzle | Typed schema, migrations |
| Auth | Auth.js / Clerk / Supabase Auth; phone OTP | Phone login fits local usage [Verify SMS provider cost] |
| Image storage | S3-compatible bucket (R2, S3, Supabase Storage) | Cheap, CDN-friendly |
| Maps | MapLibre GL or Leaflet + OpenStreetMap tiles | Free, no vendor lock-in; check tile usage policy or use a tile provider |
| Geocoding | Nominatim/Photon or reverse-geocode on server | Address text from pin |
| Notifications | Email (Resend/SES), SMS gateway, Web Push | Status updates |
| Validation | Zod | Shared client/server schemas |
| Background jobs | Queue/cron (e.g. pg-boss, Vercel Cron) | Auto-close, reminders, digests |
| Hosting | Vercel or a VPS/Docker | Start simple |
| Monitoring | Sentry + uptime check | Know when it breaks |

A simpler all-in-one alternative: **Supabase** (Postgres + PostGIS, Auth, Storage, Row Level Security) — fastest path for a small team.

### Architecture overview

```
 Citizen (mobile browser / PWA)          Authority staff
            │                                  │
            └────────── Next.js app ───────────┘
               (UI, Server Actions / Route Handlers)
                  │            │            │
              PostgreSQL    Object store   Notification
              + PostGIS     (photos)       providers
```

### Suggested folder structure

```
src/
  app/
    (public)/            map, list, report/[id]
    report/new/          create-report flow
    me/                  my reports, notifications
    authority/           dashboard (role-protected)
    admin/               moderation, config
    api/                 webhooks, upload signing, public data
  components/            Map, PhotoUploader, StatusBadge, Timeline…
  lib/
    db/                  schema, queries
    auth/                session, role guards
    geo/                 distance, district lookup
    storage/             signed uploads, image processing
    notify/              email/SMS/push
    i18n/                mn.json, en.json
  types/
```

### Data model (core tables)

```
users(id, name, phone, email, role, locale, created_at)
districts(id, name_mn, name_en, boundary geometry)
authorities(id, name, district_id, categories[], contact)
authority_members(user_id, authority_id)

categories(id, slug, name_mn, name_en, default_urgency, authority_id)

reports(
  id, ref_code, reporter_id (nullable),
  category_id, description, urgency,
  location geography(Point), address_text, district_id,
  status, assigned_authority_id, duplicate_of_id,
  created_at, updated_at, resolved_at
)
report_photos(id, report_id, url, kind[before|after], width, height, created_at)
status_events(id, report_id, from_status, to_status, actor_id, note, created_at)
comments(id, report_id, author_id, body, is_official, created_at)
confirmations(report_id, user_id, created_at)   -- "me too"
follows(report_id, user_id)
notifications(id, user_id, report_id, channel, sent_at, read_at)
audit_log(id, actor_id, action, entity, entity_id, meta, created_at)
```

Index `reports` on `location` (GiST), `status`, `district_id`, `created_at`.

### Key technical details

- **Photo upload:** direct-to-bucket via signed URLs; resize client-side (max ~1600 px) to save mobile data; strip EXIF *after* extracting GPS; enforce type/size limits; virus/NSFW scan optional.
- **Location:** use browser Geolocation (HTTPS required); allow manual pin drag; reject points outside UB boundary (or flag).
- **Duplicates:** query `ST_DWithin(location, point, 30)` for same category in open statuses.
- **Offline/poor connectivity:** PWA; save drafts in IndexedDB and retry upload.
- **Server vs client:** keep the map and photo capture as client components; fetch lists/detail on the server. Follow the Next.js docs in `node_modules` for the cache/dynamic rules of this version.
- **API for authorities (v3):** REST + signed webhooks; export GeoJSON/CSV.

---

## 9. UX and design

- Big primary "Report" button on every screen; thumb-reachable.
- Report flow as 3–4 short steps with progress indicator; autosave draft.
- Status shown with color **and** text/icon (accessibility).
- Plain, respectful language; no jargon.
- Mongolian Cyrillic font support (test Geist or choose a font with full Cyrillic coverage); allow text expansion in layouts.
- Accessibility: WCAG 2.1 AA, contrast, 44 px touch targets, labels on all inputs, alt text from category.
- Works on low-end Android; keep JS and image payloads small.
- Empty states and error messages that tell people what to do next.

---

## 10. Privacy, safety, and trust

- **Collect the minimum:** phone/email for notifications; don't show it publicly.
- **Photos can contain people and plates:** warn users, offer blur tool (v2), allow moderators to hide.
- **Anonymous mode:** public view never shows reporter identity; optionally allow reports without public name.
- **Consent and policy:** privacy policy and terms in Mongolian & English; comply with Mongolia's personal data protection law [Verify with a lawyer].
- **Abuse prevention:** rate limits per user/IP/device, CAPTCHA on anonymous, moderation queue, report-the-report button, ban tools.
- **Don't be an emergency service:** clearly state that FixUb is not for urgent emergencies.
- **Security basics:** HTTPS only, secure cookies, role checks on every server action (never trust the UI), parameterized queries, upload validation, secrets in env vars, regular backups, audit log for staff actions.
- **Data retention:** define how long photos/accounts are kept; support account deletion.

---

## 11. Quality and testing

- **Unit:** geo helpers, status transition rules, validation schemas.
- **Integration:** report creation, authority status change → notification.
- **E2E (Playwright):** mobile viewport, create report with photo, authority resolves it, citizen sees update.
- **Manual device testing:** low-end Android, iOS Safari, slow 3G, GPS off/denied.
- **Accessibility:** automated (axe) + keyboard/screen-reader pass.
- **Security:** authorization tests (citizen cannot hit authority actions), upload abuse tests.
- CI: `npm run lint`, type-check, tests, `npm run build` on each PR.

---

## 12. Roadmap

| Phase | Weeks | Deliverables |
|---|---|---|
| 0. Discovery | 1–3 | Talk to citizens + 1 district office; confirm categories/owners; decide manual vs dashboard handoff |
| 1. Foundation | 3–5 | Auth, DB schema, i18n, design system, map component |
| 2. MVP | 5–10 | Create report, list/map, detail + timeline, authority inbox, notifications |
| 3. Pilot | 10–22 | One district, real traffic, weekly feedback with the district champion, fix issues |
| 4. Harden | 22–28 | Moderation, duplicates, reopen, public stats, PWA/offline |
| 5. Scale | 28+ | More districts, API/integration, open data, SLA/escalation |

(Adjust to team size; this assumes 2–3 people.)

---

## 13. Success metrics

- Time to submit a report (target < 60 s median)
- Reports per week; share with photo + valid location
- **Acknowledgement rate and time** by the authority (the key trust metric)
- Median time to resolution by category and district
- Resolution rate; % reopened
- Duplicate/spam rate
- Weekly active reporters and repeat reporters
- Citizen satisfaction (one-tap rating when closed)

Publish a monthly public summary — it motivates both citizens and officials.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Government doesn't respond | Early champion, manual digest fallback, public response-rate stats, MOU |
| Low citizen adoption | Pilot in a district, partner with community groups/schools, share fixes on social media |
| Spam/false reports | Account verification, rate limits, moderation, reputation |
| Duplicate flood | Proximity check, "me too" button, merge tool |
| Privacy incidents (faces, plates) | Warnings, moderation, takedown process |
| Poor connectivity | PWA, image compression, draft queue |
| Reputational/political pressure | Neutral tone, clear rules, transparent moderation |
| Cost growth (images, SMS, maps) | Compression, retention policy, budget alerts, SMS only for key events |
| Single maintainer burnout | Documentation, a small volunteer team, simple architecture |

---

## 15. Getting started (developer checklist)

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run build
```

1. Read `node_modules/next/dist/docs/` for this Next.js version (per `AGENTS.md`).
2. Replace the starter `src/app/page.tsx` with the home view (map + Report button).
3. Choose and provision: Postgres+PostGIS, storage bucket, auth provider.
4. Create `.env.local` (never commit): `DATABASE_URL`, storage keys, auth secrets, map tile key if needed.
5. Implement schema + seed districts and categories.
6. Build the report flow end to end (photo → pin → category → submit) before anything else.
7. Add the authority inbox and status transitions.
8. Add notifications, then i18n polish.
9. Deploy a staging environment and show it to your district champion.

### Definition of done for the MVP
A citizen can report a pothole with a photo from their phone in under a minute, an authority user sees it in their inbox, marks it resolved with a photo, and the citizen is notified and can see the full timeline publicly.

---

## 16. Open questions for you

1. Confirm city = Ulaanbaatar and languages (Mongolian + English?).
2. Who is the first government contact, and which district for the pilot?
3. Is there an existing city complaint system/hotline you must integrate with?
4. Phone-number login (SMS cost) or email/social login?
5. Who operates moderation day to day?
6. Budget and hosting constraints (cloud vs local hosting; data residency requirements)?
7. Is FixUb independent, or run in partnership with / on behalf of the municipality (affects branding and legal)?
