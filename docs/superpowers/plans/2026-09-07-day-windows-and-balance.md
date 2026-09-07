# Day windows, auto-fail, and the balance economy

**Status:** specification + implementation plan. Nothing here is built yet.
**Audience:** an implementing agent (ChatGPT or otherwise) with no prior context
on this repository. Read this file top to bottom before editing anything.
**Owner decisions:** every rule in "Decided behaviour" was chosen explicitly by
Satya on 2026-09-07. Do not soften, re-litigate, or "improve" them.

---

## 0. Read first

Before writing code, read:

- `CLAUDE.md` — repository safety rules. Several apply directly to this work.
- `index.html` lines ~560-700 — the existing momentum engine and state model.
- `schedule.json` — `tapPlan.itemTimes` is the source of the times below.
- `scripts/notify.mjs` — the push sender.
- `scripts/build-site.mjs` — the publish manifest. A new file is NOT published
  unless it is added to `PUBLIC_FILES`.

### Constraints that are not negotiable

1. **This feature reverses a prior product rule on purpose.** `index.html`
   documents "Absence is not a debt" and the deliberate removal of a
   momentum-drift penalty. Satya has now asked for an explicit failure
   mechanic. Implement it. Do not restore the old drift penalty as well — the
   new balance replaces it, and momentum stays reward-only and untouched.
