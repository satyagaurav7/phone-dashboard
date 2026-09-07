# FLOWSTATE: Day board optimization review and implementation proposal

Date: 2026-09-07
Reviewed checkout: phone-dashboard, main, 42f32a2; working tree clean at review start.
Status: planning and source review only. No runtime changes, Google writes, automation activation or deployment.

## Executive recommendation

Make the Day board the single execution surface for the day: what matters, what to do now, what starts next, what is running in the background, and what can wait. Optimize for meaningful outcomes within real capacity, not the maximum number of checkmarks or minutes occupied.

The best next release is NOT more tasks. It is one coherent schedule and completion model, truthful sync, and a board that helps recover when reality changes.

Priority order:

1. Fix contradictory timing and historical score behavior.
2. Unite routines and upkeep in one actionable timeline without merging their scoring rules.
3. Protect one chosen meaningful outcome, essential routines, transitions and recovery time.
4. Add safe passive overlap, context batching and explicit replanning.
5. Finish Google Tasks round-trip synchronization before claiming that voice, Tasks and the board share completion.
6. Measure whether the plan actually works for two weeks before expanding or tightening it.

This is a recommended default, not a mathematically proven optimum. Current live commitments and actual task durations have not been measured.

## 1. What Claude added and what to preserve

Reviewed commits from 1906862 through 42f32a2, current code, schedule, shared ledger, original household plan and existing check-in/reward research.

| Current capability | Assessment |
|---|---|
| Expandable routine blocks and direct completion | Keep. This is the right execution interaction. |
| Next routine countdown and focus/scroll restoration | Keep; broaden the next-action source beyond routine blocks. |
| One Get ready item with substeps | Keep the grouped identity; do not turn each hygiene step into a competing scored goal. |
| Home upkeep catalogue and duration labels | Useful foundation, but still a separate full list below the routine board. |
| Laundry active/waiting stages | Keep the distinction; stage sequencing and completion identity need strengthening. |
| Chore cadence and one-open-row presentation | Keep the uncluttered intent; stable occurrence identity is still needed. |
| Chore points | Latest shared record says the user explicitly requested consequences: +3 on-time, +1 late, -5 per outstanding chore/day. Preserve pending a separately approved change. |
| Beeminder isolation | Chores affect balance/tier, not evaluateDay verdict. Preserve this boundary. Reporter remains unarmed in schedule. |
| Read-only audit and marker-based sync planner | Useful groundwork; not a complete connected service. |
| Optional reflections and chosen step | Keep the choice and privacy, but move the chosen action into the execution board instead of another hero section. |

Confirmed in Claude's shared record: in-unit washer and dryer, cleaning responsibility is room only, and Get ready is one parent task. The earlier household plan's bathroom/shared-zone assumptions are superseded. Do not ask those questions again unless the user changes them. Laundry load count, real cycle lengths, collection details, and live appointments remain unverified.

## 2. Findings to fix before optimizing behavior

### P1: The saved schedule can punish following its own instructions

`schedule.json` contains itemTimes, scored blocks, slots and full schedule rows with independently maintained times. `rules.mjs:assertSchedule` checks membership, not whether the preferred time fits its scoring window.

The source audit found seven office-day preferred item times outside their scored windows. Examples:

| Item | Preferred time | Scored window | Conflict |
|---|---|---|---|
| Cook a meal | 19:40 | 20:30-21:45 | Following the timetable logs it before its window. |
| Dinner | 20:10 | 20:30-21:45 | Same conflict. |
| Study | 21:00 | 21:45-22:30 | Same conflict. |
| Money move | 21:00 | 21:45-22:30 | Same conflict; also not an independent hour available. |

Three wind-down item times also precede their windows. Review all seven privately; this is a software timing mismatch, not a recommendation to change medication or care timing. Align the scoring contract to an approved real routine, never tell the user to delay care to earn points.

More semantic issues to review: water is a whole-day volume logger placed in a morning block; whole-day outcome stamps are treated like momentary actions. Separate action, cumulative daily measure and end-of-day confirmation. A numeric health goal or its timing must not be inferred from optimization logic.

Fix: one versioned canonical task schedule with derived board, reminders and reference timetable. Keep preferred execution slots distinct from permitted scoring windows; validate explicit relations and exceptions. Changes apply prospectively so today's edit does not recalculate months of history under new rules.

