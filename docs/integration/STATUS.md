# Unified integration execution status

Updated: 2026-09-07. Active implementation owner: none. T1 and F1 are pushed and deployed; T1-T4 and F1 are pushed and DEPLOYED (9645dca). T5 and T6 are unclaimed.

## Current state

### Visual simplicity and motion refresh (2026-09-07)

- Codex continued from clean `5647209` in the shared checkout. Updated presentation only: neutral dark surfaces, clearer current action, compact typography, readable Next countdown, quieter routine status, tap feedback and 180ms disclosure reveals triggered by interaction. Reduced-motion preference disables reveals and transitions.
- Verified 20 controller tests and a real Edge/Playwright run at 320/375/430/1280px: no horizontal overflow, Next visible, disclosure animation, logging preserves expansion, reduced-motion has zero animations, no runtime errors. Inspected phone screenshot. Public artifact build succeeded. Browser QA uses synthetic local state; physical-device testing remains with the user.
- Service worker cache is `midnight-v9`. Publishing under the user's explicit request; no schedule or scoring changes in this refresh.

### Phases 2-3 complete: planner and unified Day board deployed (2026-09-07)

- Release `1d90cf8` is pushed to `main` and deployed by GitHub Pages run `34166855845` (success). Live checks returned HTTP 200 for `index.html` and `day-plan.mjs` and confirmed the execution board, next-action countdown, and planner export are present.
- Added pure `day-plan.mjs`: stable routine/chore/outcome occurrence IDs, Now/Next/Background selection, active-time totals that exclude machine waiting, ready laundry handoffs, capacity/conflict reporting, and a read-only adjustment preview. Fixed windows remain fixed; work that cannot fit is listed with a reason rather than compressed or silently dropped.
- Today now starts with one execution surface: chosen meaningful outcome, current action, named next action with clock time and live countdown, background machine work, upkeep load, schedule status, read-only Adjust day, and one expandable routine/upkeep checklist. Starting chosen work is separate from marking it done. The duplicate Today hero and activity presentation were removed.
- Canonical schedule cleanup completed across all four day kinds. WFH gym, get-ready, breakfast, and work no longer overlap; all routine blocks are sequential with at least ten minutes of transition time. Saturday/Sunday overlaps were removed. The Plan timetable now reflects driving and morning deep work instead of the retired bus commute and evening duplicate.
- Household rollout was smoothed: weekly chores first appear on their actual weekday after adoption, and the three monthly resets are staggered by 7/14/21 days instead of landing together. This changes first-occurrence scheduling only; the approved chore scoring policy is unchanged.
- Verification: 111/111 module tests, 20/20 controller tests, `node --check` for the planner/rules, reviewed public build with 16 entries, and `git diff --check`. Synthetic rendered QA at 375px confirmed the first-viewport hierarchy and live countdown. This is not signed-in Firebase, physical-phone, notification, Google Tasks, Google Home, or speaker verification.
- Safety boundaries remain: Beeminder is unarmed; Google Tasks writes remain disabled. Phase D still requires the authenticated state/completion round trip and separate explicit approval. Next product evidence is the user's phone feedback on the deployed Day board.

### Day board optimization review (2026-09-07)

- Codex reviewed clean `main` at `42f32a2`, latest board/upkeep/sync code, schedules, tests and prior plans. Deliverable: `docs/superpowers/plans/2026-09-07-day-board-optimization-review.md`; documentation only, no runtime changes or live writes.
- Recommends canonical timing, one Now/Next/Background execution board, protected meaningful work, passive overlap and explicit replanning. Preserves the user's chosen chore penalties pending separate policy approval and acknowledges confirmed in-unit laundry/room-only ownership.
- Findings: seven office item times outside scoring windows; current chore Move can erase historical penalties; daily partial steps lack occurrence scope; task-sync runner lacks actual app-state/completion round trip and actual completion-time metadata. The earlier statement that sync needs only consent is superseded by this source review.
- Fresh checks: 75/75 module tests, 17/17 controller tests, public build succeeded. Synthetic pure-function probes reproduced the move-history and partial-step problems and inspected late inbound completion metadata. No live account, deployment or physical-device verification.
- Next: coordinate with current UI owner; regression tests and canonical schedule proposal before implementation. Policy changes and Google writes still need explicit approval. Review ownership released; plan/status edits local and uncommitted.

### Household task planning handoff (2026-09-07)

- User redirected Codex to planning while Claude may own UI implementation. No further UI edits or deployment for this request.
- Plan: `docs/superpowers/plans/2026-09-07-home-maintenance-and-task-sync.md`. Covers room reset, recurring household catalogue, active/waiting durations, proposed time allocations, separate Day board upkeep group, and staged Google Tasks feasibility/sync rollout.
- Google Tasks API timing limits checked against official documentation. Plan keeps source tasks/completion in Google and timing metadata in FLOWSTATE; no live writes or recurrence automation enabled.
- Pending confirmation: laundry setup/load count, shared chore ownership, collection schedule, live commitments and selected task list. Next implementation step is a read-only mapping audit after access approval.
- Plan is local/uncommitted. Existing UI changes remain in the shared working tree; the prior fetch/publish attempt was blocked by approval-review usage limits and was not retried. Coordinate ownership before editing those files.

### Phase 1 complete: canonical schedule, conflict validation, chore rebalance (2026-09-08)

Design approved; user also approved moving Deep work to the morning. Tests written first (12 red, then implemented to green).

**Office day rewritten.** Deep work 21:15-22:00 -> **07:35-08:20**, gym **17:30-20:00 (150 min)**, evening 20:00-21:15, wind-down **21:30-22:15**. Eleven office item times realigned into their new windows. Capacity now **390 scheduled against 485 available, 95 min slack** (was 345 against 340, a deficit, with wind-down 15 min past the sleep target). WFH/Sat/Sun keep 3-hour gym windows; only the office day was over-committed.

**`schedule.json` gained `dayShape`** per day kind (wake, sleep, workStart, workEnd, commuteMin). Office 09:00-17:00 and 20 min commute are confirmed by the user; **WFH work hours are an assumption** (same 09:00-17:00) and are recorded as such — correct them before relying on WFH capacity. Blocks may declare `duringWork: true` (only `midday` does) so a legitimate lunch break is not reported as a conflict.

**`rules.mjs`**: `dayShape`, `dayCapacity` (union of block minutes outside working hours against real free time — union, not sum, because the long gym window deliberately overlaps other blocks on WFH days), `scheduleConflicts` (reports `overlaps-work`, `no-transition`, `over-capacity`), `TRANSITION_MIN = 10`. `assertSchedule` now **throws** when any block ends after the sleep target — the exact defect that shipped.

