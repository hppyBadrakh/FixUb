# FixUB — Scope and Business Processes

This file describes what FixUB does and where it is headed. The rules live in `src/lib/domain/` (`lifecycle.ts`, `rules.ts`) and in the server actions (`src/server/actions/`).

## Purpose

Residents of Ulaanbaatar report street problems with a photo and a pin. The FixUB team reviews each report, sets its priority and assigns it to an organization and repair unit. Organization staff move it through a status lifecycle. Residents and the public see the progress and say whether the problem is actually fixed.

FixUB is the middleman: it receives, triages, routes and publishes.

## In scope

- Camera-only reporting: 1–3 photos, category and subcategory, map pin inside the service area, description (10–1,000 characters).
- Duplicate warning: open reports of the same category within 50 m and 90 days.
- Public map, list and report pages with a timeline; "My reports".
- Admin triage: priority and assignment to an organization and unit.
- Staff console per organization: a queue sorted by priority, status changes, public notes, completion photo.
- Citizen verdicts ("fixed" / "not fixed") on resolved reports, and "me too" confirmations on open ones.
- Flagging, auto-hide after three open flags, and admin moderation with undo.
- Editable category tree, organizations and units.
- Statistics: first-response time, medians, age buckets.
- Mongolian first, English second, dark mode, mobile first.

## Out of scope (current)

- Any connection to a real government body. No organization has agreed to act on reports yet; the sample organizations are fictional.
- Email, SMS or push notifications (in-app notifications exist).
- Emergency handling. FixUB is not an emergency service.
- Proof that a photo is genuine. Camera-only capture discourages abuse and can't guarantee it.

## Roles

| Role | Can |
|---|---|
| Visitor | Browse the map and reports |
| Citizen | Report, track, "me too", give a verdict, flag |
| FixUB admin | Set priority, assign, make any status change, moderate, manage organizations and categories |
| Organization staff | Work their organization's reports through the allowed status moves |
| Organization manager | Staff rights, plus close and reopen |

Staff who open another organization's report get "doesn't exist".

## Business process

1. **Report.** A citizen files a report. It starts as `reported`, priority pending, and is public at once.
2. **Duplicate check.** Nearby similar reports are shown. The citizen is warned, not blocked.
3. **Triage.** An admin sets the priority (low, medium, high or critical, with an optional internal note) and assigns an organization and unit. The category suggests the owner.
4. **Work.** Staff move the report through the lifecycle and add public notes. A completion photo is optional.
5. **Verdict.** After `resolved`, the reporter and the people who said "me too" answer "fixed" or "not fixed". A new resolution starts a fresh round of answers. When "not fixed" outnumbers "fixed", the report is marked disputed and the organization's manager and the admins are notified.
6. **Reopen.** A manager moves a `resolved` report back to `investigating`. An admin can reopen a `closed` report.
7. **Moderation.** Any user can flag a report. Three open flags hide it. Admins hide, restore or dismiss.
8. **Reporting.** Admins review statistics and the activity feed.

## Status flow

`reported → investigating → in_progress → resolved`, with `closed` as a side exit.

| From | To | Needs |
|---|---|---|
| reported | investigating, in_progress, resolved | staff |
| reported | closed | manager |
| investigating | in_progress, resolved | staff |
| investigating | closed | manager |
| in_progress | resolved | staff |
| in_progress | closed | manager |
| resolved | investigating | manager |
| closed | reported | admin |

Rules:
- `closed` needs a reason: duplicate, invalid or out of scope. A duplicate must link to another visible, unclosed report.
- Leaving `resolved` or `closed` needs a note.
- Changes carry a version number, so a concurrent edit returns a conflict.

## Known gaps (to fix)

- Notifications are in the app only (the bell). There is no email, SMS or push.
- A dispute ("still broken" outnumbers "fixed") alerts the manager and admins; it does not reopen the report by itself.
- Overdue is shown in the consoles from fixed targets per priority. Nothing escalates or closes automatically.
- Review before publication exists as a switch (`REVIEW_BEFORE_PUBLIC`) and is off by default: decide it before real use.
- No "awaiting reply" or "unrouted" status.
- Priority is shown on public pages. Decide whether it should stay public.

## Next steps

Done: a real backend (Postgres), Google sign-in, server-side role checks, account management by admins, and a consent notice before the first report.

1. Go live: the checklist is in the README, "Going live". The pilot, partner and daily-operations documents are in `docs/`.
2. Fix the gaps above.
3. Add notifications.
4. Connect real organizations.
