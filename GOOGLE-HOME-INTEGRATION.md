# Google Home integration status

This is the repository-safe operating summary. See `CLAUDE.md` for engineering
rules and acceptance tests.

## Source-of-truth model

| Information | System of record | Voice use |
| --- | --- | --- |
| Flexible daily and weekly actions | Google Tasks | Ask, add, complete, reschedule |
| Timed commitments | Google Calendar | Ask about agenda; create timed events |
| Dashboard check-ins | FLOWSTATE/Firestore | App interaction unless a verified bridge exists |
| Focus/cooking countdowns | Google Home timers | Start and inspect by voice |
| Morning/evening orchestration | Personal Google Home routines | Trigger by voice or approved schedule |

Tasks can appear in Calendar's UI without becoming Calendar events. Do not
duplicate them as events merely to make them visible there.

## Configured snapshot

As of 2026-09-05, a live UI audit reported:

- 26 active recurring, untimed routine tasks (22 daily and four weekly);
- flexible FLOWSTATE routine events removed from the audited Calendar horizon;
- fixed work/class events preserved in the audited week;
- a saved `Focus time` routine using a named 25-minute timer;
- automatic GitHub publishing paused and replaced by manual dry-run previews.

These are time-bound observations, not guarantees. The physical voice path is
still awaiting acceptance testing.

## Everyday voice patterns

Exact phrasing may vary with Gemini for Home. Test on the target speaker.

| Goal | Example after “Hey Google…” |
| --- | --- |
| Hear today's actions | “What are my tasks due today?” |
| Capture an action | “Add a task to post the bench ad tomorrow.” |
| Finish an action | “Mark my task to post the bench ad complete.” |
| Move unfinished work | “Move my task to post the bench ad to tomorrow.” |
| Hear appointments | “What's on my calendar tomorrow?” |
| Create a timed commitment | “Add an event tomorrow at 3 PM for my appointment.” |
| Add a grocery item | “Add eggs to my shopping list.” |
| Start focus mode | “Focus time.” |
| Start a named timer | “Set a 20-minute timer called rice.” |
| Check timers | “How much time is left on my rice timer?” |
| Set an alarm | “Set an alarm for 6:30 tomorrow morning.” |
| Find the phone | “Find my phone.” |

Before relying on personal information by voice, confirm the correct Google
account, Voice Match, Personal Results, the selected task/list providers, and
speaker notification settings in the Google Home mobile app.

## Recommended daily flow

1. Morning: ask for today's tasks, then today's Calendar commitments.
2. During the day: capture new actions immediately as Tasks; give them a date,
   but only give them a time when the timing is real.
3. For focused work: trigger `Focus time` or a named timer.
4. When an action is done: complete the existing task instead of creating a new
   record.
5. Evening: review unfinished tasks, deliberately reschedule what remains, and
   check tomorrow's Calendar.

Keep morning and evening briefings short even though the underlying checklist is
intentionally complete. A summary must not silently hide, delete, or deprioritize
tasks.

## Repository behavior

`.github/workflows/calendar.yml` is intentionally manual and preview-only. The
scripts remain for inspection and potential future redesign, but the workflow
must not be changed back to scheduled writes without explicit approval.

The historical setup documents describe an older architecture that generated
routine Calendar events and a smaller task list. Their write instructions are
deprecated.