Conflicts now reported (information for phases 2-3, not errors): office has three zero/5-minute transitions (Morning->Fuel, Fuel->Deep work, Gym->Evening); **WFH gym 07:00-10:00 and fuel 08:30-09:30 run into 09:00 working hours** and need a decision; Saturday has a zero-minute Midday->Deep work transition.

**Chore rebalance shipped**: `CHORE_POINTS.onTime` 3 -> **8**, `CHORE_DAILY_FLOOR = -20` applied to each day's negative portion. Measured on the real catalogue, Mon-Sun: perfect **+357**, scenario B (dailies 5/7 + all weeklies) **-31 -> +108**, total neglect **-140** (blackout in ~2.5 days). The floor equals exactly the four daily chores. **The ledger is derived, so historical days re-score under the new constants** — the balance will visibly jump; this is expected, not a bug.

Verification: **97/97 `tests/*.test.mjs`** (12 new: 10 schedule-shape, 2 chore rebalance) and **17/17 `tests/midnight.test.cjs`**; `build-site` clean; viewports emulated at 320/375/430/desktop with **no horizontal scroll at any width** (an earlier 320px overflow report was a measurement artifact from a CSS width hack against a `position:fixed` nav); service worker `midnight-v7`. `index.html` unchanged in this phase, so the per-minute focus/scroll guard from `1906862` is intact and its test still passes.

Not done, and deliberately: the duplicate `<h1>` and duplicate activity logger remain (phase 3 removes them); no planner yet (phase 2); Beeminder unarmed; Google writes disabled.

### Day board execution-surface design written, awaiting approval (2026-09-08)

- Claude, `main`, verified at `39bd500` (= `origin/main` via `git ls-remote`, deploy success, clean tree, 85/85 + 17/17). No newer agent changes found.
- Design: `docs/superpowers/plans/2026-09-08-day-board-execution-surface-design.md`. **Nothing implemented.**
- Decisions taken with the user: Now/Next controller with Timeline and Checklist as peer views; outcome from standing projects with a next-step ladder and a mandatory done condition; week confirmed Mon/Tue office, 09:00-17:00, under-20-min drive, asleep 23:00, no fixed weekly commitments; chore scoring rebalanced to +8 on time with a -20/day floor; planner may move everything except the fixed set; **scored windows never move, so auto-fail stays real**; gym window 2.5h on office days.
- Two computed findings drove the schedule change. The office evening was arithmetically impossible: 345 min of blocks against 340 min between arriving home and a 23:00 sleep target, with wind-down ending 23:15. And the morning holds 65 min of dead buffer, because the saved 07:30 departure serves a 09:00 start with an under-20-minute drive. A 2.5h gym window yields 315 against 340 — 25 min of real slack.
- Chore constants solved rather than guessed. Under current settings a *good* week (dailies 5/7, all weeklies done) scored **-31**; only near-perfection was non-negative. At +8 with a -20/day floor: perfect +350, good +108, dailies-only +39, total neglect -140 (blackout in ~2.5 days). The floor equals exactly the four daily chores, so one day of complete neglect cannot be compounded further by weeklies.
- Proposal held for approval, not implemented: moving Deep work from 21:15-22:00 to the unused 07:35-08:20 morning slot. It changes a scored window's times, so it is a schedule decision rather than a planner action.
- Boundaries reaffirmed in the design: Beeminder unarmed; Google writes disabled and explicitly *not* unblocked by consent alone (`tasks-sync.mjs` still lacks authenticated state, Toronto dates, completion timestamps, persisted inbound completions, runtime retry and reopen/deletion reconciliation); chores reach the balance only, never `evaluateDay`; medication timing never moved for scoring.
- Next: user approval of the design, then phase 1 (canonical schedule, conflict validation, chore rebalance) tests-first.

### Second review pass: remaining P2 findings fixed (2026-09-07)

Four more items from Codex's review, all correctness rather than policy. The chosen penalties are unchanged.

1. **Blackout hid the escape hatch.** Non-Today tabs were removed from the nav and every tab forced back to Today. Now that chores can drive the balance below the floor, that took away the day-off control — which lives in More — and the schedule, at the moment they were most needed. Recovery, planning and settings now stay reachable; only cosmetics are withdrawn, and the balance and its consequences remain fully visible. Verified in the harness: with `tier-blackout` applied, More and Plan render and `#dayOffDate` is reachable.
2. **Laundry stages invented history.** Starting a later stage marked every earlier one complete, asserting work the app never saw. Skipped stages now read `skipped`, and only stages actually recorded as finished read `complete`. Stages are also occurrence-scoped, so last Sunday's load no longer shows as running this Sunday.
3. **No Undo.** A mis-tap marking a chore done was permanent. `undoCompletePatch` removes today's completion only, restores the previous `last`, and returns the points — verified live: balance moved -20 → -23 on undo.
4. **The balance was one opaque number.** Each chore row now shows its own running contribution ("+3 so far"), so it is inspectable rather than a single figure to argue with.

Stale documentation corrected: `chores.mjs`'s header claimed chores never score, which stopped being true when the ledger was added. It now states the current boundary — chores move the balance, never the day verdict, so they cannot reach the money stake.

Deliberately not done, and left for approval because they are policy or redesign rather than defects: the unified Day board in review section 3; the schedule adjustments in section 7; a per-day cap on household exposure (section 9 recommends evaluating one, and notes four daily chores alone produce -20/day); per-day-kind chore windows to avoid collisions with saved evening slots. The `tasks-sync.mjs` gaps stand as recorded — consent remains necessary but not sufficient.

Verification: 85/85 `tests/*.test.mjs` (5 new), 17/17 `tests/midnight.test.cjs`, build clean, service worker `midnight-v6`, browser-driven checks for undo, stage skipping, per-chore cost and blackout navigation.

### Closeout: three defects fixed, Google sync parked unarmed (2026-09-07)

Codex's `docs/superpowers/plans/2026-09-07-day-board-optimization-review.md` found real defects in Claude's work. Three were reproduced and fixed before closing out.

1. **The schedule punished following its own instructions.** Seven office items had suggested tap times outside the window that scores them (cookmeal 19:40 against Evening 20:30-21:45, and so on). Cause: widening the gym window to three hours moved the evening blocks later, and `tapPlan.itemTimes` was not moved with them. Times realigned, and `assertSchedule` now rejects any item whose suggested time falls outside its block, so this cannot regress silently. Consequence to note: the office evening now runs to 22:50. If that is too late, the fix is a 2.5-hour gym window (still inside the stated "2 and half to 3hrs"), not drifting the times again.
2. **"Move to tomorrow" erased assessed penalties.** `choreLedger` applied a single `moved` date to every historical day, so a chore three days overdue at -15 dropped to 0 on one tap — an eraser for the mechanic the user had just asked to be made harsher. Records now carry `movedAt`; deferral applies only from the day it was requested. Legacy records without `movedAt` forgive nothing.
3. **Sub-steps leaked across days.** A daily chore opened showing yesterday's half-ticked checklist. Steps are now stamped with `stepsOccurrence` and only surface for the occurrence they belong to.