### P1: Moving a chore rewrites past penalties

Reproduced using the pure chore ledger: a Sunday chore, adopted September 6 and still open on September 9, totals -15 for three completed days. Set `moved` to September 10 and the same history totals 0. `chores.mjs:choreLedger` applies today's single moved date to every historical date.

Moving work should change future placement, not rewrite previous events. Store occurrence-specific rescheduling events with an effective date; preserve earned and assessed history. Any forgiveness must be a separate explicit policy/action. Also test completion after a deferral, because clearing the single moved field can reintroduce charges for previously deferred days.

### P1: Google sync is not merely waiting for consent

`scripts/tasks-sync.mjs:main` reads Google tasks, plans from an empty/preview FLOWSTATE state, and can create tasks behind gates. It does not load authenticated app state, PATCH remote completion, or persist inbound completions. The inbound rows are printed for someone to apply. `retryDecision` is tested separately but is not called by the runner.

It also uses UTC date for today rather than the configured Toronto date. Its inbound completion payload uses the marker's occurrence date, not Google's actual completion timestamp. A September 6 task completed September 8 produces an inbound occurrence of September 6 with no completedAt. That payload cannot distinguish on-time from late completion.

Fix: authenticated state adapter, occurrence links, actual completion and observation timestamps, durable command/outbox, deletion/reopen reconciliation and runtime retry coordination. Consent is necessary, not sufficient. Keep all live-write gates off until the real round trip passes.

### P2: Chores have preferred labels, not conflict-aware schedules

`schedule.json:chores` provides one clock time for all day kinds. Examples: office room reset at 20:30 overlaps the saved 20:30-20:50 reading slot; Friday linen starts at 18:30 during the saved upskill period; kitchen close and gym-bag reset also compete with evening work.

Fix: context cues or day-kind windows plus duration and transition reservations. Show infeasibility instead of quietly squeezing work into occupied time.

### P2: Substeps and stages are not occurrence-scoped

`upkeepBoard` carries unfinished `record.steps` into a new day, with no date on those steps. Reproduced with a daily chore: a stored step remains checked on the next day. Laundry stores only one current stage; selecting a later stage infers earlier stages complete and any stage can be started from the UI.

Fix: occurrence IDs and per-stage explicit state. Carry an unfinished weekly load forward deliberately; never inherit yesterday's daily checklist checks. Provide an explicit correction/jump action rather than inventing earlier stage completion. Repeated clicks must be idempotent; add Undo for accidental completion.

### P2: The central screen is still several competing experiences

`index.html:todayHTML` renders stake, routine board, upkeep, then `midnight.today`, which adds a second large heading, chosen-step panel, Google links, reflection and another activity logger. The focus banner only searches routine windows, not laundry handoffs, real tasks, or the chosen step.

Fix: one Today heading, one next-action model, and shared source-linked completion. Keep the full list accessible, but collapse Done and Later. Move reflection and service links below execution or into their existing destinations.

### P2: Recovery tools disappear when they are most needed

`index.html:draw` forces non-Today tabs back to Today in blackout. As chores now affect the combined tier, neglecting a chore can hide planning and settings even though logging remains possible.

Recommendation requiring approval: never restrict scheduling, help, source access, essential information, or recovery tools. Keep accountability visible; restrict only optional cosmetics if desired. Do not silently reverse the user's chosen scoring policy.

### Documentation and test gaps

Several comments/test names still say chores never score although a separate chore ledger now does. The shared status contains older contradictory snapshots. Preserve historical records but mark current conclusions clearly. Passing tests do not establish these missing behaviors.

## 3. What the Day board should look like

First phone viewport: date/save freshness, chosen meaningful outcome, NOW action with estimated finish, NEXT handoff/commitment with start or leave-by time. No marketing hero and no wall of red failures above the next useful action.