2. **Medication copy stays neutral.** `insulin`, `omega3`, `bonehealth` and
   `vitcd` fail like any other item (Satya's choice), but the app must never
   phrase this as medical instruction, urgency, or advice. "Not logged" is
   acceptable. "Take your insulin" is not. See CLAUDE.md rule 6.
3. **No Google writes.** This feature touches the local/Firestore record only.
   Do not enable, re-enable, or extend Calendar/Tasks publishing.
4. **Nothing personal becomes public.** Anything added to `PUBLIC_FILES` in
   `scripts/build-site.mjs` is served on the open internet. Block titles and
   times live in `schedule.json`, which is already public — keep them generic
   ("Fuel + meds"), never health detail or addresses.

---

## 1. Decided behaviour

| Question | Decision |
|---|---|
| Window shape | Named blocks with explicit start/end, grouping items |
| Missing an item at close | Block **fails permanently** for that day |
| Late logging | Allowed, records as `late`, gives reduced credit, does **not** rescue the block or the day |
| Day verdict | Day passes only if **every** block passed |
| Economy | **One signed balance.** It can go negative |
| Escape hatch | A **day off**, declared *before* the day's first window opens |
| Timers | Live countdown to the current window's close |
| Alarms | Push at window open, T-15 before close, and at close |
| Alarm delivery | GitHub Actions cron every 10 minutes |
| Gym | **3-hour window** |

### Balance table

| Event | Δ |
|---|---|
| Item logged inside its window | +2 |
| Item logged late (same day, after close) | +1 |
| Block clean (all its items in-window) | +5 |
| Block failed | **-8** |
| Day clean (all blocks passed) | +20 |

States: `>= 0` normal · `< 0` **in debt** (red-shifted UI, deficit in header,
cosmetic unlocks locked) · `< -50` **blackout** (UI strips back to logging only
until the balance returns above zero).

---

## 2. The blocks

Derived from the existing `tapPlan.itemTimes` in `schedule.json`. Every item
that appears in `itemTimes` for a day kind must appear in exactly one block for
that day kind — a startup assertion enforces this (§4.4).

**Blocks may overlap.** The 3-hour gym window runs through other blocks on WFH
and Sunday. This is fine: each block is evaluated independently. Overlap is
purely a UI concern (§5.2).

### office

| Block | Window | Items |
|---|---|---|
| Morning | 06:15-07:00 | anchor, walk, water, meditate |
| Fuel + meds | 07:00-07:30 | breakfast, insulin, omega3, bonehealth, vitcd |
| Midday | 12:15-13:15 | lunch |
| Gym | 17:30-20:30 | gym |
| Evening | 20:30-21:45 | cookmeal, dinner, cooked, read5, language |
| Deep work | 21:45-22:30 | study, money |
| Wind-down | 22:30-23:15 | creatine, smokefree, phonedown |

### wfh

| Block | Window | Items |
|---|---|---|
| Morning | 06:45-07:15 | anchor, walk, water |
| Gym | 07:00-10:00 | gym |
| Fuel + meds | 08:30-09:30 | breakfast, insulin, omega3, bonehealth, vitcd |
| Midday | 12:15-13:30 | cookmeal, lunch |
| Afternoon | 17:00-18:30 | read5, language, study, money |
| Evening | 19:00-20:15 | dinner, cooked |
| Wind-down | 21:00-22:15 | meditate, creatine, smokefree, phonedown |

### sat

| Block | Window | Items |
|---|---|---|
| Morning | 09:00-09:45 | anchor, walk, water |
| Fuel + meds | 09:15-10:00 | breakfast, insulin, omega3, bonehealth, vitcd |
| Midday | 12:45-14:00 | cookmeal, lunch |
| Deep work | 14:00-15:00 | study, money |
| Gym | 14:00-17:00 | gym |
| Evening | 19:15-20:30 | dinner, cooked |
| Wind-down | 20:45-22:45 | read5, language, meditate, creatine, smokefree, phonedown |

### sun

| Block | Window | Items |
|---|---|---|
| Morning | 09:30-10:15 | anchor, walk, water |
| Fuel + meds | 09:45-10:45 | breakfast, insulin, omega3, bonehealth, vitcd |
| Gym | 10:30-13:30 | gym |
| Midday | 12:45-13:45 | lunch |
| Afternoon | 14:45-17:30 | read5, language, study, money |
| Evening | 17:45-19:45 | cookmeal, dinner, cooked |
| Wind-down | 21:00-22:30 | meditate, creatine, smokefree, phonedown |

`smokefree` and `phonedown` are whole-day / end-of-day confirmations rather than
timed acts. They sit in Wind-down and are confirmed there. Do not give them
separate windows.

---

## 3. Architecture: derive, don't store

**The single most important decision in this document.**

The app already writes a tap timestamp for every item into `S.days[date].log`
(added by the hydration/rhythm work in `index.html`). Block results are
**computed** from those timestamps against the block schedule. They are never
stored as flags.

The consequences, all of them desirable:

- No dependence on the app being open at the moment a window closes.
- The browser and the notification server reach identical verdicts by calling
  the same function.
- Re-opening an old day recomputes the same result — no drift, no repair path.
- Balance is a pure fold over days; there is no counter to get out of sync.

The only genuinely new persisted state is `S.dayOff` and two config fields.

### New state (additive; never change an existing field's meaning)

```js
S.dayOff = {};            // { "2026-09-11": { declaredAt: <epoch ms> } }
S.config.windowsStart     // "YYYY-MM-DD" — first day this feature scores.
                          //   Days before it are excluded: they have no
                          //   timestamps and must not be retro-scored.
S.config.windowsEnabled   // boolean, default false until Phase 5.
```

`S.days[date].log` keeps its current shape: `{ <itemKey>: <epoch ms> }`. Do not
migrate it.

---

## 4. `rules.mjs` — the shared engine

Create `rules.mjs` in the repository root. It is the one source of truth for
window and balance logic, imported by **both** the browser and the sender.

This deliberately fixes an existing maintenance problem: the momentum constants
are currently duplicated between `index.html` and `scripts/notify.mjs`, and the
comments in both files say they must be hand-kept in sync. Do not duplicate the
new constants the same way.

### 4.1 Loading it from `index.html`

`index.html` runs one large inline non-module script. Do **not** convert it to a
module. Load the rules with a dynamic import at boot, alongside the existing
`schedule.json` fetch, and await it the same way:

```js
const RULES = await import('./rules.mjs');
```

Add `rules.mjs` to `PUBLIC_FILES` and to `REQUIRED_FILES` in
`scripts/build-site.mjs`, and extend `tests/site-build.test.mjs` to cover it.
`scripts/notify.mjs` imports it as `../rules.mjs`.

### 4.2 API

```js
export const POINTS = { inWindow: 2, late: 1, blockClean: 5, blockFail: -8, dayClean: 20 };
export const DEBT_FLOOR = 0;       // below this: "in debt"
export const BLACKOUT_FLOOR = -50; // below this: "blackout"

// Blocks for a day kind, from schedule.json. Returns [] for an unknown kind.
export function blocksFor(sched, dayKind)          // -> Block[]
// Block = { id, title, startMin, endMin, keys: string[] }
// startMin/endMin are minutes since local midnight. endMin > startMin always;
// no block may cross midnight (assert this — see §4.4).

// Evaluate one day. `nowMin` is the local wall clock in minutes, or null for a
// day already in the past (in which case every window is treated as closed).
export function evaluateDay({ sched, dayKind, day, dateStr, nowMin, isDayOff })
// -> DayResult = {
//      off: boolean,
//      blocks: [{ id, title, startMin, endMin,
//                 state: 'upcoming' | 'open' | 'passed' | 'failed',
//                 items: [{ key, state: 'pending' | 'inWindow' | 'late' | 'missed' }],
//                 closesInMin: number | null }],
//      verdict: 'off' | 'pending' | 'passed' | 'failed',
//      delta: number   // this day's contribution to the balance
//    }

// Fold over every day from config.windowsStart through `today` inclusive.
export function balance({ sched, state, today })
// -> { total, states: { ... }, tier: 'normal' | 'debt' | 'blackout' }

// Edges falling in the interval (prevMin, nowMin] on `dateStr`. Used by the sender.
export function dueEdges({ sched, dayKind, day, prevMin, nowMin, isDayOff })
// -> Edge[] = { kind: 'open' | 'warn' | 'close', blockId, title, remaining: string[] }
// 'warn' fires 15 minutes before endMin.
```

### 4.3 Item state rules

For item key `k` in block `b` on day `d`, with `ts = d.log?.[k]` and the item's
existing boolean `d[k]`:

- `ts` exists and falls within `[startMin, endMin]` local → `inWindow`.
- `d[k] === true` but `ts` is missing or outside the window → `late`.
- Window still open, not logged → `pending`.
- Window closed, not logged → `missed`.

A block is `passed` when it is closed with zero `missed` items, and `failed`
when it is closed with one or more. **An open block is neither** — it is `open`,
and contributes nothing to the balance until it closes.

Day delta:

```
sum over items:   inWindow -> +2,  late -> +1
sum over blocks:  passed   -> +5,  failed -> -8
if every block passed:             +20
if isDayOff:                        0, and no block contributes anything
```

### 4.4 Startup assertions

`rules.mjs` must throw on a malformed schedule rather than silently mis-score:

- Every key in `tapPlan.itemTimes[kind]` appears in exactly one block for that
  kind. Report the offending key and kind.
- No key appears in two blocks for the same kind.
- Every block has `endMin > startMin` and `endMin <= 24*60`.

Run these once at load, not per render.

---

## 5. `index.html` changes

### 5.1 `schedule.json`

Add `tapPlan.blocks`, keyed by day kind, with entries
`{ "id", "title", "start": "HH:MM", "end": "HH:MM", "keys": [...] }`, using the
tables in §2. Leave `tapPlan.itemTimes` in place — it still drives the existing
suggested-tap-time UI. Leave `tapPlan.slots` in place for now; retire it in
Phase 6, once the nudge sender no longer reads it.

### 5.2 Right Now tab

Add a **Day board** above the existing content:

- One row per block, in start order: title, `HH:MM-HH:MM`, item pips, state.
- The **current block** — of the blocks currently open, the one closing
  soonest — is expanded and carries a live countdown, `closes in 14:32`,
  ticking once per second. Under 15 minutes it turns amber; under 5, red.
- Because gym overlaps, render any *other* open block as a thin parallel bar
  beneath the current one, with its own short countdown. Do not hide it.
- Failed blocks stay visible, struck through, showing their `-8`.
- Upcoming blocks show `opens in 2h 40m`.
- Day header: verdict chip (`PENDING` / `PASSED` / `FAILED` / `OFF`), today's
  running delta, and the overall balance.

### 5.3 Logging

Item taps continue to write `d[k] = true` and `d.log[k] = Date.now()` exactly as
they do today. Nothing about the tap path changes. When a tap lands after its
window has closed, show a toast: `Logged late · +1 · <Block> already failed`.

### 5.4 Balance and tiers

- The header shows the balance persistently. Negative renders in `--danger`
  with an explicit sign.
- `debt` tier: apply a red-shifted variable override on the existing mood layer,
  and lock the cosmetic pickers that read `S.rewards.skin` / `.mood`.
- `blackout` tier: hide every tab except Right Now, strip the mood layer to a
  flat dark ground, and show one line explaining what clears it — the balance
  returning above zero. Logging must remain fully functional in blackout. Never
  block the user from recording what they actually did.

### 5.5 Day off

A control in Settings: **Declare a day off**, for today or any future date. It
is refused for today once the day's first window has opened — check
`nowMin < min(startMin)` and say so plainly when refusing. Declaring writes
`S.dayOff[date] = { declaredAt: Date.now() }` through the existing `Dash.set`
patch path so that it syncs. A declared day off can be withdrawn only while it
is still in the future.

### 5.6 History

The existing history / day-inspect view gains a per-day verdict chip and delta.
Days before `config.windowsStart` render as `—`, not as failures.

---

## 6. Notifications

### 6.1 `.github/workflows/notify.yml`

Replace the ten DST-paired hourly crons with a single `*/10 * * * *`. Keep
`concurrency: { group: notify, cancel-in-progress: false }` and keep
`workflow_dispatch`. Delete the DST-pairing comment and replace it with an
honest one: cron still lands late, but a 10-minute cadence bounds the lateness
to roughly 10-25 minutes instead of 90.

### 6.2 `scripts/notify.mjs`

- Import `rules.mjs`; delete the locally duplicated `SMALL_KEYS`, `BIG_KEYS`
  and `dayGains`, and call the shared exports instead.
- Each run: read Firestore `dashboard/satya`, compute the Toronto wall-clock
  `nowMin`, read `notifyLog.lastEdgeMin` for today, call `dueEdges` with
  `prevMin = lastEdgeMin` (or the day's first block start on the first run of
  the day), send one push per edge, then write back `lastEdgeMin = nowMin`.
- **Dedupe key:** `edge:<date>:<blockId>:<kind>`, recorded in `notifyLog`. A
  replayed or overlapping run must never double-send. Test this explicitly.
- **Catch-up cap:** if a run finds more than three due edges — the cron was
  down, or the phone was off for hours — send one summary push instead of a
  burst. Nobody wants nine notifications at once.
- Copy, in exactly this register:
  - open: `Morning open until 07:00 · 4 items`
  - warn: `Morning closes in 15 min · 2 left`
  - close, failed: `Morning failed · walk, water not logged · -8`
  - close, passed: **no push.** Silence is the reward.
  - day end: `Day passed · +95 · balance 340` / `Day failed · 2 blocks · balance 218`
- Respect the existing `S.prefs.snoozeUntil`, and add `prefs.notifyWindows`
  (default **on** — this is the point of the feature). Window pushes are
  discretionary app pushes and must obey snooze like the others.
- Send nothing at all on a declared day off.

---

## 7. Tests

New `tests/rules.test.mjs`, run with `node --test`, wired into
`.github/workflows/deploy.yml` beside the existing site-build test. Cover:

1. Item inside its window → `inWindow`, +2.
2. Item logged after close → `late`, +1, and the block is still `failed`.
3. Block open and incomplete → `open`, contributes 0.
4. Clean day across all seven blocks → all `passed`, `+20` bonus applied.
5. One missed block → `verdict: 'failed'` even with every other block clean.
6. Day off → `verdict: 'off'`, `delta === 0`, and zero edges from `dueEdges`.
7. `balance` excludes days before `config.windowsStart`.
8. Blackout boundary: `-50` is `debt`, `-51` is `blackout`.
9. The overlapping gym block on WFH evaluates independently of Fuel + meds.
10. `dueEdges` is exclusive on `prevMin` and inclusive on `nowMin` — across
    consecutive runs no edge is ever emitted twice, and none is skipped.
11. The schedule assertions throw when a key is missing from every block, and
    when it appears in two.

Extend `tests/site-build.test.mjs` to assert that `rules.mjs` is published.

---

## 8. Phases

Ship in this order. Each phase leaves `main` deployable.

1. **`rules.mjs` + tests.** No UI, no sender changes, nothing user-visible.
   Land the engine and its test suite first. This is the phase to get right.
2. **`schedule.json` blocks** for all four day kinds, with the §4.4 assertions
   passing against the real file.
3. **Read-only UI.** The day board renders live state and countdowns. Balance
   is displayed but carries no consequence — no tier styling, no locking.
4. **Consequences.** Debt and blackout tiers, cosmetic locking, day-off control.
5. **Notifications.** The `*/10` cron and the edge sender. Flip
   `config.windowsEnabled` and set `config.windowsStart` to the go-live date.
6. **Cleanup.** Retire `tapPlan.slots` and the old slot-nudge path in
   `notify.mjs`, now superseded by window edges.

---

## 9. Acceptance

Do not report this as done until each line has a recorded actual result:

- [ ] `node --test tests/` passes, including all eleven cases in §7.
- [ ] `node scripts/build-site.mjs --out _site` succeeds and `_site/rules.mjs`
      exists.
- [ ] A tap inside a window shows `inWindow` and the balance moves by +2.
- [ ] Letting a real window close with an item unlogged produces a `failed`
      block that a later tap does **not** clear.
- [ ] The countdown ticks, and the amber/red thresholds fire at 15 and 5 minutes.
- [ ] A declared day off suppresses all blocks, all deltas, and all pushes.
- [ ] Declaring a day off is refused after the first window has opened, with a
      clear reason.
- [ ] Two `notify.mjs` runs ten minutes apart send each edge exactly once.
- [ ] A run after a six-hour gap sends one summary, not a burst.
- [ ] Blackout still allows logging.
- [ ] No medication item's copy contains instruction or urgency.
- [ ] Nothing personal was added to `PUBLIC_FILES`.

---

## 10. Open risk, stated plainly

Seven blocks, all mandatory, including gym *and* study *and* money on a work
day, is a hard bar. Early fail days are likely, and the balance may sit negative
for a while. This is the design Satya asked for and it should ship as specified.
If it proves demoralising rather than motivating, the cheapest correction is a
threshold inside `evaluateDay` — pass the day at N-1 blocks, or mark a subset of
blocks mandatory — a small, contained change to one function. Do not pre-build
that flexibility now.

---
---

# Part B — external stakes (real money)

Decided by Satya on 2026-09-07, after Part A. Build Part A first; Part B is
worthless without a trustworthy verdict to report.

**Lever:** money, through Beeminder.
**Trigger:** two failed days in a row.
**Veto:** possible, but only with a 7-day delay.

## 11. Why Beeminder, and what we are and are not building

FLOWSTATE is a static page plus a GitHub Actions cron. It cannot take money,
lock a phone, or block an app. It can only report. Beeminder already holds a
card, already charges on failure, and — critically — already enforces the delay
Satya asked for.

**We are building one thing: a reporter.** Each day, the cron posts one
datapoint to a Beeminder goal saying whether the day passed. Beeminder owns the
road, the derailment, the card, and the charge. We never touch payment details.

> **Hard rule for the implementer:** never handle, store, request, or transmit
> card or payment details. Satya sets up billing on Beeminder's own site, in his
> own browser. This repository holds one API token and nothing else financial.

### The mechanics that make this work

- **Akrasia horizon.** Beeminder refuses to make a goal easier sooner than 7
  days out. Lowering the pledge, flattening the rate, adding a break, and
  quitting the goal all take a week. This *is* the 7-day veto, and it lives on
  Beeminder's servers where Satya cannot reach it by editing this repo. **Do
  not implement a delay of our own.** A delay we enforce is a delay he can
  bypass with a text editor. Ours would be theatre; theirs is real.
- **Pledge escalation.** `$0 → $5 → $10 → $30 → $90 → $270 → $810 → …`, one
  step per derailment, stopping at a cap the user sets.
- **Idempotency.** The datapoint endpoint takes a `requestid` scoped to the
  goal. Reposting with the same `requestid` updates rather than duplicates.
  This is what makes a 10-minute cron safe.

Sources: [datapoint API](https://api.beeminder.com/#datapoints) ·
[akrasia horizon](https://help.beeminder.com/article/45-what-is-the-akrasia-horizon) ·
[pledge caps](https://help.beeminder.com/article/22-can-i-limit-how-high-my-pledge-gets)

## 12. Mapping "two failed days in a row" onto a goal

Do **not** compute the two-day trigger in our code and then try to make
Beeminder charge. Beeminder's own road already expresses it exactly.

Set up a **Do More** goal:

| Setting | Value | Why |
|---|---|---|
| Rate | **1 per day** | One passed day per day |
| Initial safety buffer | **1 day** | One fail eats the buffer; the second derails |
| Goal timezone | `America/Toronto` | Must match `schedule.json` |
| Deadline | **06:00** (next morning) | Gives the cron all night to land the previous day's datapoint |
| Starting pledge | **$0** | Rises to $5 automatically after 7 days — the first week is a shakedown with nothing at risk |
| Pledge cap | **$30** | Recommended start. Satya's call; raising it later is instant, lowering it takes a week |

With a 1-day buffer at rate 1/day: pass every day and the buffer holds. Fail
once and `safebuf` hits 0 — a beemergency, and Beeminder emails about it. Fail
the second consecutive day and it derails and charges. That is the requested
trigger, with none of the logic in our code.

**Set the goal up before writing any code.** The shape of the road is the
feature; the integration is plumbing.

## 13. The reporter

New `scripts/stakes.mjs`, called from the existing notify workflow (do not add a
second cron — one scheduled workflow, two jobs' worth of work).

### 13.1 What it posts

Once per day, after the day's last window has closed:

```
POST https://www.beeminder.com/api/v1/users/<user>/goals/<goal>/datapoints.json
  auth_token = <BEEMINDER_TOKEN>
  daystamp   = YYYYMMDD          (the day being reported, Toronto)
  value      = 1 if the day passed or was a declared day off, else 0
  comment    = "FLOWSTATE: passed" | "FLOWSTATE: failed — Gym, Deep work"
  requestid  = "flowstate-YYYY-MM-DD"
```

`requestid` is mandatory, not optional. It is what lets the job run every ten
minutes, retry after a failure, and back-fill history without ever creating a
duplicate.

The verdict comes from `rules.mjs` `evaluateDay(...)` with `nowMin: null` — the
same function the phone uses. There is no second scoring path.

### 13.2 Back-fill, because a missed post costs real money

Every run, walk the last **7 days**. For each day that is complete and has no
successfully-recorded post, post it. Because `requestid` is deterministic, this
is safe to repeat forever.

This is the single most important reliability property in Part B. If GitHub
Actions is down for two days, the next successful run repairs the record before
the road catches up — provided it lands before `losedate`.

### 13.3 Reading the stake back

The same run fetches the goal and writes a `stakes` object into the existing
Firestore document:

```js
S.stakes = {
  goal, pledge, safebuf, losedate, lastPostedDate, lastPostOk, fetchedAt
}
```

The browser reads it from Firestore. **The Beeminder token must never reach the
client** — `index.html` is published publicly by `build-site.mjs`. The client
never calls Beeminder directly; it only reads what the server wrote.

### 13.4 Secrets

`BEEMINDER_TOKEN` as a GitHub Actions secret, alongside the existing
`FIREBASE_SERVICE_ACCOUNT`. The username and goal slug go in `schedule.json`
under `stakes: { user, goal }` — a goal slug is not a secret, and having it in
the public config makes the setup legible. The token never appears in the repo,
in `schedule.json`, in a log line, or in a commit message.

## 14. UI

In the header, beside the balance: **`$10 at stake · safe until Tue 06:00`**,
read from `S.stakes`.

Three states that must be visually distinct:

- **Safe** (`safebuf >= 1`): quiet, one line.
- **Beemergency** (`safebuf === 0`): loud and persistent. Today's blocks *must*
  all pass or money moves. This is the state the whole feature exists to create
  — do not make it subtle.
- **Stale** (`fetchedAt` older than 24h, or `lastPostOk === false`): a warning
  that the reporter is not running. Says plainly that the record may be
  un-posted and links to the goal so Satya can post by hand. A silent
  integration failure is the one way this feature costs money for nothing, so
  it must be impossible to miss.

## 15. Closing the day-off loophole

**This amends §1 and §5.5.** A declared day off posts `value: 1` and cannot
derail. Unlimited days off would therefore be a free, self-serve way to defuse
the stake entirely.

Cap them: **4 declared days off per rolling 28 days**, enforced in `rules.mjs`
so the phone and the reporter agree. Past the cap, a "day off" is refused at the
point of declaring, with the reason and the date the next one becomes available.

This cap is deliberately *not* subject to a 7-day delay — it is a rule in our
code, and Satya can change it by editing the repo. That is fine and honest: the
loophole is closed against absent-minded use, not against a determined decision.
The money stake is the part that has to be tamper-proof, and it is, because
Beeminder holds it.

## 16. Phases (continue from §8)

7. **Goal setup, by hand.** Satya creates the Beeminder goal with the §12
   settings and a **$0** pledge, and confirms it appears with `safebuf: 1`. No
   code. Nothing is at stake for the first seven days.
8. **Reporter, dry-run.** `stakes.mjs` computes verdicts and logs the exact
   payload it *would* post, posting nothing. Run it for several days and check
   its verdicts against the app by eye. Follow the precedent already set by the
   paused Calendar publisher: preview before write.
9. **Reporter, live.** Posting enabled, back-fill on, `S.stakes` written and
   displayed. The pledge reaches $5 on its own. Verify a real charge only when
   one legitimately happens — never trigger one to test.

## 17. Acceptance (Part B)

- [ ] `requestid` is deterministic: running `stakes.mjs` three times in a row
      creates exactly one datapoint, verified in the Beeminder UI.
- [ ] A simulated 3-day outage back-fills all three days on the next run.
- [ ] A failed day posts `value: 0` with the failing block names in the comment.
- [ ] A declared day off posts `value: 1`.
- [ ] The fifth day off in 28 days is refused, with a reason and a date.
- [ ] `safebuf: 0` renders the beemergency state, and it is genuinely hard to
      ignore on the phone.
- [ ] Killing the reporter for 25 hours raises the stale warning in the app.
- [ ] `grep -ri beeminder` over the published `_site` finds no token.
- [ ] The token is absent from the repository, from `schedule.json`, and from
      every workflow log.
- [ ] `stakes.mjs` sends no card or payment data of any kind, and requests none.

## 18. Honest risks

- **Infrastructure failure costs real money.** If the cron dies, the record goes
  un-posted, and Beeminder derails on schedule regardless of how good the actual
  week was. §13.2 back-fill and §14's stale warning are the mitigations, and
  Beeminder's own beemergency email is the backstop. The risk is reduced, not
  eliminated. Start at $0 and cap at $30 until the reporter has run clean for a
  month.
- **A wrong verdict costs real money.** Part A must be correct before Part B is
  armed. A bug in `evaluateDay` becomes a charge. This is why §7's tests are not
  optional and why Phase 8 is a dry run.
- **Escalation outruns motivation.** At $90 or $270 a stake stops being a
  motivator and becomes dread. That is what the pledge cap is for. Set it at a
  number that would sting on a bad week, not one that would ruin it.
- **Two mandatory failed days is a low bar to hit.** Part A's §10 already warns
  that a 7-block all-mandatory day is hard. Two of them back to back, early on,
  is likely. Consider running Part A alone for two or three weeks and reading
  the real pass rate before arming Part B at all. If the honest pass rate is
  under about 70%, fix the bar first — a stake attached to a target that is not
  actually reachable does not produce better days, it produces charges.