Not fixed, recorded as open (from the same review): chore windows are one clock time across all day kinds and can collide with saved evening slots; laundry stage selection infers earlier stages complete and has no Undo; blackout still hides non-Today tabs, which chores can now trigger; `tasks-sync.mjs` uses a UTC date for today, plans from preview state rather than authenticated app state, does not PATCH remote completion, does not persist inbound completions, and does not call `retryDecision` from the runner. **Consent is necessary but not sufficient for the round trip** — do not enable live writes on the strength of a token alone.

**Google Tasks sync is parked, built and unarmed.** No credential was ever created; `.google-oauth.json` and `.google-client.json` do not exist. Nothing in this repository can reach a Google account. The engine, its gates and 18 tests are in place for whenever it is picked up.

Verification at closeout: 80/80 `tests/*.test.mjs`, 17/17 `tests/midnight.test.cjs`, build clean, service worker bumped to `midnight-v5`.

### Task-sync engine built and tested against stubs (2026-09-07)

- `scripts/tasks-sync.mjs` implements plan phases B and C as far as they can go without a Google credential: reconciliation planning, idempotency, inbound completions, and a gated apply. 18 tests, all against stubbed task lists; nothing has run against a real account.
- **Identity is a marker, never a title.** Created tasks carry `flowstate:<choreId>@<occurrenceDate>` in their notes and reconciliation reads that, so renaming a task in the Google app does not orphan it and two tasks sharing a title are never conflated.
- Enforced and tested: one open occurrence per template (a stale open task blocks a new one); a completion made in Google wins and is reported back as an inbound completion rather than recreated; unmarked tasks are recognised as the user's own and never touched; `plan.deletes` is always empty and no DELETE path exists in the file; a second run proposes nothing.
- An ambiguous creation (timeout) reconciles by re-fetching rather than retrying blind — `retryDecision` returns already-created / retry / pause-for-review. The API is not assumed to insert exactly once.
- Writing is gated three times: `--live`, `tasksSync.enabled === true` in schedule.json, and a credential whose scope is writable. A `--readonly` token is refused up front rather than failing halfway. Dry run is the default.
- `oauth-setup.mjs` now prompts for client ID and secret when they are absent from the environment, so a client secret need not be written into shell history.
- Still blocked, and only on a human: the Google consent itself. No credential exists (`.google-oauth.json` absent, no `GOOGLE_OAUTH_*` secret). `tasksSync.listId` is also unset — it comes from the audit. Phase B additionally needs explicit write approval under CLAUDE.md rule 1.
- Verification: 75/75 `tests/*.test.mjs`, 17/17 `tests/midnight.test.cjs`, build clean, `scripts/` correctly absent from the published artifact.

### OAuth prepared for a read-only audit (2026-09-07)

- `oauth-setup.mjs` gained `--readonly` (requests `auth/tasks.readonly`, so the minted token physically cannot modify a task) and `--save` (writes `.google-oauth.json`, gitignored, chmod 600). `tasks-audit.mjs` reads that file, so the refresh token never has to pass through a terminal transcript, a chat window or a clipboard.
- The writable scope is still available but is now opt-out rather than the only option, matching plan section 10's minimum-necessary-scope rule. Only mint it once a write is actually approved.
- The agent did not and will not perform the Google consent: signing into the account and granting OAuth are the account holder's actions, and the refresh token is a credential the agent must not handle. `console.cloud.google.com` was also blocked to the agent's browser, and that browser is not Satya's signed-in Chrome in any case.
- Remaining human steps: enable the Tasks API, create a Web application OAuth client with redirect `http://localhost:8765/callback`, then run `oauth-setup.mjs --readonly --save` and `tasks-audit.mjs`. Note port 8765 is also used by `tests/preview_server.py`; stop that first.
- Verification: 57/57 `tests/*.test.mjs` including credential precedence, the gitignore guard, and a structural check that the read-only scope path exists. Nothing was run against a real Google account.

### Chores now score; Google sync blocked on credentials (2026-09-07)

- Claude, `main`, from `034aba7`. User reversed plan section 8.10: chores must cost something.
- **Chosen and implemented:** +3 done on time, +1 late, **-5 per outstanding chore per day**, compounding. Balance only. The day verdict is unchanged, and `stakes.mjs` posts on `evaluateDay`'s verdict rather than the balance, so a missed chore degrades the app but **cannot reach Beeminder or cost money**. A test asserts this rather than assuming it.
- Nothing is charged for a day still in progress. Today's exposure shows as "-N to the balance at midnight", mirroring an open block scoring nothing until it closes.
- Chore records now keep a `done` date map, not just `last`: the ledger has to walk history to tell a met occurrence from a missed one, which a single most-recent field cannot express. Existing `last` values are migrated once on load.
- Fixed during browser verification: the header rendered `RULES.balance` (blocks only) while the tiers and mood layer used the combined ledger, so the number on screen disagreed with the state driving debt and blackout. Header now reads `combinedLedger()`; regression test added.
- **Step 5 (read-only audit) delivered as a LOCAL-ONLY script**, `scripts/tasks-audit.mjs`, with 7 tests. Lists, tasks (including completed and hidden), pagination, and a candidate-mapping preview against the chore catalogue. Duplicate titles are reported ambiguous and claim nothing — titles alone are not identity. A structural test asserts no PATCH/PUT/DELETE exists and that the single POST is the OAuth token refresh, not a Tasks write.
- **The audit refuses to run in CI.** This repository is PUBLIC (`gh repo view`: PUBLIC), so Actions logs are public, and printing real task titles into a run would publish a private task list. No workflow was added. Making the repo private is Satya's decision, not an agent's. Report output paths are gitignored.
- **Steps 6-8 are NOT done and cannot be by an agent.** No `GOOGLE_OAUTH_*` secret exists in any workflow (only `FIREBASE_SERVICE_ACCOUNT`); commit `aa146d9` deliberately removed Google write credentials. Restoring them requires browser consent on Satya's own Google account and pasting a refresh token — account authentication and credential handling, which the agent must not perform. Phase B also requires explicit write approval under CLAUDE.md rule 1, which has not been given after reviewing consequences.
- Verification: 54/54 `tests/*.test.mjs`, 17/17 `tests/midnight.test.cjs`, build succeeded, `scripts/` correctly absent from the published artifact. Not verified: real Google account state, signed-in app, physical device.

### Home upkeep and get-ready (2026-09-07)

