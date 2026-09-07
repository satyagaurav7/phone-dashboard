# Day board as the execution surface — design

Date: 2026-09-08
Baseline: `main` at `39bd500`, clean tree, 85/85 + 17/17 tests, deployed.
Status: **design for approval. Nothing implemented.**
Supersedes presentation decisions in the 2026-09-07 optimization review §3; keeps
its findings. The eight defects already fixed in `a59bb46` and `39bd500` are not
revisited.

---

## 0. Decisions taken (Satya, 2026-09-08)

| # | Decision |
|---|---|
| 1 | **Now/Next controller** with Timeline and Checklist as peer views over the same occurrence records. Not one chronological stream. |
| 2 | The day's meaningful outcome comes from **standing projects with a next-step ladder**, each step carrying a written done condition. |
| 3 | Week confirmed: **Mon/Tue office, Wed–Fri WFH**. Office work **09:00–17:00**, drive **under 20 min** each way, asleep by **23:00**. **No fixed weekly commitments.** |
| 4 | Chore scoring **rebalanced and capped**: `+8` on time, `+1` late, `−5` per outstanding chore per day, **capped at −20/day**. |
| 5 | The planner may re-time **everything except the fixed set** without asking. |
| 6 | **Scored windows never move.** Auto-fail stays real; an infeasible day is reported as infeasible. |
| 7 | **Gym window is 2.5 hours.** |
| 8 | Google Tasks: consent is necessary but not sufficient. **Live writes stay disabled.** |

---

## 1. Two schedule facts that forced changes

Computed from the saved schedule against the answers above, not estimated.

**The office evening was arithmetically impossible.** Gym plus everything after it
totalled **345 minutes** against the **340 minutes** that exist between arriving
home (~17:20) and being asleep at 23:00. Wind-down ended at 23:15 — fifteen
minutes past the target. Every office day overran sleep by design.

**The morning holds 65 minutes of dead buffer.** The saved departure is 07:30 for
a 09:00 start with an under-20-minute drive. Leaving at ~08:35 suffices.

A 2.5-hour gym window resolves the first: 315 minutes scheduled against 340
available, leaving **25 minutes of genuine slack**. The second is addressed in
§6 as a proposal, because it moves a scored block and that is Satya's call.

### Office day, revised (this ships)

| Block | Window | Minutes | Items |
|---|---|---:|---|
| Morning | 06:15–07:00 | 45 | anchor, walk, water, meditate, getready |
| Fuel + meds | 07:00–07:30 | 30 | breakfast, insulin, omega3, bonehealth, vitcd |
| *(free)* | *07:30–08:35* | *65* | *unallocated — see §6* |
| Midday | 12:15–13:15 | 60 | lunch |
| **Gym** | **17:30–20:00** | **150** | gym |
| Evening | 20:00–21:15 | 75 | cookmeal, dinner, cooked, read5, language |
| Deep work | 21:15–22:00 | 45 | study, money |
| Wind-down | 22:00–22:45 | 45 | creatine, smokefree, phonedown |

Slack: 10 min (home → gym) + 15 min (wind-down → asleep). Item times move with
their windows; `assertSchedule` already refuses any item outside its own block,
so the drift that caused this cannot recur silently. WFH, Saturday and Sunday
keep 3-hour gym windows — only the office day was over-committed.

---

## 2. Architecture: `dayplan.mjs`

A new **pure, deterministic** module. No AI scheduler, no second task database.
It reads existing records and returns a plan; it writes nothing.

```js
export function planDay({
  sched,        // schedule.json
  state,        // FLOWSTATE state (days, chores, projects, config)
  today,        // 'YYYY-MM-DD', Toronto
  nowMin,       // minutes since local midnight
  dayKind,      // 'office' | 'wfh' | 'sat' | 'sun'
  busy = [],    // verified immovable intervals: work, appointments
  nowTs,        // epoch ms, for machine estimates
}) // -> DayPlan
```