```text
TODAY                         Saved / source freshness
Worth doing: finish one practice exercise

NOW   Start the exercise       25 min   [Start] [Done]
      First step: open the saved worksheet
      Planned finish 14:40

NEXT  Transfer laundry         about 14:55   5 min
BACKGROUND  Washer running     check in 40 min

Remaining plan: 65 active min / 90 available
[Timeline] [Checklist]                     [Adjust day]

14:55  Transfer laundry                     5 min
15:00  Reading                            20 min
16:00  Fold and put away                   25 min
17:00  Weekly planning                    45 min

Later / backlog (collapsed)   Done (collapsed)
Game status and balance (compact, expandable)
Optional reflection
```

Illustrative UI text, not a claim these are today's actual tasks. Two presentations use the same records: Timeline for timing, Checklist for clearing blocks. Tapping Morning shows its tasks directly; tapping a chore shows its steps. Starting an action never marks it completed.

Do not hide mandatory routines, actual deadlines or failed items. Keep them discoverable in the full list and summary; change prominence, not truth. When nothing else fits, NOW can be a break or preparing the next task, not an invented low-value chore.

## 4. Selection and replanning policy

Use transparent deterministic rules first; an AI scheduler is unnecessary for version one.

1. Respect approved fixed commitments, travel, protected sleep, care constraints and user-pinned actions.
2. Surface a ready handoff or real imminent deadline when it needs action. Distinguish a preferred time from a deadline.
3. Continue the user's started focus task unless a stronger constraint actually interrupts it.
4. Offer the chosen meaningful action that fits available time, context and energy.
5. Batch a due maintenance task in the appropriate location/context.
6. Offer optional backlog only if slack remains. Leave deliberate slack; do not continuously fill the day.

Estimate earliest finish = now + remaining active effort + transitions. An action fits only if it can finish before the next incompatible reservation, unless it is explicitly interruptible with a saved restart step.

When 15 minutes behind, a machine overruns, or a real event changes, offer a small preview: what stays, what moves, and why. User confirms before writing preferred slots. Do not move fixed events, hard deadlines or scoring windows automatically. Cap replan churn: once a session starts, freeze it unless the user or a real constraint changes it.

### Capacity modes

- Usual: one meaningful outcome, existing required routines, and due upkeep that fits.
- Low: same honest obligations, smaller discretionary session, nonurgent upkeep offered for rescheduling. This does not excuse scored requirements automatically.
- Plenty: optional second outcome or backlog only after the first; not an automatic increase in requirements.

Capacity choices remain private planning inputs. Do not award points for optimistic answers or infer a diagnosis.

## 5. Meaningful work, not checkbox optimization

Choose one outcome during the existing brief check-in. It must name a result, not an abstract theme: "complete and review one practice exercise" rather than "be productive"; "submit one prepared application" rather than "money move". The user chooses the actual task; do not infer a personal deadline or project.

Each focus task has a smallest start, a concrete done condition, an effort estimate and an optional next-session breadcrumb. Preserve progress if a session ends unfinished. A timer ending earns no completion.

Separate three visible summaries: meaningful outcome progress, routine completion, and home upkeep. Game score is a fourth measure, not proof of a good or wasted day. Do not promote easy chores ahead of worthwhile work solely because they are overdue or generate points.

Suggested weekly planning experiment: keep the full checklist, but offer user-approved focus emphasis by day rather than assuming every skill goal needs a separate hour daily. Shorter sessions or alternating deep-focus topics change existing obligations only after approval; until then flag overload honestly.

## 6. Overlap that actually helps

| Pair | Decision | Scheduling condition |
|---|---|---|
| Washer/dryer + reading/study | Good passive overlap | At home, able to attend handoff; stop before handoff or allow a short interruption. |
| Washer + room cleaning | Good passive overlap | One active cleaning task, one machine; account for transfer. |
| Folding + enjoyable audio | Optional | Simple physical action; audio is not automatically credited as deliberate language study. |
| Cooking + kitchen reset | Conditional | Only safe brief steps compatible with supervision; no deep-work reservation during active cooking. |
| Dinner + weekly admin | Avoid as default | Preserve eating/rest and avoid making every minute another obligation. |
| Study + messages/admin | Avoid | Batch admin separately to reduce switching. |
| Driving + phone task use | Never schedule | Driving is occupied time; no app interaction or required learning task while driving. |
| Two laundry loads | Conditional | Model washer and dryer as separate resources; next load can wash while first dries, with explicit transfers. |