- Claude, `main`, from `1906862`. Implements steps 3 and 4 of the household plan (`docs/superpowers/plans/2026-09-07-home-maintenance-and-task-sync.md`): pure functions with fixture tests, and a synthetic Home upkeep board. Steps 5-8 need Google access approval and were not started; no adapter, no OAuth, no writes.
- Confirmed with the user: hygiene is ONE scored `getready` item with a four-step sub-checklist (not separate scored items); laundry is in-unit washer plus dryer; cleaning ownership is room only, so the bathroom deep clean and shared kitchen zones were dropped from the catalogue. Kitchen close was kept because the routine already cooks daily.
- `chores.mjs` is a separate module from `rules.mjs` by design. Plan section 8.10 keeps chores out of `evaluateDay`, the balance, blackout and Beeminder; a test asserts a full set of overdue chores moves neither the verdict, the delta, nor the balance.
- One outstanding occurrence per template falls out of computing the current occurrence from cadence plus last completion, rather than generating and accumulating rows. A weekly chore skipped for a month is one overdue job.
- Added `config.choresStart`. Found in preview that a fresh install opened claiming 13 open chores with several days of lateness on work it had never observed. Occurrences due before adoption now read as due, not late; verified zero overdue on a clean state.
- Staged laundry separates active effort from machine waiting and never self-completes: starting a stage records `startedAt` and an estimated ready time, and a passed estimate reads "go and check".
- Verification: 38/38 `tests/*.test.mjs` (15 new chore tests), 16/16 `tests/midnight.test.cjs` (4 new controller tests), `build-site` succeeded with `chores.mjs` published, service worker bumped to `midnight-v4`. Browser-driven checks in the synthetic harness covered stage start, step-completion, chore completion, and get-ready sub-steps completing the single scored parent with its timestamp.
- Not verified: real cloud writes, the signed-in app, and physical-device behaviour. Sub-step and chore state are local/Firestore only and reach no Google service.

### Day board usability update (2026-09-07)

- Codex, same checkout on `main`, starting at `a5d7291`; scope: board rendering/styles, countdowns, legacy timestamp guard, regression tests, preview harness, service-worker cache.
- Blocks expand into named, directly actionable checklists with progress counts. Today highlights the current or next block and a live countdown. Day-off controls moved to More. Scoring and stake configuration are unchanged; Beeminder remains unarmed.
- Verification: `node --test tests/*.test.mjs` passed 21/21; `node --test tests/midnight.test.cjs` passed 12/12; `node scripts/build-site.mjs --out _site` succeeded; `git diff --check` passed.
- Synthetic browser QA: inspected 320, 375, 430 and 1280 pixel layouts; expanded Morning, logged an item without collapsing the block, and opened hydration from its row. This does not verify real cloud writes or physical-device behavior.
- Publishing under the user's existing push/live authorization. Deployment outcome is recorded in the task response and GitHub Actions; phone feedback remains the next step.
- Claude finished the interrupted run (Codex stopped before `git fetch origin`). Added focus restoration to the per-minute board redraw: `draw()` replaces `root.innerHTML`, which blurs the active element to `<body>` — measured in the synthetic harness — so a keyboard or screen-reader user lost their place in the checklist every minute without acting. Scroll is carried across the same redraw as cheap insurance; measurement showed the viewport does not currently clamp, because the replacement is synchronous. Not covered by a regression test: the jsdom harness pins the clock, so the minute-boundary redraw never fires there. Verified by hand in the preview instead.

T1 is implemented and verified locally but not committed or pushed, so nothing has changed on the deployed site yet. Cloud publication, scheduling, Graphify regeneration, and deployment have not started.

Phone Dashboard was clean before documentation changes (`git -C phone-dashboard status --short`, with a temporary safe-directory override). Recheck before execution. Root is not a Git repository. Existing source documents were inspected; live Firebase permissions, hosted source URLs, Google state, and physical devices were not verified.

## Task ledger

| ID | Deliverable | Depends on | State | Owner |
|---|---|---|---|---|
| P0 | Plan, spec, portable handoff, agent pointers | — | Done locally | Planning session |
| T1 | Deployment artifact boundary and integration baseline | — | **Deployed** | Released (Claude, 2026-09-06) |
| T2 | Versioned registry and snapshot contract | T1 | **Deployed** | Claude, 2026-09-07 |
| T3 | Fixture-backed Workspace UI | T2 | **Deployed** | Claude, 2026-09-07 |
| T4 | Local collector with Encore + trading adapters | T2 | **Deployed (collector is local-only by design)** | Claude, 2026-09-07 |
| T5 | Sleepforge, downloader, references, Graphify metadata | T4 | Pending | Unassigned |
| T6 | Authenticated snapshot transport and emulator tests | T3, T5 | Pending | Unassigned |
| T7 | Phone rollout, operations, agent handoff verification | T6 | Pending | Unassigned |
| T8 | Graphify quality and refresh workflow | T7 | Pending | Unassigned |
| F1 | Day windows, signed balance, notifications, and unarmed Beeminder reporter | — | **Deployed; stakes unarmed** | Released (Codex, 2026-09-07) |

## F1 claim record (active)

- **Agent / session:** Codex desktop session.
- **Claimed:** 2026-09-07T19:13:12Z.
- **Checkout:** `C:\Users\Satya\Downloads\Projects\phone-dashboard`, branch `main`, starting commit `89e8108de2b11c2d00c9e550cd253d28e4c2eb79`.
- **Pre-existing uncommitted state:** T1/integration work in `.github/workflows/deploy.yml`, `.gitignore`, `CLAUDE.md`, `AGENTS.md`, `docs/integration/`, `docs/superpowers/plans/2026-09-06-unified-phone-dashboard.md`, `scripts/build-site.mjs`, and `tests/`. Preserve it and do not claim it as F1 work.
- **F1 file scope:** `rules.mjs`, `schedule.json`, `index.html`, `scripts/notify.mjs`, `scripts/stakes.mjs`, `.github/workflows/notify.yml`, `.github/workflows/deploy.yml` (test command only), `scripts/build-site.mjs` (public manifest only), F1 tests, and this status record.
- **Safety state:** Beeminder reporter remains dry-run/unarmed by default. No token, payment data, live goal setup, deployment, or physical-device verification is part of the local implementation.

## Session record — F1

**Task ID and state:** F1 — implemented and verified locally; uncommitted, unpushed, undeployed. Beeminder remains unarmed.
**Agent/session and UTC timestamp:** Codex desktop session, 2026-09-07.
**Checkout path, branch, starting commit:** `C:\Users\Satya\Downloads\Projects\phone-dashboard`, `main`, `89e8108de2b11c2d00c9e550cd253d28e4c2eb79`.
**File ownership / overlaps checked:** F1 changed `rules.mjs`, `schedule.json`, `index.html`, `scripts/notify.mjs`, `scripts/stakes.mjs`, `.github/workflows/notify.yml`, `sw.js`, F1 tests, and narrow additions to the pre-existing T1 files `scripts/build-site.mjs`, `tests/site-build.test.mjs`, and `.github/workflows/deploy.yml`. Other T1/integration edits were preserved.