```js
DayPlan = {
  heading,            // one date line + source freshness. One <h1> on the page.
  freshness,          // {savedAt, stale:boolean} — never claims sync it lacks
  outcome,            // {projectId, step, doneWhen, firstStep, estimateMin, state}
  now,                // ONE action: {kind, id, title, firstStep, estimateMin,
                      //  startsAt, finishesAt, source} | null
  next,               // {kind, id, title, startMin, leaveByMin} | null
  background,         // [{choreId, stageId, label, readyAt, overdueEstimate}]
  timeline,           // [{startMin, endMin, kind, id, title, movable, fixedReason}]
  checklist,          // blocks + chores, the same occurrence records regrouped
  conflicts,          // [{a, b, kind:'overlap'|'no-transition', reason}]
  unscheduled,        // [{id, title, reason}]  — never silently dropped
  remainingActiveMin, // effort still owed today
  freeCapacityMin,    // real minutes left, after fixed intervals and transitions
  feasible,           // remainingActiveMin <= freeCapacityMin
  stopping,           // {met:boolean, reason}
}
```

`now` is chosen by: an open scored window with unlogged items → else the
outcome's next step if capacity allows → else the highest-value due chore that
fits → else a break. **It is never an invented low-value chore to fill a gap.**

### Immovability, encoded as data not convention

```js
const FIXED = ['scored-window', 'work', 'sleep', 'appointment', 'medication'];
```

`planDay` throws if asked to move anything whose kind is in `FIXED`. Decision 6
makes scored windows immovable, so auto-fail cannot be defeated by replanning.
Medication items are fixed for a different reason and it is not a scoring one:
the app must never shift care timing to satisfy points (CLAUDE.md rule 6).

### Scheduling rules the planner enforces

- Never two attention-heavy items in the same minutes.
- Passive overlap allowed **only** for machine waiting — a running washer may
  overlap anything; a running washer is not active work and never counts toward
  `remainingActiveMin`.
- 10-minute transition between unrelated active tasks; travel added explicitly.
- Context batching: `kitchenclose` after `cooked`; `gymbag` after the gym block;
  `stock` before the Saturday grocery slot.
- Sleep and the 25 minutes of slack are reserved, not fillable.
- Nothing is scheduled while driving.
- Existing prep, cleanup and weekly admin already inside a routine block are not
  counted a second time as chore minutes.
- **Infeasible is shown, never compressed.** When `remainingActiveMin >
  freeCapacityMin`, the plan reports it and lists what does not fit and why.

---

## 3. The phone surface (375px)

One `<h1>`. Today's second heading, the duplicate activity logger and the
"Google Tasks not connected" links block are removed from `midnight.today` —
they are three write paths to one record and a dead link.

```
┌──────────────────────────────────────┐
│ Monday 8 September     Saved · 2m ago│   heading + freshness
│                                      │
│ WORTH DOING                          │
│ Finish CELPIP writing task 2         │   outcome, prominent
│ Done when: 250 words written & saved │   done condition, always shown
│                                      │
│ ──────────────────────────────────── │
│ NOW                                  │
│ Draft the opening paragraph          │   ONE action
│ 25 min · finishes ~14:40             │
│ First step: open the saved prompt    │
│ [ Start ]              [ Done ]      │
│ ──────────────────────────────────── │
│ NEXT   Transfer laundry      ~14:55  │
│ BG     Washer running · ready ~14:55 │   passive, not "work"
│ ──────────────────────────────────── │
│ 65 active min left · 90 min free  ✓  │   capacity, honestly
│ [Timeline] [Checklist]   [Adjust day]│
└──────────────────────────────────────┘
   ▼ below the fold
   Timeline ─ chronological, or Checklist ─ by block
   Later ▸ (collapsed)      Done ▸ (collapsed)
   Balance −23 · 2 chores open ▸ (compact, expandable)
```

When infeasible the capacity line inverts and states the deficit:
`95 active min left · 60 min free — 35 min will not fit`, with the overflow
named in Later, each carrying its reason.

Timeline and Checklist are two renderings of `DayPlan.timeline` and
`DayPlan.checklist`, both built from the same occurrence records. Tapping a
block shows its items; tapping a chore shows its steps. **Starting never
completes.** Failed blocks and real deadlines stay visible in both views:
prominence changes, truth does not.

### Adjust day

Shows three columns — **stays**, **moves**, **will not fit** — each with a
reason, and a single Accept. Scored windows always appear under *stays* with the
reason "scored window — moving it would change what fails today". A day off is
declared here, and remains reachable in blackout (fixed in `39bd500`).

### Recovery and the stopping condition

Lateness never hides history. A failed block stays failed and visible; recovery
means the planner re-fits what is still movable around it.

`stopping.met` is true when every scored window is passed or closed, the
outcome's done condition is ticked, and no chore due today is outstanding. The
board then says **"Enough for today"** and stops proposing work. Slack is not
refilled. This is the explicit answer to "when is enough done".

