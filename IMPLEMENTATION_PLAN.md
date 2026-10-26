# FixUb — Implementation Plan

Companion to [GUIDE.md](GUIDE.md). The guide says *what and why*; this says *what to build, in what order, and how to know each phase is done*.

**End goal:** Ulaanbaatar citizens report street problems (photo + location), the responsible authority receives and updates them, and everyone can track status publicly — running in at least one real district with measurable results.

**Assumptions:** team of 2–3, ~28 weeks to a multi-district rollout, Next.js 16 scaffold already in repo, Mongolian + English UI. Adjust durations to your team.

**Rules for every phase**
- Each phase ends with something demoable and a short written exit check. Don't start the next phase until the exit check passes.
- Before writing Next.js code, read `node_modules/next/dist/docs/` (see `AGENTS.md`); `cacheComponents` is on, so check the caching/dynamic rules first.
- Authorization is enforced on the server in every action, from Phase 1 onward.

---

## Phase 0 — Discovery and decisions (Weeks 1–3)

Mostly non-code. This phase decides whether the project succeeds.

| Task | Output |
|---|---|
| Interview 8–10 citizens about what they'd report and why they don't today | Notes, top 5 pain points |
| Meet one district office; find a **champion** | Named contact, agreed pilot district |
| Map category → responsible unit (traffic signals, lighting, roads, drainage, electrical) | Category/owner table |
| Learn existing channels (hotline, portals, social pages) | Integration decision: manual digest vs dashboard |
| Confirm emergency numbers, legal/privacy requirements, hosting rules | Short legal/compliance note |
| Decide stack: auth method (phone OTP vs email), hosting, DB | Decisions recorded in `docs/decisions.md` |
| Collect district boundary data (GeoJSON) | `districts.geojson` |

**Exit check:** a named government contact agrees to try the pilot; category-owner table exists; stack chosen.

---

## Phase 1 — Foundation (Weeks 3–5)

Goal: a deployable skeleton with auth, database, and design basics.

1. **Tooling:** `npm install`, confirm `lint` and `build` pass; add Prettier, Zod, test runner (Vitest), Playwright; CI running lint + typecheck + test + build.
2. **Environments:** local, staging, production; `.env.example`; secrets never committed.
3. **Database:** Postgres + PostGIS; ORM (Prisma/Drizzle); migrations; seed script for districts, categories, authorities.
4. **Auth:** sessions, roles (`citizen`, `moderator`, `authority`, `admin`), a `requireRole()` server helper used by every protected action.
5. **i18n:** Mongolian default + English; routing/locale switch; verify Cyrillic font rendering.
6. **Design system:** tokens, buttons, inputs, `StatusBadge`, layout shell, mobile bottom nav with prominent **Report** button.
7. **Base pages:** replace starter `src/app/page.tsx`; stubs for map/list, `/report/new`, `/me`, `/authority`.
8. Deploy staging.

**Exit check:** user can sign up/in on staging from a phone; roles gate routes; CI green; seed data loads.

---

## Phase 2 — MVP: the reporting loop (Weeks 5–10)

Goal: a citizen reports, an authority responds, the citizen sees it. Build in this order — each step is usable on its own.

**2a. Create a report (Weeks 5–7)**
- Photo capture/upload with client-side resize; signed direct upload to storage; up to 3 photos.
- Location: browser geolocation, draggable pin, reverse-geocoded address text, EXIF GPS fallback, UB boundary check; district resolved with `ST_Contains`.
- Category picker, description, danger level; critical categories show the emergency warning.
- Server action with Zod validation; generates `ref_code`; writes `reports` + `status_events`.
- Draft autosave (local storage) and retry on failure.

**2b. View reports (Weeks 7–8)**
- Map (MapLibre/Leaflet + OSM) with clustering; list view; filters (category, status, district, date).
- Report detail page: photos, map, timeline, official responses. Shareable URL with proper metadata.
- "My reports" page.

**2c. Authority side (Weeks 8–9)**
- Inbox filtered to the user's authority/district, sortable by urgency and age.
- Status transitions enforced by a single state-machine module (reject/duplicate need a reason; resolve needs an after-photo).
- Official comments; assign to team member.

**2d. Notifications and moderation basics (Weeks 9–10)**
- Email (and SMS for key events if budget allows) on submit, acknowledged, resolved.
- Rate limits, basic spam checks, moderator queue to hide/recategorize.
- Legal pages: privacy policy, terms, "not an emergency service" notice.

**Tests:** unit (state machine, geo helpers, validation); E2E on mobile viewport: report → authority resolves → citizen sees update; authorization tests.