**Changes and decisions**

- Added the shared, Toronto-aware window engine, schedule assertions, signed balance, tiers, due-edge calculation, and rolling 4-in-28 day-off limit.
- Added all seven blocks for office/WFH/Saturday/Sunday and verified every timed item maps to exactly one block.
- Added the Day board, countdowns, overlap display, late logging, balance/debt/blackout behavior, day-off controls, history verdicts, and read-only stake status UI. New action timestamps are epoch milliseconds; older `HH:MM` logs remain completed but score as late because their date/time zone cannot be proved.
- Replaced DST-paired notification crons with `*/10`, added window open/warn/failed-close/day-end pushes, deterministic edge dedupe, snooze/day-off suppression, and catch-up summary behavior. The old `tapPlan.slots` data and unused `composeNudge` helper remain for a later mechanical cleanup; the auto path no longer calls them.
- Added a seven-day backfill Beeminder reporter with deterministic `requestid`, goal readback, and Firestore stake status. It is dry-run by default and requires all three explicit gates for live writes: `--live`, `stakes.enabled: true`, and `BEEMINDER_TOKEN`.
- Added `rules.mjs` to the reviewed public artifact and service-worker shell cache. No token, card data, or payment API exists in the client or artifact.

**Commands run and actual results**

- TDD red: rules tests failed with `ERR_MODULE_NOT_FOUND`; artifact test failed because `rules.mjs` was absent. Stake tests likewise failed with `ERR_MODULE_NOT_FOUND` before implementation.
- `node --test tests/*.test.mjs`: 20 tests, 20 passed, 0 failed.
- `node --check rules.mjs`, `node --check scripts/notify.mjs`, `node --check scripts/stakes.mjs`, and extracted inline-module `node --check`: all exit 0.
- `node scripts/build-site.mjs --out _site`: built 10 manifest entries; `_site/rules.mjs` exists. Token-name scan of `_site` returned no matches.
- Local browser loaded the artifact at the Firebase auth gate with no console warnings/errors. Signed-in UI behavior was not exercised because this session did not request or enter the account password.
- `git diff --check`: exit 0 (line-ending warnings only).

**Commit(s), or explicit uncommitted state:** `7f66990` contains F1 together with the previously uncommitted T1/integration changes, as explicitly requested by the user.
**Remote and deployment state:** Rebased onto the Midnight UI release and pushed through `f7814f2`. GitHub Pages run `34156462388` completed successfully. The live auth gate rendered with no browser console warnings/errors, and `rules.mjs`, both Midnight UI assets, the filament SVG, Newsreader font, and `schedule.json` each returned HTTP 200. The notification workflow is configured at 10-minute cadence; its first scheduled run after this deployment was not forced from this session.
**Phone verification:** Not performed. Countdown thresholds, blackout logging, real push delivery, and responsive signed-in layout still require authenticated/physical-device checks.
**Failures / configuration still needed:** Create and verify the Beeminder goal manually; fill public `schedule.json` stake user/goal values; keep `stakes.enabled` false through the dry-run observation period; add `BEEMINDER_TOKEN` only when arming; then use `--live`. Real API idempotency, outage backfill, stake readback, and any legitimate future charge are not locally verified.
**Next task and exact first action:** Review and commit the mixed worktree carefully, deploy Part A plus dry-run Phase 8, then compare several reporter payloads with signed-in app verdicts before any live token is supplied.
**Ownership released:** Yes.

## T1 claim record (closed)

- **Agent / session:** Claude, Claude Code desktop session.
- **Claimed:** 2026-09-06T21:20:49Z. **Ownership released** the same session.
- **Checkout:** `C:\Users\Satya\Downloads\Projects\phone-dashboard`, branch `main`, starting commit `764a18b`. Root workspace is not a Git repository.
- **Pre-existing uncommitted state at claim time:** `M CLAUDE.md`, untracked `AGENTS.md` and `docs/` (output of the planning session). None of these overlap the T1 file scope.
- **File scope owned:** `tests/site-build.test.mjs`, `scripts/build-site.mjs`, `.github/workflows/deploy.yml`, `.gitignore`, this STATUS file.
- **Environment:** Node v24.18.0. No root `package.json` and no `tests/` directory existed at claim time; `scripts/package.json` is a separate manifest for the Google sync scripts. Test harness is `node --test`, no new dependencies.

## Baseline verified at claim time

`.github/workflows/deploy.yml` uploaded `path: .`, so every tracked file was published. `gh repo view` reports `satyagaurav7/phone-dashboard` is **PUBLIC**, and `git ls-files` lists 46 tracked files, of which `git ls-files '*.md'` returns **18** Markdown documents (17 in the root plus `tools/README.md`).

A pattern scan of the published set (counts only; values were not extracted) found probable personal content in files that have no reason to be on a public website:

| Published file | Firebase config | Medical terms | Address-like | Financial |
|---|---|---|---|---|
| `index.html` | 3 | 11 | 0 | 48 |
| `SCHEDULE.md` | 0 | 6 | 3 | 1 |
| `MONEY-SAVING-TOOLKIT.md` | 0 | 1 | 1 | 31 |
| `GROCERY-LIST.md` | 0 | 4 | 0 | 5 |
| `SYNC-SETUP.md` | 1 | 0 | 0 | 0 |

These are regex hits, not confirmed disclosures. Note that the Firebase web `apiKey` in `index.html` is a public client identifier by design, not a leaked secret; Firestore rules are the real control. `.gitignore` already keeps `RAW-TRANSACTIONS*.md` and `legacy-calendar-backup.json` untracked, and both were confirmed absent from `git ls-files`.

This makes T1 the fix for a live exposure, not only the next ledger item.

## Session record — T1

**Task ID and state:** T1 — implemented and verified locally. Not committed, not pushed, not deployed.
**Agent/session and UTC timestamp:** Claude, Claude Code desktop session. Claimed 2026-09-06T21:20:49Z; work completed same session.
**Checkout path, branch, starting commit:** `C:\Users\Satya\Downloads\Projects\phone-dashboard`, `main`, `764a18b`. Root workspace is not a Git repository.
**File ownership / overlaps checked:** Owned `tests/site-build.test.mjs`, `scripts/build-site.mjs`, `.github/workflows/deploy.yml`, `.gitignore`, this file. Pre-existing `M CLAUDE.md` and untracked `AGENTS.md`/`docs/` were left untouched.

**Changes and decisions**