Do not count passive wait as personal effort or subtract it from daily capacity twice. Do count machine occupancy, leaving-home constraints, and transition cost. No unattended-appliance assumptions contrary to equipment or building guidance.

## 7. Proposed schedule adjustments

All examples use Toronto time and repository commitments as placeholders. No medical timing changes. Do not publish these until actual schedule and durations are approved.

### Office days: reduce decisions, not sleep

- Keep work, driving and gym as existing commitments pending confirmation; add missing travel/change/shower buffers where measured.
- Keep the saved dinner period, then kitchen close immediately after eating instead of a universal 20:45 alarm. Example: 20:30-20:42 cleanup, 20:42-20:47 transition, 20:47-21:07 language practice, 21:07-21:12 transition, 21:12-21:52 focus work.
- Example 21:52-22:11: room reset 8 minutes + tomorrow ready 7 + gym kit 4, ideally handling gym kit earlier on arriving home. Preserve subsequent wind-down; verify remaining care/prep fits rather than assuming this is the entire evening.
- This is a candidate replacement for conflicting evening placement, not extra tasks stacked onto existing reading/study. Existing score windows would need separately approved alignment.
- Put office-day prep into one checklist with linked substeps. Do not double-book "prep tomorrow" and "Tomorrow ready" as separate seven/thirty-minute obligations.

### WFH: use the post-dinner gap; do not spend work hours

- Preserve paid work and the established exercise/cooking periods.
- Put kitchen close after dinner, then a transition. Wednesday can stay light; Thursday room clean is one 35-minute session, followed by at most a short digital triage if there is room.
- The physical desk clear belongs to room clean; do not repeat it in digital reset. Digital reset means only actionable filing/messages, not unbounded inbox clearing.
- Friday linen currently starts during focus work. Candidate: 19:55-20:03 load, wash to 21:03, transfer to 21:08, dry to 22:08, remake/put away to 22:25. This leaves almost no buffer before the saved 22:30 bedtime and overlaps wind-down: reject this candidate as the default, rather than pretend it is optimized. Move linen to a measured weekend machine session or another genuinely free window.

### Saturday: account for the existing contradictions

- Groceries includes unpacking, and meal prep includes portioning and cleanup. If those do not fit the existing allowances, extend or reduce scope; never count cleanup twice.
- Saved meal prep is 13:00-14:30 while the routine deep-work window is 14:00-15:00. Do not schedule independent focused study during hands-on cooking. Resolve placement with user approval and preserve gym travel.
- Leave the free/social block free by default. A one-time room recovery session replaces optional time explicitly, never appears as another permanent weekly chore.

### Sunday: laundry as a background sequence

| Time | Active action | Passive/resource state |
|---|---|---|
| 13:45-13:55 | Sort/load clothes | Washer starts after loading |
| 13:55-14:45 | Optional chosen focus, maximum 45 minutes + 5 transition | Washer runs; stay able to attend |
| 14:45-14:55 | Buffer or rest | Check actual remaining cycle time |
| 14:55-15:00 | Transfer | Dryer starts after transfer |
| 15:00-15:20 | Existing reading | Dryer runs |
| 15:20-16:00 | Flexible time | No new full focus hour assumed |
| 16:00-16:25 | Fold/hang/put away | Load complete only after confirmation |
| 16:25-17:00 | Buffer / optional activity | Protect weekly plan at 17:00 |
| 17:00-17:45 | Existing weekly plan, including admin | No second overlapping admin block |

This displaces the saved 16:00 study start; offer the earlier focus window as a replacement only if approved, not an additional session. A second linen load needs measured washer/dryer transfer choreography; do not mark two loads feasible from this one-load table.

### Monthly and as-needed work

Rotate car, wardrobe and personal admin across different weekends, replacing some optional upkeep. Do not make all three due on adoption day. Waste follows actual collection/condition; gym kit reset follows actual use, not a fabricated daily requirement on a rest day. Any change to penalized cadence requires approval and a prospective effective date.

## 8. Less obvious improvements worth testing

