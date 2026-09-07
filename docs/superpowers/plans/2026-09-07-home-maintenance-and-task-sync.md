# Home maintenance, timed tasks, and Day board integration

Date: 2026-09-07
Status: proposed plan for review and implementation handoff; not implemented.
Scope: household upkeep, room control, recurring microtasks, realistic scheduling, and Google Tasks integration.

## 1. Outcome and boundaries

Make it obvious what needs doing, when to start, how long it takes, and what counts as finished. The Day board should be the place to work through tasks, not just inspect dots.

- Preserve existing routines; do not silently add household chores to mandatory blocks or money stakes.
- Google Tasks remains authoritative for task identity, title, due date, and completion. FLOWSTATE adds scheduling and presentation metadata, not an independent competing checklist.
- Calendar remains for fixed commitments. Do not publish cleaning or laundry as Calendar events.
- This document authorizes no Google writes, new automation, account connection, medical schedule changes, or deployment. The existing publisher stays paused/dry-run.
- Claude can implement the UI separately. Coordinate against the shared status ledger before touching overlapping code.
- Times and frequencies below are proposed starting allowances, not claims about the user's home or measured task durations.

## 2. Information to confirm before activating

Do not block fixture implementation on these questions; do block live scheduling that depends on them.

1. In-home, shared-building, or laundromat machines? Separate dryer or air-drying? Loads per week and actual cycle lengths?
2. Room only, or responsibility for bathroom/kitchen/common areas too? Shared chore ownership?
3. Rubbish/recycling collection day, building rules, and travel/access time?
4. Do the repository's office/WFH days and weekend commitments still match reality?
5. Which existing Google Tasks list should contain new chores, and which chores already exist there?
6. Quiet hours, machine availability, cleaning equipment, and tasks the user does not own?

Do not assume that the user's general agreement answered the laundry setup question.

## 3. Scheduling rules

- Store active effort separately from machine/waiting time and travel/access time.
- Include setup, cleanup, putting away, and transitions. A washed pile is not completed laundry.
- Use flexible start windows for chores, actual deadlines only for real constraints such as collection or returns.
- No cleaning during paid work by default, even on WFH days.
- Protect Monday/Tuesday evenings from extra chore blocks; the current repository schedule is already dense.
- Start with one focused maintenance session per selected weekday. Preserve unscheduled time.
- Allow a 5-10 minute transition between unrelated active tasks. Never assign two active tasks to the same minutes.
- Machine waiting can overlap a home activity, but transfer reminders must remain reachable. Do not assume appliances can be left running while away; follow equipment/building guidance.
- When a task exceeds its allowance, offer finish now or move the remaining work. Do not silently consume the next commitment.
- Record optional actual durations for two weeks, then revise estimates with user review. Do not automatically shorten time windows.

## 4. Recurring task catalogue

Durations are active minutes unless a waiting interval is explicitly shown. These are suggested cadences, adjusted for use and household ownership. Small steps belong inside grouped checklists, not dozens of separate daily notifications.

