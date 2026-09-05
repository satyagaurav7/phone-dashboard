# Reminder channel audit

**P0.4 of [CHECKINS-IMPLEMENTATION-PLAN.md](CHECKINS-IMPLEMENTATION-PLAN.md).**
Audited 2026-09-05. Acceptance test A19.

Five things can put a notification in front of Satya. They are separate systems
and none of them knows what the others sent. This enumerates each one, states
how its status was established, and says plainly what is still unknown.

> **"Automation is paused" is false and should stop being said.** One publisher
> is paused. The push sender still has ten active cron triggers.

## Summary

| # | Channel | State | Verified how |
| --- | --- | --- | --- |
| 1 | FLOWSTATE push (`notify.yml`) | **ACTIVE — up to 5/day** | Repo inspection |
| 2 | Calendar/Tasks publisher (`calendar.yml`) | **Paused**, and its events are gone | Repo inspection + Calendar UI |
| 3 | Google Tasks (22 daily items) | **Present; alert behaviour unknown** | Calendar UI |
| 4 | Google Home routines | **Unknown** | Not inspected |
| 5 | ChatGPT-side automations | **Unknown** | Not inspected |

## 1. FLOWSTATE push — ACTIVE

`.github/workflows/notify.yml` has **ten cron entries** (five DST pairs), all
live. `scripts/notify.mjs` runs `--mode=auto` and picks what is due, deduped per
day through `notifyLog`. Ceiling is **five pushes per day**:

| Push | Toronto window | Dedupe key |
| --- | --- | --- |
| Morning brief | 07:00–09:59 | `brief` |
| Midday nudge | slot −25 / +110 min | `nudge0` |
| Afternoon nudge | slot −25 / +110 min | `nudge1` |
| Evening nudge | slot −25 / +110 min | `nudge2` |
| Anchor reminder | 21:00–23:59 | `streak` |

Only `notify.yml` receives a credential (`FIREBASE_SERVICE_ACCOUNT`).

**The overlap that matters.** The nudge slots in `schedule.json` cover
`cookmeal`, `lunch`, `water`, `insulin`, `read5`, `study`, `money`, `dinner`,
`meditate`, `creatine`, `smokefree`, `phonedown`. Google Tasks now carries daily
items for the same actions — "Eat lunch + take meal bolus", "Drink 700 ml water",
"CELPIP reading", "Meditate / breathwork", "Take night minerals". **Both systems
are reminding him about the same things, and neither can see the other's
completions.** Worse, `notify.mjs` reads dashboard flags only, so a task
completed by voice leaves the FLOWSTATE nudge still listing it as open.

Since [CLAUDE.md](CLAUDE.md) makes Google Tasks the source of truth for actions,
the three tap-window nudges are the duplicate layer, not Tasks.

## 2. Calendar/Tasks publisher — paused, events removed

`.github/workflows/calendar.yml`: `workflow_dispatch` only, no `schedule:`, both
steps carry `--dry-run`, and **no `secrets.` reference at all** — it has no
credential to write with even if invoked.

The 110 timed FLOWSTATE blocks that were published on 2026-09-04 are **gone**.
Calendar UI on 2026-09-07 and 2026-09-09 shows only `Job` (09:00–17:00) and
`IELTS Class` (21:00–22:00) as timed events. Eight of those deleted blocks
carried popup reminders, so that channel is closed — but only because the events
were removed, not because the workflow was paused. Re-running the publisher with
credentials would recreate them, reminders included.

## 3. Google Tasks — present, alert behaviour unverified

Observed on the Calendar all-day row for both 2026-09-07 and 2026-09-09: **24
all-day task entries**, of which 22 are the daily routine and **two are
`(No title)`**.

Those two blank rows are exactly the "setup artifacts or blank draft rows" that
CLAUDE.md's acceptance checks say must not be there. They are recurring daily.
**Worth deleting** — a blank task cannot be acted on and may still notify.

Dated one-offs also appear: `Doctor's appointment` and `Doctor's appointment
topics`, both 2026-09-09 10:45. That is inside the `Job` block, and nothing in
the dashboard knows about it.

**Unknown, and only measurable on the phone:** Google documents that untimed
tasks can raise a notification at 09:00 on Android. Whether that fires once, or
once per task across 22 items, is not established. Do not assume per-list muting
exists.

## 4. Google Home routines — unknown

CLAUDE.md records a saved `Focus time` routine (25-minute named timer), and
Personal `Good morning` / `Bedtime` routines that the Home **web** UI cannot
edit. None of this was inspected here. A routine that reads tasks aloud is a
sixth surface for the same content.

## 5. ChatGPT-side automations — unknown

ChatGPT built the 26-item Tasks routine and was observed reading a Google Home
automation inventory. Whether it also scheduled anything recurring is not known.
It cannot be determined from this repository.

## What only Satya can measure — A19

Run these together, not separately. The point is the **total** count.

1. **Count one full day.** Note every notification and its source: FLOWSTATE
   push, Google Tasks, Home speaker. Expected FLOWSTATE contribution is up to 5.
2. **Check the 09:00 Tasks behaviour.** One notification, or 22? This decides
   whether Tasks alerts are usable at all.
3. **Delete the two `(No title)` tasks.**
4. **Confirm the IELTS block.** CELPIP is the real exam per 2026-09-04; that
   recurring 21:00 event is likely stale.
5. **Open the Home app** and list any routine that speaks tasks or calendar.

## Recommendation

**Turn off the three FLOWSTATE tap-window nudges** (`nudge0`–`nudge2`), keeping
the morning brief and the evening anchor reminder. They duplicate Google Tasks
on the same actions, they cannot see voice completions, and they are the layer
CLAUDE.md designates as *not* the source of truth. That takes the FLOWSTATE
ceiling from five pushes a day to two, before Tasks alerts are even counted.

This is a recommendation, not a change. `notify.yml` is untouched.