1. Exit station: physically group bag, keys and tomorrow's items. In-app "Ready to leave" becomes a short existing prep checklist, not a new scored task.
2. Restart breadcrumb: when pausing focus, record "next: question 4" or the next concrete action. Resume without choosing the whole task again.
3. Fit this gap: a 10-minute opening offers at most two context-appropriate options or rest. Never turn every spare moment into work.
4. Dependency-first prompts: "clean kit needed tomorrow" can promote laundry preparation before it becomes a crisis. Use user-declared needs, not guessed inventory.
5. Friction report: weekly show the one repeated obstacle, such as cleanup exceeding its allowance. Recommend a smaller batch, simpler setup or different placement rather than another reminder.
6. Rescue the next hour: after a miss, show one feasible next action and what can still be done. Preserve the failed game verdict honestly without presenting the whole remaining day as pointless.
7. Closing condition: "Today's chosen outcome done; necessary remaining tasks: two". Allow a clear stopping point even if optional backlog remains.
8. Location bundles: kitchen close while already in the kitchen, bag reset on arrival, stock check before the grocery list. Cue-based suggestions reduce needless separate clock alarms.
9. Measure estimates without a stopwatch burden: optional "shorter / about right / longer" after a task; ask for exact time only when useful. Do not collect constant behavioral telemetry.
10. No new subsystem by default: use existing task records and explicit metadata. Avoid chatbot scheduling, inferred mood scoring, automatic medical optimization, or a second task app.

## 9. Accountability without disabling recovery

Keep the user's chosen penalties until they approve a policy change. Fix ledger correctness independently of policy. Make per-chore consequences inspectable and distinguish overdue maintenance from the routine verdict and any real-money stake.

Recommended alternative to evaluate, not implement silently: capped household exposure per day or a bounded recovery policy, while keeping original events auditable. A four-daily-chore miss produces -20 per elapsed day before weekly jobs and routine penalties; three days alone can cross the -50 blackout boundary. This arithmetic does not establish that the penalty motivates effectively.

Do not let point optimization decide the next action. Planning, settings, source links, sleep/care information and recovery must remain available regardless of balance. Keep money stakes unarmed during timing/sync changes; externally observed completion time must never be invented to determine an on-time verdict.

## 10. Technical design and sync boundary

Prefer a small pure `day-plan.mjs` module following existing rules/chores module patterns, rather than embedding another scheduler in index.html. No new framework or optimization solver unless later constraints justify one.

Inputs: canonical schedule version, date/timezone, confirmed routine status, chore occurrences/stages, chosen outcome, user-pinned slots, optional verified Calendar busy intervals, and context preferences.

Outputs: ordered active intervals, passive/resource intervals, unscheduled tasks with reasons, conflicts, active-minutes remaining, next action, next handoff, and provenance/freshness. No side effects.

Task model needs type (action/cumulative/outcome), duration range, context, attention demand, dependencies, interruptibility, due date, true deadline if explicitly supplied, preferred window, scoring policy/version and source link. Keep observedAt separate from reported completedAt; missing actual time is unknown, not proof of lateness or timeliness.

Use one occurrence ID in every presentation and command. Shared completion handlers prevent board/activity/Google projections from diverging. Preserve existing Get ready parent behavior. Repeated offline commands must not duplicate completion or rewards.

Google Tasks remains authoritative for linked task identity and status. FLOWSTATE owns execution timing metadata; Google Calendar owns fixed events. Until migration is explicitly approved and verified, current local routine logs remain labeled local rather than pretending all existing dots are synced.

Google's public task resource does not expose scheduled time or a recurrence-rule field. Do not create fake timed Tasks alerts or restore routine Calendar publishing. Native recurring-series mapping needs real rollover tests; the CLI marker-based chore generator is not a substitute for that proof. [Official Task resource](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).

Runtime sync requires authenticated private storage and a server boundary; Pages cannot hold long-lived secrets. No credential inspection is required for this review. Complete real state loading, outgoing completion/reopen, incoming timestamp-aware application, deleted-task handling, durable retries and concurrency before enabling creation. Confirm single-task round trips before bulk changes. Never put private task titles/IDs/state previews into the public schedule file or CI logs.

## 11. Implementation order and acceptance gates