**Exit check (MVP definition of done):** a citizen reports a pothole with photo from a phone in < 60 s; the authority user sees it, resolves it with a photo; the citizen is notified and the public timeline is correct. Security review of upload and role checks done.

---

## Phase 3 — Pilot in one district (Weeks 10–22)

Goal: real usage, real government responses, real learning.

1. **Pre-launch (Weeks 10–12):** onboard district staff (training session + one-page cheat sheet); load test with ~50 synthetic reports; set up error monitoring (Sentry), uptime checks, backups, an on-call/contact rota.
2. **Soft launch (Weeks 12–14):** 20–50 invited users (community groups, a school, local volunteers). Daily check of the inbox with the champion.
3. **Public launch in the district (Weeks 14–16):** posters/social posts at known problem spots; ask local media to cover it.
4. **Iterate (Weeks 16–22):** weekly feedback call with the champion; fix top usability issues; tune categories; refine notifications.
5. **Fallback:** if staff won't log in, send a daily digest (email/PDF/CSV) and enter their replies yourselves — don't stall the pilot on dashboard adoption.
6. **Measure:** track the metrics in GUIDE.md §13 weekly; write a pilot report with numbers and stories (before/after photos).

**Exit check:** ≥ 100 real reports, authority acknowledgement within the agreed time for most, ≥ 30% resolved, no unresolved privacy/security incident, and written go-ahead from the government partner to expand.

---

## Phase 4 — Harden and improve (Weeks 22–28)

Driven by pilot findings; likely items:

- "Me too" confirmations; duplicate detection (`ST_DWithin` ~30 m, same category) and merge tool.
- Reopen a "resolved" report with a photo; auto-close after 14 days without dispute.
- Public stats page (per district, per category, median time to fix).
- PWA: installable, offline draft queue, push notifications.
- Photo privacy: blur tool, moderator takedown, faster reporting of abuse.
- Performance and accessibility pass (WCAG 2.1 AA, low-end Android, slow network).
- Anonymous reporting option with extra spam controls.
- Ops: backup restore drill, data retention job, cost alerts.

**Exit check:** duplicate rate and spam rate under agreed thresholds; Lighthouse/axe checks passing; restore drill succeeded.

---

## Phase 5 — Scale to the city (Week 28+)

1. **District onboarding kit:** repeatable process (contacts, training, boundary and authority setup, launch checklist).
2. **Integration:** authority API/webhooks into city systems or hotline; signed requests; docs.
3. **Service levels:** per-category SLA timers, overdue flags, escalation to supervisors, monthly accountability report.
4. **Open data:** CSV/GeoJSON export, public API with rate limits.
5. **Analytics:** hotspot map, recurring-problem detection, seasonal planning views for the city.
6. **Sustainability:** funding model (grants, municipality contract, sponsorship), governance for moderation, documented runbooks, volunteer maintainer onboarding.

**Exit check (project goal met):** multiple districts live, authorities respond within agreed SLAs, public stats published monthly, funding/operations secured for the next 12 months.

---

## Dependency map

```
Phase 0 decisions ─► Phase 1 foundation ─► 2a create ─► 2b view ─► 2c authority ─► 2d notify/moderate
                                                                                      │
                                         Government champion (from Phase 0) ─────────►│
                                                                                      ▼
                                                                         Phase 3 pilot ─► Phase 4 harden ─► Phase 5 scale
```

The authority side (2c) and a real government contact are on the critical path. Don't polish citizen features before an authority can act on them.

---

## Phase-by-phase risks

| Phase | Biggest risk | Mitigation |
|---|---|---|
| 0 | No government contact | Start with a community-run pilot and a digest; use early data to win interest |
| 1 | Over-engineering the stack | Pick managed services (e.g. Supabase) if the team is small |
| 2 | Photo/GPS flow fails on real phones | Test on low-end Android and iOS Safari weekly |
| 3 | Staff don't respond | Champion, digest fallback, publish response-rate stats |
| 4 | Scope creep from feedback | Prioritize by pilot metrics, not requests |
| 5 | Costs and moderation load grow | Budget alerts, retention policy, volunteer moderators |

---

## Suggested first week of coding

1. `npm install`, read the Next.js docs in `node_modules`, confirm `npm run build` passes.
2. Set up Postgres + PostGIS and the ORM; write the schema from GUIDE.md §8.
3. Implement auth and `requireRole()`.
4. Build the `/report/new` page with only photo + pin + category, saving to the DB.
5. Show that report on a simple list page.

That vertical slice proves the riskiest technical parts (camera, GPS, upload, database) early.
