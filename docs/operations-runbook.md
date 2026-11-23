# FixUB operations runbook

For the FixUB admins who run the service day to day: what to do each day, how to handle the
situations that come up, and what to do when something breaks. Where a rule is a judgement
call it says so; write down what you decide so the next admin decides the same way.

## Every day

Open `/admin`. The bell at the bottom left shows what needs you; the cards at the top are the
same work, counted.

### 1. Review new reports (the review queue)

For each report without a priority:

1. **Look at the photo first.** Is a person's face, a number plate, or the inside of someone's
   home clearly visible? Is it something other than a public infrastructure problem? If so,
   hide it (Moderation card → Hide) rather than publishing it. The reporter is notified.
2. **Is it an emergency** (a fallen power line, an open manhole on a road)? FixUB is not an
   emergency service: call the responsible service yourself, then continue.
3. **Is it a duplicate?** The workspace shows nearby reports of the same kind. If it is, close
   it with reason "duplicate" and choose the original.
4. **Set the priority.** *(Agree your own definitions; a starting point:)*
   - Critical: danger to people now.
   - High: a main road or many people affected; will get worse quickly.
   - Medium: a real problem, no immediate danger.
   - Low: cosmetic, or little used.
   The internal note is for staff, never public: say why.
5. **Assign** it to the organization, and a unit if you know it. The category suggests one.

If `REVIEW_BEFORE_PUBLIC` is on, a report becomes public at step 4. Until then only its
reporter and the admins see it, so the queue should not wait more than a working day.

### 2. Moderation

`/admin/moderation`: reports people flagged. Three flags hide a report until you look.

- Restore it if the flags were wrong; hide it if they were right; dismiss flags on a report
  that is fine but was never hidden. Every one of these can be undone from the toast.
- An account that keeps posting things that have to be hidden: block it (`/admin/users` → Block).
  Blocking signs them out everywhere; their reports stay.

### 3. Overdue and disputed

- **Overdue** (Overview card): reports past the agreed time for their priority. Raise them with
  the organization's manager; if it is the wrong organization, reassign.
- **Disputed** (the line under the charts, and your bell): residents say a "resolved" report is
  still broken. Look at the completion photo and the answers. The organization's manager can
  reopen it with a note; so can you.

## Requests from people

| Request | What to do |
| --- | --- |
| "Give my colleague access" | They sign in with Google once. Then `/admin/users` → find them → set Access, Organization, Unit → Save |
| "Make me an admin" | Another admin does it on `/admin/users`. You can't change your own access |
| "Take my report down" | Hide it in the report's workspace. Say why in a reply if they wrote to you |
| "Delete my account" | Confirm the request came from that person (it should come from the account's email address). `/admin/users` → Delete. Their reports stay public, linked to nobody. It can't be undone |
| "Send me my data" | There is no export button yet. Their account details are on `/admin/users`; their reports are under "My reports" when they are signed in. A full copy needs a database query by someone with access: write down who does that |
| "Who reported this?" (from an organization, or anyone) | Nobody is told. The software doesn't show it to admins either |

## When the site is down

1. Open `https://<site>/api/health`.
   - `"ok": true`: the site and database are up. The problem is one page or one person: ask
     them for the address and what they see.
   - `"database": "unreachable"`: the database. Check the Neon console (is the project
     suspended, over quota, or in an incident?).
   - No answer, or a Cloudflare error page: the Worker. Cloudflare dashboard → Workers → fixub.
2. **If it started right after a merge:** Cloudflare dashboard → Workers → fixub → Deployments →
   roll back to the previous version. Then fix forward in a new pull request.
3. **Logs:** Workers → fixub → Observability. Server errors start with `[server]`.
4. Tell the partner organizations if it lasts more than an hour in working time.

There is no on-call rotation and no automatic alert yet: until an uptime service is set up
(README, "Operations"), you find out when someone tells you.

## Things only someone with the dashboards can do

- Change who is always an admin (`ADMIN_EMAILS`), or any other server setting: Cloudflare
  dashboard → Workers → fixub → Settings → Variables and Secrets.
- Restore the database to an earlier moment: Neon console → Branches.
- Apply a database migration after a release that has one: `npm run db:migrate` with the
  production connection string. It must be done **before** that release is merged.

## Decisions to write down here once made

- Priority definitions (above) and response times.
- What counts as "must be hidden", with examples.
- Who does triage on which day, and who covers holidays.
- How a deletion request is verified.
- The minimum age to use the service, if any.
- How long reports and photos are kept (today: forever).