| Group | Checklist / completion definition | Cadence | Active allowance | Placement |
|---|---|---|---:|---|
| Room reset | Rubbish in bin, dishes returned, clothes in hamper/hung, floor path and usable desk clear | Daily | 7-10 | Evening, alongside existing prep |
| Kitchen close | Food put away, dishes washed/loaded, sink/counter/stove wiped, supplies returned | Daily after cooking | 10-15 | After final meal; count existing cleanup first |
| Tomorrow ready | Pack lunch/bag, choose clothes, ready clean bottle, charge needed devices | Daily as needed | 5-10 | Inside existing tomorrow-prep time |
| Gym bag reset | Remove used clothes/containers, ready clean kit | After use | 3-5 | Attach to arriving home, not another alarm |
| Bathroom | Toilet, sink, mirror, shower surfaces, bin and hand towel | Weekly starter cadence | 25-35 | Wednesday evening |
| Room clean | Put items away, dust reachable surfaces, vacuum/sweep, spot-mop | Weekly | 30-40 | Thursday evening |
| Clothes laundry | Sort, wash, transfer/dry, fold/hang, put away | Weekly initially; load-dependent | 35-45 per load | Sunday afternoon |
| Linen laundry | Strip bed, wash/dry sheets and towels as appropriate, remake bed, put linen away | Weekly starter cadence | 25-35 per load | Separate reserved session if needed |
| Food/household stock | Check fridge/pantry and detergent, soap, toilet paper, bin bags; make one list | Weekly | 15-20 | Friday evening |
| Groceries | Shop, travel, unpack and store; review existing allocation | Weekly | Existing 90-minute slot, recalibrate | Saturday 10:00 |
| Meal prep closeout | Portion, label where useful, store, wash equipment, reset kitchen | With existing meal prep | Reserve 15-20 inside existing allowance | Saturday; extend plan if not feasible |
| Weekly admin | Review actual deadlines, appointments, bills due, returns and unresolved messages | Weekly | 15-20 | Within existing Sunday planning block |
| Waste/recycling | Empty relevant bins, sort as required, put out; retrieve bins if applicable | Collection-based / when full | 5-10 each stage | Actual collection schedule, not guessed |
| Cleaning rotation | One of fridge shelves, microwave, kitchen bin, high-touch surfaces, neglected corners | One zone weekly | 15-20 | Replace part of weekly cleaning, not stack on top |
| Desk/digital reset | Clear desk, file loose papers, process actionable downloads/mail | Weekly | 10-15 | Included in room/admin blocks |
| Car reset | Remove rubbish, tidy boot, replenish ordinary supplies | Monthly / as needed | 20-30 | Weekend flexible window |
| Wardrobe reset | Put away overflow, identify repairs/donations, check needed clothing | Monthly | 20-30 | Replaces cleaning rotation that week |
| Household maintenance | Appliance cleaning, filters, batteries, safety-device checks | Manufacturer/building interval | Per task; confirm instructions | Date-based maintenance queue |
| Personal admin | Book needed appointments, track document/insurance/subscription renewals | Monthly review; actual deadlines | 15-20 | Existing admin block |
| Restocking essentials | Check remaining routine supplies and make refill/purchase task | Weekly review / lead-time trigger | 5 | Inventory only; no treatment or dosage advice |

Optional categories must stay disabled until applicable: plants, pets, shared-house jobs, outdoor maintenance, and seasonal equipment. Do not invent responsibilities.

## 5. Room-control plan

### One-time baseline reset

Do this before expecting a seven-minute maintenance routine to fix accumulated clutter. Book a separate 60-90 minute session, or split across two days; do not add it to a full cleaning week without replacing other work.

1. Rubbish and dishes: 10 minutes.
2. Clothes into four destinations: hamper, hang, fold, repair/donate: 15 minutes.
3. Clear bed and floor paths; return objects to their usual place: 15 minutes.
4. Restore a usable desk; gather unresolved papers into one review tray: 10 minutes.
5. Dust then vacuum/sweep: 15-20 minutes.
6. Put cleaning supplies away and decide a home for recurring clutter: 5-10 minutes.

Done means a usable bed, desk and walking area, no loose food/dishes, and remaining unresolved items contained in one review tray. Do not make aesthetic perfection the finish line.

### Daily maintenance

One expandable task, "Reset room - 8 min", with rubbish, dishes, clothes, and desk/floor steps. Finishing the timer does not automatically complete the task. A low-capacity option handles rubbish, dishes and a clear path in 3 minutes; record partial work honestly and leave the remainder for a later slot.

## 6. Laundry: staged timing

Illustrative one-load Sunday plan, assuming accessible separate washer and dryer. Replace estimated endpoints with the actual machine display when starting.

