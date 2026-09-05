# Google Calendar + Home Max — one-time setup (your part)

Most of this is already done. **Only step 3 is left** — creating the service
account key and pasting it into GitHub. Everything runs server-side in GitHub
Actions: no browser, no phone, no extension.

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

## 1. Service account  —  DONE

Created 2026-09-04 in Cloud project **Data Collection** (`data-collection-399923`):

- **Google Calendar API** (`calendar-json.googleapis.com`) — already enabled.
- **Service account:** `flowstate-calendar@data-collection-399923.iam.gserviceaccount.com`

## 2. Share the calendar  —  DONE

`booms.satya@gmail.com`'s primary calendar ("Satya Gaurav", Toronto time) is
shared with the service account at **Make changes and see all event details**.

> **The target calendar is named explicitly, and must be.** A service account's
> `primary` is its *own* empty calendar — writing there succeeds, reports
> success, and shows nothing on your phone or speaker. `calendarId` in
> `schedule.json` is set to `booms.satya@gmail.com` for this reason. The
> `CALENDAR_ID` repo variable overrides it if you ever move calendars.

> **Why the primary calendar and not a separate "FLOWSTATE" one?** Assistant
> reads primary reliably and secondary calendars inconsistently. A separate
> calendar is the nicer design but risks the speaker silently ignoring it.

## 3. The key  —  YOURS TO DO

This is the one step that can't be done for you: it produces a private key, and
handing that around is exactly what you don't want anyone doing on your behalf.

1. [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=data-collection-399923)
   → click **flowstate-calendar** → **Keys** tab.
2. **Add key → Create new key → JSON → Create.** A file downloads.
3. GitHub → `satyagaurav7/phone-dashboard` → **Settings → Secrets and variables
   → Actions → New repository secret**.
   Name it exactly `GOOGLE_CALENDAR_SERVICE_ACCOUNT`, and paste the **entire**
   contents of that JSON file as the value.
4. **Delete the downloaded file.** It's a standing key to that service account.

## 4. Test it

1. GitHub → **Actions → Calendar sync → Run workflow** → days `7`,
   dry run ✅ → **Run**. The log should list 7 days and ~110 blocks without
   touching anything.
2. Run it again with dry run ❌. The log should end with
   `Created 110, updated 0, failed 0.`
3. Open Google Calendar. Today should show your day-kind's blocks, all marked
   **free** (they won't make you look busy) and with **no reminders** — the
   dashboard's own push notifications still do all the nudging.

## 5. Confirm the Home Max actually speaks it

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