- Added `scripts/build-site.mjs` exporting `buildSite({root, outDir})` plus a `--out` CLI. It copies a reviewed manifest, never a recursive root scan.
- Manifest: `.nojekyll`, `index.html`, `sw.js`, `manifest.json`, `schedule.json`, `icons/`, `moods/`, and the two `tools/*.html` harness pages named individually. `tools/` is deliberately **not** a directory entry, so `tools/README.md` stays internal. Required assets (`index.html`, `sw.js`, `manifest.json`, `schedule.json`) fail the build when absent rather than publishing a broken shell.
- Added `tests/site-build.test.mjs` (`node --test`, no new dependencies; no root `package.json` needed).
- `deploy.yml` now sets up Node 22, runs the manifest test, runs the build, and uploads `_site` instead of `.`. A comment warns against restoring `path: .`.
- `.gitignore` gained `_site/`, `.integration-local/`, and the local integration-config filenames.

**Commands run and actual results**

- `node --test tests/site-build.test.mjs` before implementing: 4 failed, all `ERR_MODULE_NOT_FOUND` for the absent `scripts/build-site.mjs` — the intended red.
- `node --test tests/site-build.test.mjs` after implementing: `tests 4 / pass 4 / fail 0`, no warnings.
- `node scripts/build-site.mjs --out _site`: built 9 manifest entries → 17 files. `find _site -name '*.md'` returns 0.
- Artifact previewed over static HTTP at 375x812. Auth gate rendered, service worker registered at scope `/`, Firebase bootstrap present, console clean.
- Asset resolution from the artifact: `manifest.json`, `schedule.json`, `sw.js`, both icons, `moods/default.svg`, `tools/mood-measure.html` all **200**.
- Exclusion check from the artifact: `SCHEDULE.md`, `GROCERY-LIST.md`, `MONEY-SAVING-TOOLKIT.md`, `CLAUDE.md`, `HANDOFF.md`, `tools/README.md` all **404**.

**Commit(s), or explicit uncommitted state:** Uncommitted. Working tree carries `M .github/workflows/deploy.yml`, `M .gitignore`, `?? scripts/build-site.mjs`, `?? tests/`, alongside the planning session's `M CLAUDE.md`, `?? AGENTS.md`, `?? docs/`.
**Remote and deployment state:** Unchanged. `origin/main` still has `path: .`; **the live public site still serves all 18 Markdown files.** The exposure is not closed until this is committed, pushed, and Pages redeploys.
**Phone verification:** Not performed. Preview was desktop-browser mobile emulation only, which is not a physical-device check.
**Failures / configuration still needed:** None blocking. Removing already-published files from the site does not purge them from Git history or third-party caches; decide separately whether history rewriting or making the repository private is wanted.
**Next task and exact first action:** T2 — create `tests/integration-contract.test.mjs` and watch it fail before implementing the registry and snapshot contract.
**Ownership released:** Yes. T1 owner field may be reassigned.

## Session record — T2

```text
Task ID and state: T2 (registry, validation, freshness) — implemented and verified locally; NOT committed.
Agent/session and UTC timestamp: Claude Code, 2026-09-07T23:59Z
Checkout path, branch, starting commit (per repo):
  phone-dashboard  C:/Users/Satya/Downloads/Projects/phone-dashboard  main  5647209
  encore           main  3840e9c   (read-only, not touched)
  ai-trading-lab   main  90ddc53   (read-only, not touched)
File ownership / overlaps checked: created integrations/registry.mjs, integrations/contract.mjs,
  tests/integration-contract.test.mjs — all new, no overlap. Pre-existing uncommitted work by Codex in
  .gitignore, index.html, sw.js, ui/midnight.css, docs/integration/STATUS.md, tests/visual-motion.cjs was
  left untouched; the STATUS diff was checked for a competing claim before editing (none present).
Changes and decisions:
  - SOURCES registry with the nine SPEC IDs. Phone Dashboard is deliberately absent: it is the shell.
  - allowedHosts is [] for every source. No hosted URL has been verified, and SPEC requires unverified
    URLs to stay absent. Encore and trading are laptop-local, so T3 shows "Available on laptop".
  - validateSnapshot(input, nowMs?) rebuilds the value field by field; nothing is spread, so unknown
    upstream keys cannot reach the browser. nowMs is optional and only gates the future-timestamp check,
    keeping validation deterministic in tests.
  - displayState derives `stale`; it is never a storable status. Reference entries never go stale.
  - Source-data age is checked separately from observation age: a 200 response does not make old data current.
  - Hashing deliberately omitted here — revision belongs to the collector (T4), not the view.
Commands run and actual results:
  node --test tests/integration-contract.test.mjs   -> 30 pass, 0 fail
  node --test tests/*.test.mjs                      -> 141 pass, 0 fail (no regressions)
  node scripts/build-site.mjs --out <temp>           -> 16 manifest entries; integrations/, tests/, docs/,
                                                       scripts/ all absent from the artifact (T1 boundary holds)
Commit(s), or explicit uncommitted state: 3ad06bc on main, local only. Staged just the four T2 files;
  Codex's in-flight .gitignore/index.html/sw.js/ui/midnight.css remain unstaged and untouched.
Remote and deployment state: NOT pushed, NOT deployed. origin/main is still at 5647209, so another
  checkout will not see 3ad06bc until it is pushed.
  integrations/ is intentionally not in the published artifact yet — T3 adds it to the allowlist.
Phone verification: none, and none applicable. T2 ships no UI.
Failures / configuration still needed: no test failures. Contract version 1. Host allowlists stay empty
  until real URLs are verified during T4/T6.
Next task and exact first action: T3 (fixture-backed Workspace view) or T4 (Encore + trading collector);
  both now have satisfied dependencies. For T4, first action is to create
  tests/integration-adapters.test.mjs with mocked GET /api/products and GET /api/status responses and watch
  it fail before writing scripts/integrations/adapters/encore.mjs.
Ownership released: yes.
```

## Session record — T4