| Stage | Example timing | Active / waiting | Done when |
|---|---|---|---|
| Collect, sort, pockets and load | 13:45-13:55 | 10 active | Correct load started |
| Wash | 13:55-14:55 | 60 waiting estimate | Cycle actually complete |
| Transfer and dryer setup | 14:55-15:00 | 5 active | Load transferred; garment care and lint-filter check handled |
| Dry | 15:00-16:00 | 60 waiting estimate | Clothes actually dry; extend if needed |
| Fold/hang and put away | 16:00-16:25 | 25 active | Basket empty and clothes stored |

This proposal uses the existing Sunday reading period only during passive drying. Machine delays can require moving folding; do not collide with the existing 17:00 planning block. The live calendar has not been audited.

- Initial budget: 35-45 active minutes, roughly 2-3 elapsed hours per ordinary load, with equipment-dependent variation.
- Shared machines add access/queue time. Laundromat travel must be explicitly scheduled. Air-drying requires a later dry-check/folding task, not an assumed same-day completion.
- Additional linen load: provisionally Friday evening only if its full cycle fits before wind-down; otherwise offer another weekend window. Do not pretend two loads fit a one-load allowance.
- Notify at start and handoff points, not every minute. A delayed transfer remains one pending action, not duplicate reminders/tasks.
- Never infer completion from a timer ending. Each handoff is acknowledged by the user.

Manufacturer context: Whirlpool describes normal drying around 45 minutes and emphasizes variation by cycle/load. Our larger allowance is a planning buffer, not a guarantee: https://www.whirlpool.com/blog/washers-and-dryers/how-long-does-a-washing-machine-take-to-wash-clothes.html

## 7. Proposed week and capacity check

All times use America/Toronto. These are preferred windows, not changes to the live schedule.

| Day | Preferred maintenance window | Capacity decision |
|---|---|---|
| Monday/Tuesday | Existing evening/prep periods | Daily resets only; audit whether they fit before adding minutes |
| Wednesday | 19:55-20:30 | Bathroom, with setup/cleanup inside allowance |
| Thursday | 19:55-20:35 | Room clean; rotation replaces some scope when needed |
| Friday | 19:50-20:10 | Stock check/list; optional linen session requires a separate capacity check |
| Saturday | Existing groceries and meal-prep blocks | Explicit unpacking/cleanup; protect remainder of day |
| Sunday | 13:45-16:25 with passive intervals | One clothes load, then existing weekly planning at 17:00 |
| Collection eve | Confirm actual date and availability | Waste tasks displace another small chore if necessary |

Capacity estimate before overlap deductions: daily kitchen/room/prep could total 22-35 minutes daily, or about 2.5-4 hours weekly. Main weekly maintenance adds roughly 2.5-3.5 active hours including linen and small reviews, excluding existing grocery/cooking work and machine waits. These are not all new minutes: audit existing prep/cleanup/admin first and remove double counting. If the resulting week is too full, reduce cleaning scope or redistribute ownership; do not steal sleep or silently compress tasks.

## 8. Day board behavior

1. Show a separate "Home upkeep" group containing only due/overdue chores. Do not inject them into scored routine blocks.
2. Show task title, preferred start or flexible window, active duration, and progress. Example: "Laundry - transfer at 14:55 - 5 min".
3. Tapping a task opens named checklist steps; toggles update that same occurrence. Completed rows remain visible but muted until collapsed.
4. Top-of-page shows the current active task and next actionable start/handoff. A waiting machine does not hide an upcoming personal task. Distinguish routine blocks, chores, and verified Calendar commitments.
5. Starting a timed stage records an actual start and calculates an estimated handoff; no auto-completion and no penalty when the estimate is wrong.
6. Provide Complete, Start/pause timer, Move, and Not applicable with clear states. Move changes a preferred slot; it must not secretly change an external hard deadline.
7. When overdue, preserve one outstanding occurrence and offer a new slot. Do not generate seven copies of an unfinished weekly chore.
8. Always distinguish local pending change, syncing, synced, stale and failed. "Synced" requires server acknowledgement, not just a local checkbox update.
9. Day off for the game does not cancel household tasks. Offer a separate reschedule decision.
10. Keep chores out of evaluateDay, signed balance, blackout and Beeminder reporting. A later scoring change needs a separate approved design.

