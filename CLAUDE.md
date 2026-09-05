# FLOWSTATE repository guidance

Read this file before changing the application, schedules, Google integrations,
or GitHub Actions.

## Daily check-ins and rewards research

Read [DAILY-CHECKINS-AND-REWARDS.md](DAILY-CHECKINS-AND-REWARDS.md) for the
2026-09-05 evidence-backed proposal and source audit. It is a proposal, not an
implemented feature or authorization to change live Google data. For future
reward work, use it instead of the unsupported dopamine claims, rest gates,
random payouts, and punitive day-rejection guidance in historical product plans.
Preserve the full routine checklist, separate private reflection from task
completion, and verify the Google Tasks bridge before awarding voice-based credit.
The Calendar/Tasks publisher is paused; the separate notification workflow still
contains scheduled triggers. Do not claim all automation is paused.

## Product intent

FLOWSTATE is Satya's personal dashboard. Google Home with Gemini is the voice
interface for the daily system, but Google Tasks and Google Calendar have
different jobs:

- **Google Tasks** is the source of truth for actions and flexible routines that
  need to be completed on a particular day.
- **Google Calendar** is reserved for commitments with a real start time, such
  as work, classes, and appointments.
- **FLOWSTATE** may present or eventually synchronize this information, but it
  must not create a second competing task system.
- **Google Home/Gemini** should answer task questions from Google Tasks. Calendar
  briefings are for scheduled events and must not be treated as a to-do list.

Do not reintroduce bus-commute assumptions. The user currently drives. Do not
invent office days, medication timing, or appointment details.

## Current production state (2026-09-05)

The following state was established outside this repository through Google's
authenticated interfaces:

- A dedicated Google Tasks list contains 26 active, untimed recurring items:
  22 daily routines and four weekly routines.
- The full checklist intentionally includes health, meals, hydration,
  supplements, exercise, study, preparation, and bedtime. The user explicitly
  chose this over a shortened 5–7 item list.
- Flexible routine blocks were removed from Google Calendar. A bounded audit of
  the relevant week found only fixed work and class commitments.
- A `Focus time` Google Home routine exists and is configured to start a named
  25-minute timer.
- The old automatic FLOWSTATE Calendar/Tasks publisher is paused. Commit
  `aa146d9` converted `.github/workflows/calendar.yml` to manual, dry-run-only
  previews and removed Google write credentials from the job.

This repository cannot prove live Google state. Treat the statements above as a
handoff snapshot, then verify through authorized interfaces before claiming
anything is still present or working.

## Non-negotiable safety rules

1. Do not enable scheduled or write-mode Calendar/Tasks publishing unless Satya
   explicitly asks for it after reviewing the consequences.
2. Never restore generated routine blocks to Calendar. They were deliberately
   moved to Tasks to prevent a cluttered agenda.
3. Never delete, complete, reschedule, or rename personal Google records based
   only on repository data.
4. Preserve fixed commitments and appointments during any cleanup. Search and
   enumerate exact targets before deletion, then verify afterward.
5. Do not commit account addresses, OAuth tokens, service-account keys, private
   task contents, health details, event IDs, or rollback identifiers.
6. Medication-related labels are checklists, not medical instructions. Never
   infer that an untimed task means a medication can be taken at any time.
7. Do not claim end-to-end success until the physical speaker tests pass.

## Known gaps and risks

- Voice retrieval and completion across multiple Google Tasks lists have not
  been validated on the physical speaker.
- Voice Match, Personal Results, phone notifications, and the exact task service
  selected in the Google Home mobile app are not verified.
- Google Home's web UI cannot edit the existing Personal `Good morning` and
  `Bedtime` routines; those changes require the mobile Home app.
- Untimed Google Tasks may still produce a default morning notification.
- Recurring-task rollover after a missed or completed day needs real-world
  validation.
- A fixed appointment previously discussed was not visible in the bounded
  Calendar audit. Do not reconstruct it from memory; confirm the official date
  and time first.
- The full 22-item daily list may be cumbersome when spoken aloud. Preserve the
  user's full checklist, but test whether Gemini can give a useful concise
  briefing without changing or hiding the underlying tasks.
- `TASKS-SETUP.md` and `CALENDAR-SETUP.md` document the retired publisher. They
  are retained as implementation history, not current operating instructions.

## Acceptance tests

Do not call the integration complete until these checks are recorded with their
actual results:

### Repository checks

- `.github/workflows/calendar.yml` has no schedule trigger.
- Both preview commands include `--dry-run`.
- The workflow passes no Google secrets to either preview step.
- A dry run performs no external writes.

### Google Tasks checks

- The intended Google account is selected in Tasks and Google Home.
- The dedicated routine list contains 26 active recurring tasks, not setup
  artifacts or blank draft rows.
- Twenty-two tasks repeat daily and four use their intended weekly days.
- Tasks have dates but no unintended times.
- Completing one recurring test item produces the next correct occurrence
  without duplicating the current one.
- Leaving one safe test item unfinished overnight has understood behavior and
  does not create uncontrolled duplicates.
- Phone notification behavior is acceptable.

### Calendar checks

- A search for generated FLOWSTATE routine events over the intended horizon
  returns zero.
- Fixed commitments and confirmed appointments remain present.
- No automated job can recreate deleted routine events.

### Physical Google Home checks

Run these with the user's speaker and record the exact response:

1. "Hey Google, what are my tasks due today?"
2. "Hey Google, add a task to test voice capture tomorrow."
3. "Hey Google, mark my task to test voice capture complete."
4. "Hey Google, what's on my calendar tomorrow?"
5. "Hey Google, focus time."

Confirm that task questions return Tasks rather than Calendar, mutations appear
in the Tasks app, Calendar returns only timed commitments, and the timer starts
on the intended speaker.

## Design direction

If FLOWSTATE gains Google integration, prefer a bidirectional adapter around
stable external IDs rather than regenerating records from `schedule.json`.
Separate these concepts in the data model:

- task: title, date, recurrence, completion, Google task/list IDs;
- event: title, start/end, Calendar event/calendar IDs;
- habit/check-in: local behavioral record, optionally linked to a task;
- routine: voice automation metadata, not a Calendar event.

Sync must be idempotent, preserve user edits, log conflicts, and default to a
preview mode. Never purge overdue or completed personal tasks automatically.

## Useful voice interaction model

- Tasks: capture, list, complete, or reschedule flexible actions.
- Calendar: ask about appointments or deliberately add a timed event.
- Lists/notes: use the user's selected Google list provider for groceries and
  non-action reference material; do not assume Google Keep is configured.
- Timers/alarms: cooking, medication timing reminders when explicitly requested,
  and focus sessions.
- Personal routines: short morning and evening briefings that combine tasks and
  Calendar without duplicating their records.

When implementing or reporting changes, distinguish four states explicitly:
**proposed**, **configured**, **verified in UI/API**, and **verified on the
physical speaker**.