```text
Task ID and state: T4 (Encore + trading collector) — implemented, tested, and demonstrated against a
  live local Encore server. Committed locally; NOT pushed, NOT deployed.
Agent/session and UTC timestamp: Claude Code, 2026-09-08T01:00Z
Checkout path, branch, starting commit (per repo):
  phone-dashboard  C:/Users/Satya/Downloads/Projects/phone-dashboard  main  2aaeab4 (T2)
  encore           main  3840e9c   read-only; 22 pre-existing dirty entries, all mtimes 2026-09-06,
                                   verified unchanged by this session
  ai-trading-lab   main  90ddc53   read-only, not running during the demo
File ownership / overlaps checked: created scripts/integrations/{collect,config,bounded}.mjs,
  scripts/integrations/adapters/{encore,trading}.mjs, tests/integration-{collect,adapters}.test.mjs.
  All new. Codex's uncommitted .gitignore/index.html/sw.js/ui/midnight.css remain untouched and unstaged.
Changes and decisions:
  - SPEC anticipated GET /api/summary on the trading dashboard. That route does not exist. The real
    sensitive routes are /api/portfolio, /api/overview, /api/watchlist, /api/journal and /api/signals.
    The adapter calls /api/health only; tests assert the others are never requested.
  - /api/health returns watchlist, memory_cache_keys and recent_errors alongside the useful fields.
    recent_errors is raw tracebacks and can carry provider API keys. None are mapped, and the tests
    assert their absence from the serialised snapshot rather than trusting review.
  - Encore's job object carries a raw `error` string with local paths. Never forwarded; a failed scrape
    becomes status degraded + reasonCode invalid-data, and job.step is collapsed to a fixed vocabulary.
  - Encore's feed is 38,076 lots with retail/resale/profit/bid fields. Only `count` is mapped. No pricing
    is recomputed and no lot data leaves the laptop.
  - guardrailsActive defaults to FALSE when the guardrail block is missing or malformed: only an explicit
    orders_possible_from_dashboard === false is treated as safe.
  - Size caps enforced from content-length BEFORE the body is read (products 25 MiB, health 128 KiB),
    5s timeout, redirect:'error', max 2 sources in flight.
  - Config requires a bare origin, rejects credentials, non-http schemes and unregistered IDs. --out is
    refused inside the repository or any source root, so snapshots cannot reach the Pages artifact.
Commands run and actual results:
  node --test tests/integration-adapters.test.mjs -> 18 pass, 0 fail
  node --test tests/integration-collect.test.mjs  -> 18 pass, 0 fail
  node --test tests/*.test.mjs                    -> 177 pass, 0 fail (was 141 before T2/T4)
  node scripts/build-site.mjs --out <temp>        -> integrations/, scripts/, tests/, docs/ all absent
  CLI, private temp config and output:
    preview (no --out)      -> both sources unavailable, "preview only — nothing written"
    --out ./snapshots       -> refused, exit 1, "must not be inside the repository"
    --out <temp>, no servers-> 2 explicit failed-observation snapshots written
    --out <temp>, Encore up -> encore: ready, 2 metrics, itemCount 38076, jobState idle;
                               ai-trading-lab: unavailable/unreachable, 0 metrics
  Live encore.json contained only schemaVersion, sourceId, timestamps, status, reasonCode, the two
  metrics, empty links and the revision. No titles, URLs, prices or profit figures.
  Temp config and snapshot directory deleted after the demo.
Commit(s), or explicit uncommitted state: see git log; T4 commit follows 2aaeab4 on main, local only.
Remote and deployment state: NOT pushed, NOT deployed. origin/main still 5647209. The collector performs
  no cloud writes by design; publication is T6.
Phone verification: none, and none applicable. T4 ships no UI.
Failures / configuration still needed: none failing. Operator config path and real base URLs stay private
  and outside the repo. Host allowlists remain empty until a URL is verified in T6.
Next task and exact first action: T3 (fixture-backed Workspace view). First action is to write
  tests/integration-view.test.mjs asserting distinct ready/stale/unavailable/not-configured/reference-only
  text and literal rendering of an <img onerror=...> fixture label, and watch it fail before creating
  integrations/view.mjs.
Ownership released: yes.
```

## Session record — T3 (partial)

```text
Task ID and state: T3 — view, controller, fixtures and artifact allowlist done and tested. The
  index.html / sw.js wiring is NOT done and is blocked; see below.
Agent/session and UTC timestamp: Claude Code, 2026-09-08T01:06Z
Checkout path, branch, starting commit: phone-dashboard, main, 7d5f063 (T4)
File ownership / overlaps checked: created integrations/{view,controller,fixtures}.mjs and
  tests/integration-view.test.mjs; modified scripts/build-site.mjs (not touched by Codex).
  index.html and sw.js were deliberately NOT edited — see the blocker.
Changes and decisions:
  - mountWorkspace builds one section per registered source once, in registry order, and re-renders only
    the variable regions, so a malformed snapshot cannot blank its siblings. Per-section render is
    try/caught for the same reason.
  - No innerHTML anywhere in view.mjs. The contract stores hostile text verbatim on purpose so the
    escaping decision lives in exactly one place; a fixture carries <img src=x onerror=alert(1)> so that
    path is exercised on every run, not only in the test that remembers.
  - Links are re-validated in the view even though the contract already checked them: the contract guards
    what is stored, the view guards what is clicked, and the two drift when a registry allowlist changes.
  - No source has a verified host, so every live source renders "Available on laptop" rather than a
    localhost link that would resolve to the phone itself.
  - createFixtureTransport throws unless enabled:true is passed explicitly, and the view stamps a visible
    "Sample data — not live" badge whenever it renders fixtures.
  - Transport errors are swallowed in the controller and shown as fixed copy; a Firestore error naming a
    uid or path must never reach the screen.
  - The controller owns a ticker because expiry is a clock event, not a data event: without it a card sits
    on "Ready" after the laptop sleeps. Cleanup is idempotent and clears the container.
  - build-site publishes the four browser modules but NOT fixtures.mjs, so sample data is not shippable.
    They were deliberately left OUT of REQUIRED_FILES: nothing imports them until the shell is wired, and
    making them required now breaks the site-build fixture for no benefit. They join REQUIRED_FILES in the
    same change that makes index.html depend on them.
Commands run and actual results:
  node --test tests/integration-view.test.mjs -> 18 pass, 0 fail
  node --test tests/*.test.mjs                -> 195 pass, 0 fail
  node --test tests/midnight.test.cjs         -> 20 pass, 0 fail
  build-site --out <temp> -> 20 entries; integrations/{registry,contract,view,controller}.mjs present;
    fixtures.mjs, scripts/, tests/, docs/ all absent.
Commit(s): this session's T3 commit follows 7d5f063 on main, local only.
Remote and deployment state: NOT pushed, NOT deployed. origin/main still 5647209.
Phone verification: none yet — there is no Workspace entry to open until the shell wiring lands.
BLOCKER — shell wiring: index.html and sw.js still carry Codex's uncommitted visual-refresh changes
  (index.html +9, sw.js cache v8->v9, ui/midnight.css +26, .gitignore +1; 37 lines total). STATUS records
  that refresh as finished and published, and lists no active owner, but the work was never committed.
  Editing those files now would fold Codex's lines into a Claude commit, so the remaining T3 steps were
  stopped rather than tangled. Unblock by committing Codex's change on its own first; then add the
  Workspace nav entry, lazy-load on entry after auth, bump the cache version once, and add the four
  modules to REQUIRED_FILES.
Next task and exact first action: commit Codex's 37 uncommitted lines as their own attributed commit,
  then add the Workspace entry to index.html leaving Today as default.
Ownership released: yes, for the module work. The shell wiring is unclaimed and blocked.
```

## Session record — T3 (completed)