## 9. Is Google Tasks sync viable?

Yes for task records and completion, with important limits. The public API's task due field stores a date, discarding time; it cannot read or write scheduled time. The documented Task resource has no recurrence-rule field. Do not promise native timed recurrence through that API.

Primary reference, checked 2026-09-07: https://developers.google.com/workspace/tasks/reference/rest/v1/tasks

Recommended ownership:

| Data | Authority |
|---|---|
| Task ID, title, notes, date, completion/deletion | Google Tasks |
| Preferred local time/window, active/waiting durations, stage plan, dependencies | Private FLOWSTATE metadata linked to source ID |
| Existing native Google recurrence | Google; preserve it and prove rollover behavior before using it |
| New generated chore recurrence, if approved after prototype | FLOWSTATE template generates ordinary Google Tasks occurrences; no second competing task record |
| Fixed commitments | Google Calendar; optional read-only conflict input with separate permission |

Do not claim the linked FLOWSTATE time creates a native Google notification. Showing a time in a task title/notes is informational only. FLOWSTATE handoff reminders require their own explicitly configured delivery and device test.

## 10. Sync rollout and failure handling

### Phase A: read-only feasibility

- Inspect existing bridge scripts and current Google list through authorized access. Inventory only the selected list; do not broadly copy personal data into the repo.
- Compare proposed chores with existing tasks; present candidate mappings. Titles alone are not identity. Ambiguous matches require review.
- Test ordinary tasks, completed/hidden tasks, deletion, and a native recurring task through completion/rollover. Pagination and completed/hidden query options matter.
- Render an authenticated read-only projection with a last-success timestamp. No live writes in this phase.

### Phase B: one non-recurring test task, after explicit write approval

- Use user OAuth with the minimum necessary scope through a secured backend. Do not place tokens or client secrets in Pages assets, browser localStorage, committed config, or logs.
- Inspect current Firebase authorization rules rather than replace them. Owner-only metadata and command access; server validates task ownership/list allowlist.
- Complete the test task from Day board, acknowledge remote success, and verify in Google Tasks. Complete/reopen externally and verify the board follows it.
- A partial local step is not a completed Google task. For a multi-stage task, mark the Google parent complete only when its required stages finish. External parent completion completes the occurrence but must not invent measured stage timings.
- If independent stages must be visible to voice/Google Tasks, test supported subtasks or separate linked tasks before choosing that model. Avoid introducing them merely to mirror every tiny checkbox.

### Phase C: recurrence, after prototype review

- Preferred new-chore model: template with cadence, timezone and slot rules; ordinary dated Google task occurrences. Existing native recurring routines remain untouched.
- For maintenance chores, allow one open occurrence per template. The next due occurrence is calculated from the defined cadence after completion, not by accumulating missed copies.
- Fixed-date obligations such as collection/renewal use actual occurrence dates and explicit missed states; do not shift their deadline by applying the maintenance rule.
- Generate at most a reviewed short horizon. Use a private template/occurrence mapping and stable occurrence key, never a title-based dedupe rule.
- Creation timeout is ambiguous: reconcile before retrying. Persist a creation intent, serialize generation per template, and use a reviewed non-sensitive occurrence marker if necessary. The API must not be assumed to provide exactly-once insertion.
- Approval must show list, sample task names/dates, cadence, maximum create count, and rollback targets before enabling generation.

### Robustness requirements

