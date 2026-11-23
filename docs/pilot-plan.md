# FixUB pilot plan

A proposal for the first real use of FixUB: small enough to run with a handful of people, long
enough to show whether reports actually get fixed. Numbers marked *(to agree)* are starting
points, not commitments.

## What the pilot has to answer

1. Will residents report problems this way, and are the reports usable (clear photo, right place)?
2. Will the partner organization act on them, and how fast?
3. How much work is triage and moderation for the FixUB team per day?

If the answer to the second question is no, nothing else matters: a platform where reports
sit unanswered teaches people not to report.

## Scope

| | Pilot | Why |
| --- | --- | --- |
| Area | One district *(to agree)* | One set of streets, one group of staff to know |
| Partner | One organization, with a named manager | Every report has someone responsible |
| Categories | The one or two that partner handles, e.g. roads and street lighting | Reports outside them would have no owner. Turn the other categories off in `/admin/categories` or expect to close them as "out of scope" |
| Length | 8 weeks *(to agree)* | Long enough to see repairs finish and residents answer "is it fixed?" |
| People | 1–2 FixUB admins, the partner's manager, 2–5 of their staff | |

Reports from outside the district or the categories still arrive. Decide beforehand what
happens to them: closed with reason "out of scope" and a public note saying why is honest and
keeps the map clean.

## Before the first day

Software steps are the "Going live" list in the README. Besides those:

- [ ] The partner has signed what was agreed (see [partner-onboarding.md](partner-onboarding.md)).
- [ ] The partner's manager and staff have signed in and can see their queue on a phone.
- [ ] Response targets are agreed and set in `RESPONSE_TARGET_DAYS` (`src/lib/meta.ts`).
- [ ] It is decided whether reports are reviewed before they are public (`REVIEW_BEFORE_PUBLIC`).
      For a pilot with photos of real streets and people: yes.
- [ ] The privacy and terms pages name the operator and a contact address, and a lawyer has read them.
- [ ] Someone is named for each day of the week to do triage (see [operations-runbook.md](operations-runbook.md)).
- [ ] Residents of the district have been told: how, by whom, and what they were promised.

## What to measure

All of these are on `/statistics`, `/admin` or the partner's `/staff` page already.

| Measure | Where | Worth worrying when *(to agree)* |
| --- | --- | --- |
| Reports per week | Statistics, "Incoming" | Fewer than 10: people don't know about it, or don't bother |
| Median first response | Statistics / Overview | More than 2 working days |
| Overdue reports | Overview, staff queue | Growing week over week |
| Resolved per week against incoming | "Incoming vs resolved" | Backlog grows for three weeks running |
| Disputed fixes | Overview, staff queue | More than 1 in 5 resolved reports |
| Hidden or closed as invalid | Moderation, report list | More than 1 in 10: the form or the rules are unclear |
| Minutes of triage per day | Ask the admins | More than an hour for one district |

Also collect what the numbers can't show: a short conversation with the partner's manager
every week, and with a few residents who reported at the end.

## Weekly rhythm

- **Daily:** triage and moderation (the runbook).
- **Monday:** FixUB admin and the partner's manager look at overdue and disputed reports together.
- **End of weeks 2, 4, 8:** write down the numbers above and what changed.

## Deciding what comes next

At the end, one of three:

- **Widen** (a second district or partner): reports arrive, the partner answers within the agreed
  time, and triage fits in the time the team has.
- **Fix and repeat:** residents report but something specific fails (slow answers, too many
  unusable reports, too much triage). Change that one thing and run four more weeks.
- **Stop:** the partner does not act on reports. Say so publicly on the site, and close the
  open reports with an explanation rather than leaving them.

## Risks to plan for

| Risk | What to do |
| --- | --- |
| A report shows a person, a number plate or something private | Review before public; admins hide it and ask for a new photo |
| An emergency is reported here instead of to 102 / 103 / 105 | The form says FixUB is not an emergency service; admins who see one call the service themselves |
| The partner's staff stop updating statuses | The Monday meeting; overdue counts are visible to both sides |
| The site is down | The runbook, "When the site is down" |
| Someone asks for their data to be deleted | Users page → Delete (runbook, "Requests from people") |
