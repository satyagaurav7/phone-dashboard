# Google Calendar + Home Max — one-time setup (your part)

The sync code is done. It needs a Google Cloud service account and one calendar
share. ~10 minutes, in this order. Everything runs server-side in GitHub
Actions — no browser, no phone, no extension.

**Target account: `booms.satya@gmail.com`** — the same account the Home Max is
signed into and the same one the dashboard authenticates with.

## What this does and doesn't do

- **Does:** mirror the timed blocks in `schedule.json` into Google Calendar,
  7 days ahead, refreshed daily. That is the only thing the Home Max can read.
- **Doesn't:** track anything. Taps, momentum, and completion stay in Firestore
  where they already live. Nothing is ever read back from Google.
- **Doesn't:** write to Google Tasks. Tasks go overdue and nag; calendar events
  pass silently. Keeping the rhythm in Calendar is what preserves the
  reward-only rule.

## 1. Service account → GitHub secret

1. [Google Cloud Console](https://console.cloud.google.com/) → sign in as
   **booms.satya@gmail.com** → create a project (or reuse `newt-90ca4`).
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   Name it `flowstate-calendar`. Skip the optional role/access steps → **Done**.
4. Click the new service account → **Keys → Add key → Create new key → JSON**.
   A file downloads.
5. **Copy the service account's email** — it looks like
   `flowstate-calendar@<project>.iam.gserviceaccount.com`. You need it in step 2.
6. GitHub → `satyagaurav7/phone-dashboard` → **Settings → Secrets and variables
   → Actions → New repository secret**.
   Name: `GOOGLE_CALENDAR_SERVICE_ACCOUNT` · Value: the **entire** JSON file.
7. Delete the downloaded JSON afterwards.

## 2. Share the calendar with that service account

A service account has no calendar of its own — it can only write to one you
share with it.

1. [Google Calendar](https://calendar.google.com/) as **booms.satya@gmail.com**.
2. Left sidebar → hover your **primary** calendar → **⋮ → Settings and sharing**.
3. **Share with specific people or groups → Add people** → paste the service
   account email from step 1.5.
4. Permission: **Make changes to events** → **Send**.

> **Why primary and not a separate "FLOWSTATE" calendar?** Assistant reads the
> primary calendar reliably and secondary calendars inconsistently. A tidy
> separate calendar is the nicer design but risks the speaker silently ignoring
> it. Start on primary, confirm the speaker talks, and only then consider
> moving. To move later: create the calendar, share it the same way, and set a
> repo **variable** (not secret) `CALENDAR_ID` to its calendar ID.

## 3. Test it

1. GitHub → **Actions → Calendar sync → Run workflow** → days `7`,
   dry run ✅ → **Run**. The log should list 7 days and ~110 blocks without
   touching anything.
2. Run it again with dry run ❌. The log should end with
   `Created 110, updated 0, failed 0.`
3. Open Google Calendar. Today should show your day-kind's blocks, all marked
   **free** (they won't make you look busy) and with **no reminders** — the
   dashboard's own push notifications still do all the nudging.

## 4. Confirm the Home Max actually speaks it

This is the only step I can't verify for you — it needs your ears.

Say to the speaker:

- *"Hey Google, what's on my calendar today?"*
- *"Hey Google, what's my first event tomorrow?"*

You should hear the FLOWSTATE blocks read back. **If it says your calendar is
empty**, the speaker is on a different account or is only reading a calendar
you didn't share — check the Home app → Settings → Services → Calendar and
confirm which account and which calendars are selected.

## After that, it runs itself

- **~7 AM daily** — refreshes a rolling 7-day window, just before the morning
  brief push fires.
- Re-running is safe. Event ids are derived from date + schedule key, so a
  second run updates the same blocks rather than duplicating them.
- Edit `schedule.json`, push, and the next sync rewrites the affected days.
- Same GitHub cron caveat as notifications: runs can land 1–3 hours late. It
  doesn't matter here — the window is 7 days deep, so lateness is invisible.

## Known limits

- **Voice can't check things off.** Google shut down Conversational Actions in
  June 2023, so "Hey Google, tap my anchor" cannot be built on any Google
  speaker. The speaker is a read-only window onto the rhythm; tapping stays in
  the dashboard.
- **One-way by design.** If you edit or delete a FLOWSTATE block inside Google
  Calendar, the next sync puts it back. `schedule.json` is the source of truth.
  Add your real appointments as normal events — the sync never touches events
  it didn't create (they're tagged `source: flowstate-rhythm`).