- Use an authenticated server-side command/outbox boundary; never browser-to-Google calls with long-lived tokens.
- Patch only changed fields. Re-fetch source before applying a stale queued command; a newer external edit/completion wins or becomes an explicit conflict, not silent last-writer-wins.
- Handle offline queues, token expiry, permission loss, rate limits, pagination, deleted tasks and partial failures. Deletion must not cause automatic recreation.
- Reconcile periodically and on app foreground; choose a documented polling interval after quota review. Do not promise instant voice-to-board updates or undocumented push support.
- Keep user data, source IDs and raw sync logs outside the public repository/artifact.
- Rollback disables generation/writes and retains source tasks. Never bulk-delete historical or pre-existing user tasks.

## 11. Suggested metadata contract

Conceptual fields, not a committed migration or request to change the existing day-state schema:

- Template: templateId, version, cadenceMode, cadenceRule, timezone, preferredWindow, activeMinutes, waitingMinutes, category, enabled, scoringEligible=false.
- Occurrence link: templateId, occurrenceKey, sourceListId, sourceTaskId, sourceUpdatedAt, dueDate, preferredStart, latestFinish, syncStatus.
- Stage: stageId, label, activeMinutes, expectedWaitMinutes, dependsOn, startedAt, estimatedReadyAt, completedAt.
- Command: commandId, sourceTaskId, expectedSourceVersion, intendedPatch, queuedAt, acknowledgedAt, errorCategory.

Separate estimates from actual timestamps. Durable writes and timer timestamps survive refresh. Store timestamps as instants and calculate wall-clock schedules with America/Toronto and daylight-saving handling; do not add 24 hours to represent a calendar day.

## 12. Implementation sequence for Claude/Codex

1. Review this plan and confirm household assumptions; inspect shared STATUS and overlapping UI work before claiming files.
2. Audit existing chores and schedule inconsistencies. Resolve conflicting itemTimes, blocks and schedule rows before promising one unified next-action display. Do not automatically change scored windows or medical-related timing.
3. Implement pure duration/recurrence/conflict functions with fixture tests. No external writes.
4. Implement synthetic Home upkeep board with expandable tasks, staged laundry and pending/stale states; preserve the current board redesign.
5. Implement read-only Google adapter and mapping preview under explicit access approval.
6. Perform the one-task write prototype with explicit approval and verify both directions.
7. Enable a small reviewed chore set, then recurrence generation only after duplicate/retry and rollover tests pass.
8. Run a two-week duration/capacity pilot, adjust the plan, and expand coverage. Keep stakes unchanged.

## 13. Acceptance tests and completion evidence

- A room task exposes its real steps, persists completion, and stays expanded after logging.
- Laundry tracks active effort separately from waiting; delayed cycles update the next action without pretending to finish.
- Preferred windows do not overlap active commitments; unresolved collisions are visible rather than silently scheduled.
- Existing routine scoring, balances, days off and unarmed reporter remain unchanged when chores are added/completed/missed.
- Repeated generation, restart, timeout and multiple workers cannot knowingly create duplicate occurrences; ambiguous outcomes pause and reconcile.
- External completion, reopen, rename, deletion, and native recurrence rollover are tested against the actual selected service.
- Offline completion remains visibly pending; reconnect/conflict/token-expiry paths preserve source truth.
- Date-only Google dates remain dates across Toronto midnight and daylight-saving transitions.
- Validate mobile 320/375/430 and desktop layouts, keyboard/focus behavior, tap targets, and stale/error states.
- Verify public artifact excludes plan/private runtime data and credentials.
- Record local tests, deployment, real account sync, phone notification delivery, and physical Google Home retrieval/completion separately. None is evidence for the others.

## 14. Handoff and next action

Deliverable in this session: this Markdown plan only. No new live chores, task sync, reminder schedule, or money-stake changes.

Next action: confirm machine setup/load count and chore ownership, then compare the catalogue with the existing Google Tasks list in a read-only audit. The catalogue can be refined before any code or Google writes. Do not merge this plan's household tasks into the seven mandatory routine blocks by default.