| Phase | Work | Acceptance gate |
|---|---|---|
| A: correctness | Canonical timing audit, occurrence identity, immutable scoring history, actual completion timestamps | Reproduction tests fail before fixes, then pass; no silent historical rescore. |
| B: unified board | One Today heading, Now/Next/Background, shared Checklist/Timeline, chosen outcome, compact status | Same item completes once from either view; no hidden obligations or overlapping mobile text. |
| C: feasible planner | Context/duration/dependency constraints, passive resources, leave-by buffers, confirmed replan preview | No double-booked active minutes; rejected placements explain why; sleep/real commitments unchanged. |
| D: sync prototype | Authenticated adapter/outbox, one approved task both ways, stale/offline/conflict states | Real Google completion and reopen reach the board and back without date fabrication. |
| E: pilot | Limited household recurrence and notification handoffs after approval | Two-week review shows workable durations, no duplicates and acceptable reminder burden. |

Do not treat phase D as only OAuth setup. Existing test coverage is necessary but incomplete.

New tests must cover:

- All day kinds: preferred times, required durations, buffers, conflicts and schedule/scoring exceptions.
- Toronto midnight and DST across browser, planner, CLI and notification paths.
- Move today preserves past charges; approved forgiveness is separately recorded; clearing a move does not rewrite history.
- Daily partial steps reset by occurrence; unfinished weekly load persists intentionally; stages cannot fabricate earlier work.
- Late Google completion retains occurrence date AND actual completion date; recurrence rollover, deletion, rename, reopen and offline conflict.
- Historical scores use their original schedule/policy version.
- Reminder handoffs dedupe, respect quiet hours and show missing permission/staleness. Browser timers are not proof of background phone notification delivery.
- Next action considers chores, pinned focus, running stages and verified fixed commitments, not only routine windows.
- 320/375/430/mobile and desktop: keyboard focus, scroll stability, direct completion, failed/offline states and accessible full-list navigation.
- Blackout never prevents approved recovery/planning access after that policy change is authorized.
- Core verdict and Beeminder payload remain unchanged unless separately approved.

## 12. Evidence, uncertainty and evaluation

Fresh verification in this review:

- `node --test tests/*.test.mjs`: 75 passed, 0 failed.
- `node --test tests/midnight.test.cjs`: 17 passed, 0 failed.
- `node scripts/build-site.mjs --out _site`: succeeded, 15 manifest entries.
- Read-only schedule audit: seven office preferred times outside scored windows.
- Synthetic pure-function probes reproduced historical penalty erasure on move, daily partial-step carryover, and inbound completion metadata lacking actual completion time.

No signed-in app/browser visual QA, live Google audit, physical device/speaker test, deployment check, or personal calendar audit was performed in this review. Do not infer production readiness from the test totals.

Pilot measures: chosen outcome progress, plan versus actual effort, number of task switches/replans, unplanned spillover into protected time, unresolved source-sync errors, and the user's brief weekly judgment of burden. Track only with consent. Do not optimize app opens, dots clicked or punitive score growth.

Suggested success thresholds are product defaults for review, not research-derived: no scheduling conflicts left unexplained; no duplicated completions; no task-data loss; normal app planning takes under a couple of minutes; the user can identify the next useful action without scrolling through the entire day. Recalibrate duration estimates before adding more chores.

Research informs the direction, not exact time slots. Task-switching research supports avoiding simultaneous attention-heavy work; cue/action planning supports concrete starts. Neither proves this app, these penalties, or a particular 25-minute session is optimal. Sources checked September 7, 2026:

- [APA: multitasking and switching costs](https://www.apa.org/topics/research/multitasking).
- [NCI: implementation intentions](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions).
- [Google Tasks task resource](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).
- Existing project evidence audit: `DAILY-CHECKINS-AND-REWARDS.md` (retain its explicit research limitations).

## 13. Decisions for approval and handoff

Recommended approval bundle: correctness fixes, a unified Day board, and a fixture-backed feasible planner. Review score-window changes, any penalty cap, blackout navigation policy, reduced/alternating discretionary goals, external writes, and recurring notifications separately.

Next implementing agent: read CLAUDE.md and the shared integration ledger, check current HEAD/ownership, add regression tests for the concrete correctness findings, and propose the canonical schedule mapping before touching live timing or source tasks. Keep this review file as the rationale and record implementation evidence in the shared ledger.

The guiding question is: "What is the most useful thing I can realistically finish next, while keeping the rest of my day workable?" The Day board should answer that, let the user act, and remain useful after an imperfect morning.