```text
Task ID and state: T3 complete. Blocker cleared, shell wired, verified in a real browser at 390px.
Agent/session and UTC timestamp: Claude Code, 2026-09-08T01:22Z
Checkout path, branch, starting commit: phone-dashboard, main, 29bcc3c (T3 part 1)
Blocker resolution: Codex's visual refresh was committed first, on its own, as 962cb2a, attributed to
  Codex in the message with no lines changed. That freed index.html and sw.js for this task.
Changes and decisions:
  - Workspace is reached from More, not a fifth nav button: the phone nav has four slots and Today stays
    the default. ui/midnight.mjs maps the workspace tab to the More highlight.
  - Modules are imported dynamically on first entry, so Today's load cost is unchanged. draw() only runs
    after auth, so a signed-out visitor cannot trigger the import. Leaving the tab or signing out calls
    the controller cleanup, which clears the container: private snapshots are not left on screen.
  - There is no transport yet (T6). Rather than showing fixtures, production subscribes to an empty
    transport and every source honestly reports that nothing has been published.
  - Fixtures require BOTH location.hostname === 'localhost' AND ?fixtures=1. The deployed origin can
    therefore never render sample data as live, and the badge is shown whenever they do render.
  - Reference sources now read "Reference only" even with no snapshot. They are pointers, not services;
    "No data yet" implied one was pending.
  - The derived state is exposed as a data attribute so CSS can colour it. Colour is additive only — the
    wording already distinguishes every state, which the tests assert independently.
  - sw.js precaches the four browser modules and moves to midnight-v10 (one bump). Snapshot DATA is
    deliberately not cached: it is private and must not outlive a sign-out.
  - build-site now REQUIRES the four modules, since the shell imports them; the site-build fixture was
    extended to match. fixtures.mjs is still excluded from the artifact.
Commands run and actual results:
  node --test tests/integration-view.test.mjs -> 20 pass, 0 fail
  node --test tests/*.test.mjs                -> 197 pass, 0 fail
  node --test tests/midnight.test.cjs         -> 20 pass, 0 fail
  index.html module script parse-checked as ESM -> OK
  build-site --out <temp> -> 20 entries; four modules present; fixtures.mjs, scripts/, tests/, docs/ absent
  Browser, 390x844, temporary same-origin harness with fixtures, deleted afterwards:
    no console errors; no horizontal overflow; hostile label rendered as literal text with 0 <img>
    elements; 0 anchors because no host is allowlisted, "Available on laptop" shown instead;
    computed state colours distinct — ready rgb(79,216,235), degraded rgb(232,161,60),
    unavailable/not-configured/reference-only rgb(138,148,173).
Commit(s): T3 shell wiring commit follows 962cb2a on main, local only.
Remote and deployment state: NOT pushed, NOT deployed. origin/main still 5647209.
Phone verification: NOT done. The Workspace tab is behind Firebase auth and the agent does not hold the
  password. Browser verification used a same-origin harness mounting the real modules, not the authed tab.
  Satya should open More > Workspace on the phone and confirm nine cards, all reading "No data yet" or
  "Reference only" until T6 publishes anything.
Failures / configuration still needed: none failing. Local preview port moved 63350 -> 8123 in the
  workspace .claude/launch.json because 63350 is in a Windows reserved range; that file is outside Git.
Next task and exact first action: T5 (remaining apps and references) or T6 (authenticated transport).
  T6 first action is to inspect the deployed Firestore rules baseline before writing any rule.
Ownership released: yes.
```

## Deployment record — T2, T3, T4

```text
Pushed 5647209..0987476, then 9645dca. Deployed by Pages run 34178891124 (success, 22s).

FIRST ATTEMPT FAILED. Run 34178821329 failed on `node --test tests/*.test.mjs` with
"Cannot find module 'jsdom'". The workflow had no install step; jsdom is pinned in
tests/package.json, but until now nothing in the .mjs suite imported it — the existing DOM test is
midnight.test.cjs, which this workflow does not run — so the gap was invisible.
tests/integration-view.test.mjs was the first .mjs test to need it. Fixed by 9645dca, which adds
`npm ci --prefix tests`. No new dependency; the DOM tests now genuinely run in CI instead of being
silently skipped. No schedule trigger and no secrets were introduced. The failed run published
nothing, so production was never in a broken state.

Live verification against https://satyagaurav7.github.io/phone-dashboard/ :
  200  index.html
  200  integrations/{registry,contract,view,controller}.mjs
  404  integrations/fixtures.mjs          sample data is not shippable
  404  scripts/integrations/collect.mjs   collector stays local
  404  tests/integration-view.test.mjs
  404  docs/integration/STATUS.md
  sw.js serves midnight-v10.
  In-browser at 390x844: all four modules import from the production origin, fixtures.mjs rejects,
  auth gate renders, no console errors.

Phone verification still outstanding and still requires the account holder: the Workspace tab is
behind Firebase auth. Expect nine cards reading "No data yet" or "Reference only" — correct until T6
publishes anything, because no transport exists yet.

Integration reality check for the ledger: 9 sources are registered and render. 2 have working
collectors (encore, ai-trading-lab). 3 still need collectors (sleepforge, fanbox-downloader,
graphify) and are T5. 4 are reference entries by design and will never have collectors. Nothing
reaches the phone until T6.
```

## Next action

T6 (authenticated snapshot transport) is the highest-value next task: without it every Workspace card stays empty. First action is to inspect the deployed Firestore rules baseline before writing any rule. T5 adds the remaining three collectors for the Encore and trading adapters, or T3 for the Workspace UI. Both dependencies are now met.

## Evidence from planning

- Existing Phone Dashboard instructions, product, handoff, deploy workflow and service worker inspected.
- Encore `/api/products` and `/api/status` handlers inspected; earlier proposal to invent a health endpoint is unnecessary for the initial slice.
- Trading `/api/summary` inspected: invokes providers and can reveal portfolio data. Default adapter uses health only and strips watchlist, cache keys, and raw errors.
- Sleepforge ledger code locations and downloader manifest mechanism identified; their schemas require bounded fixture inspection at implementation time.
- Existing HANDOFF says nudges default off and habit penalties removed. Older reports/product wording must not override that current evidence.
- Graphify hooks absent in all three audited repositories. Hook installation is a planned option, not a completed integration.

## Session record template

Append one section per implementation handoff. Replace the descriptive values with actual evidence; never mark a planned test as passed.

```text
Task ID and state:
Agent/session and UTC timestamp:
Checkout path, branch, starting commit (per repo):
File ownership / overlaps checked:
Changes and decisions:
Commands run and actual results:
Commit(s), or explicit uncommitted state:
Remote and deployment state:
Phone verification:
Failures / configuration still needed:
Next task and exact first action:
Ownership released:
```

## Outstanding rollout configuration

Execution will identify the existing Firebase rules baseline and owner UID through authorized local configuration, the publisher credential source, and verified source URLs. These values belong in private operator configuration, not this file. Local tasks do not depend on acquiring live credentials.