---

## 4. Meaningful outcome: standing projects

New state, additive:

```js
S.projects = {
  celpip: {
    title: 'CELPIP writing band 10',
    active: true,
    ladder: [
      { step: 'Finish writing task 2', doneWhen: '250 words written and saved',
        firstStep: 'Open the saved prompt', estimateMin: 45, done: false },
    ],
  },
}
S.days[date].outcome = { projectId, stepIndex, startedAt, doneAt }
```

Rules: 2–4 active projects. The board proposes the top undone step of the
project least recently worked; you confirm or pick another. **A step without a
`doneWhen` cannot be selected** — that is the mechanism that stops "Upskill
hour" being an acceptable answer. Ladders are seeded once by you; the app never
invents a step, because it cannot know what is worth doing.

The existing `checkIns.firstStep` remains for reflection and is no longer the
outcome mechanism — one record, one purpose.

---

## 5. Chore rebalance

`CHORE_POINTS` becomes `{ onTime: 8, late: 1, outstandingPerDay: -5 }` plus
`CHORE_DAILY_FLOOR = -20`, applied to the negative portion of each day only.

| One week | now | after |
|---|---:|---:|
| A. everything on its day | +165 | **+350** |
| B. dailies 5/7, weeklies done | **−31** | **+108** |
| C. dailies only | −101 | +39 |
| D. nothing | −325 | **−140** (blackout in ~2.5 days) |

The cap means one day of complete household neglect costs exactly the four
daily chores. Weeklies stacked on the same day do not compound further.
Historical days are recomputed under the new constants because the ledger is
derived, not stored; this is stated in the release note rather than hidden.

---

## 6. Proposal requiring approval: move Deep work to the morning

Not implemented without a yes.

Deep work currently sits at 21:15–22:00 — after a gym session and dinner, at the
end of an office day. The 65 free morning minutes are unused. Moving it:

| | Evening (ships now) | Morning (proposed) |
|---|---|---|
| Deep work | 21:15–22:00, tired | 07:35–08:20, fresh |
| Wind-down | 22:00–22:45 | 21:30–22:15 |
| Slack before sleep | 15 min | 45 min |

The cost is a firmer 08:35 departure. This changes a scored window's times, so
it is a schedule decision, not a planner action.

---

## 7. Phases, each reviewable and separately verified

1. **Canonical schedule + conflict validation.** Office times to §1;
   `assertSchedule` gains overlap and capacity checks; chore rebalance and cap.
   Tests first. No UI change.
2. **`dayplan.mjs` + fixtures.** The pure planner and its tests. No UI change.
3. **Unified Day board.** One heading, controller, Timeline/Checklist, collapsed
   Later/Done, compact balance. Removes the duplicate logger and dead links.
4. **Adjust day + feasibility.** Preview, reasons, undo.
5. **Projects and outcome selection.**
6. **Authenticated Google Tasks round trip.** Gated; see §8.
7. **Two-week timing and capacity pilot**, then revisit constants with real data.

Each phase: tests first for correctness changes; full suite plus public build;
mobile checks at 320/375/430 and desktop; focus, scroll and expanded sections
preserved across the per-minute countdown redraw (the focus fix in `1906862`
must keep passing); STATUS updated with concrete evidence; commit and push only
after the phase is verified; watch the deployment before calling it live.

---

## 8. Boundaries carried forward

- **Beeminder stays unarmed.** No phase arms it.
- **Google writes stay disabled.** Consent is necessary but not sufficient:
  `tasks-sync.mjs` still needs authenticated FLOWSTATE state, Toronto dates
  rather than UTC, real completion timestamps, persisted inbound completions,
  runtime `retryDecision`, and reopen/deletion reconciliation. Phase 6 is not
  complete when OAuth works.
- No scheduled publishers, no new reminder channels, no policy changes without
  explicit approval.
- No credentials and no private task content in the repository or the artifact.
- Chores move the balance only; `evaluateDay` never sees them, so nothing here
  can make a missed chore cost real money.
- Medication timing is never adjusted to satisfy scoring.

## 9. Open, deliberately unresolved

- Washer and dryer cycle lengths are still the 60-minute planning estimate.
  Replace with the machine display when known; the plan is padded, not accurate.
- Bin collection day unknown, so `waste` stays "when needed" rather than a
  scheduled deadline.
- Whether the penalty motivates at all is unmeasured. Phase 7 exists to find out
  rather than to assume.
