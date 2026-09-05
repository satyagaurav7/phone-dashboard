# FLOWSTATE check-ins and rewards — implementation plan

**For:** the agent building this. **Companion to:** [DAILY-CHECKINS-AND-REWARDS.md](DAILY-CHECKINS-AND-REWARDS.md)
(the research and its evidence) and [CLAUDE.md](CLAUDE.md) (repository safety rules).
**Written:** 2026-09-05. **Status of everything below: proposed.** Nothing here
has been built, and no live Google data has been changed to prepare it.

This document turns the research into buildable phases. It does not restate the
evidence — read the companion for why each rule exists. Where the two disagree,
the companion wins on *why* and this plan wins on *what to build first*.

---

## 0. Authority: what wins when documents disagree

The research names contradictory product guidance as a P0 blocker. Resolve it
by this order, highest first, and record the resolution in a commit before
writing feature code:

1. **[CLAUDE.md](CLAUDE.md) safety rules** — non-negotiable. Nothing below
   overrides them.
2. **This plan and [DAILY-CHECKINS-AND-REWARDS.md](DAILY-CHECKINS-AND-REWARDS.md)** —
   current design intent for check-ins and rewards.
3. **Live code behaviour** — what `index.html` and `scripts/notify.mjs` actually
   do today.
4. **[PRODUCT.md](PRODUCT.md), [FLOWSTATE-II-PLAN.md](FLOWSTATE-II-PLAN.md),
   [FLOWSTATE-REVAMP-PLAN.md](FLOWSTATE-REVAMP-PLAN.md)** — historical. Useful
   as design history. **Not authorization.**
5. **[CALENDAR-SETUP.md](CALENDAR-SETUP.md), [TASKS-SETUP.md](TASKS-SETUP.md)** —
   describe the **retired** publisher. Their write instructions are deprecated.

Specifically dead, do not revive: rejected days, streak-breaking punishment,
rest tokens, random prize drops, simulated money increases, "Visa Points",
dopamine-timing claims, and any precise motivation multiplier.

---

## 1. Goals, and the one metric

**Goal:** make the next step clearer and let real progress be recognised.

**Success:** useful action with less friction.
**Explicitly not success:** more app opens, more answers logged, more positive
moods, or a higher score. If a change raises engagement but not real action,
it failed.

### Non-goals — do not build these

| Not building | Because |
| --- | --- |
| A second task system inside FLOWSTATE | Google Tasks is the source of truth. CLAUDE.md rule. |
| Regenerated routine events in Calendar | Deliberately removed. CLAUDE.md rule 2. |
| Mood tracking as a wellbeing feature | Evidence does not support benefit; burden is documented. |
| Any diagnosis, screening, or crisis inference | Out of scope, and unsafe. |
| A custom voice app / Conversational Action | Platform shut down June 2023. |
| A language model in v1 | Deterministic templates are sufficient. |
| Scheduled Calendar/Tasks **writes** | Paused. Requires Satya's explicit approval. |

---

## 2. Who owns what

| Information | System of record | FLOWSTATE's job |
| --- | --- | --- |
| Action title, day, completion | **Google Tasks** | Read and render. Write only explicit user actions. |
| Timed commitments | **Google Calendar** | Read agenda. Never generate events. |
| Capacity, feeling, obstacle, chosen step | **FLOWSTATE (private)** | Own it. Minimal fields, deletable. |
| Acknowledgement + milestone history | **FLOWSTATE ledger** | Own it. Idempotent. |
| Voice commands, timers, routines | **Google Home** | No inferred DB connection. |

The speaker does not know the dashboard's state. Any bridge must be built and
proven, never assumed.

---

## 3. P0 — make the existing system trustworthy

**No check-in or reward work starts until this phase is done and recorded.**
These are corrections to shipped behaviour that would otherwise poison
everything built on top.

### P0.1 — Stop punishing absence

`index.html:573` applies **−4 momentum per elapsed day**, clamped 0–100, in the
day-rollover loop. Several quiet days walk momentum to zero. Background
intensity is driven by momentum, so a quiet week also visibly dims the app.
That is a punishment mechanic wearing a neutral name.

- Replace decay with a **factual recent-activity view** ("3 action days in the
  last 14"). Keep earned milestones permanently.
- If a single momentum number is retained for continuity, it must not decay
  below what was earned, and must not drive visual dimming.
- **Acceptance:** A12 (skip a check-in → no loss), A22 (rewards off → app still
  readable and complete).

### P0.2 — Stop the whole-state overwrite

`index.html:599` writes with `setDoc(userDocRef, Dash.state, { merge:false })`.
Every save replaces the entire document from possibly stale in-memory state. A
second device, or any background sync, can silently lose writes. Check-ins and
reward grants must not be built on this.

- Move check-in, task-link, and reward records to **narrow field updates**, and
  use a transaction where a grant must be exactly-once.
- Firestore transactions retry and can fail offline: keep a **pending queue**
  and show honest pending state. Never render an unconfirmed write as saved.
- **Acceptance:** A10 (concurrent edits), A11 (offline → reconnect → idempotent
  replay).

### P0.3 — Fix notification copy that can lie

`scripts/notify.mjs:136` (`composeStreak`) sends *"today isn't counted yet"* and
frames taps as the thing that moves momentum. It reads dashboard flags only —
so after completing a task **by voice**, it can tell Satya the day is empty when
it is not.

- Replace with a non-verdict prompt: *"Would a quick review help, or should I
  stay quiet?"*
- Until the Tasks read bridge (P2) exists, this notification must not assert
  that nothing was done.
- **Acceptance:** A23 (stale/missing source → says unknown, invents nothing).

### P0.4 — Audit every reminder channel together

The Calendar publisher is paused, but `notify.yml` **still has scheduled
triggers**. Do not describe automation as "paused" — it is partly paused.
Enumerate all four channels and their current state: Google Tasks phone alerts,
FLOWSTATE push, Google Home routines, and any ChatGPT-side automation.

- **Acceptance:** A19 (measure untimed-task alerts and app pushes together).

### P0.5 — Keep the publisher off

`.github/workflows/calendar.yml` must keep **no schedule trigger**, both preview
commands must keep `--dry-run`, and **no Google secrets** may be passed to
either step.

- **Acceptance:** A01. Verify by reading the file, every time.

---

## 4. P1 — the smallest useful experience

Local only. No Google writes. This phase must be independently valuable, so
that if the bridge never ships, the check-ins still help.

### Morning card (~45s, every field optional)

1. **Capacity** — low / usual / plenty. Optional feeling: calm / tense / flat /
   distracted / other / **skip**.
2. **What would make today feel worthwhile?** — pick one action. Optionally up
   to three focus items.
3. **First small step, and its cue** — "After X, I will Y."

Low capacity offers a **smaller discretionary action or rest**. It must never
change an appointment, a due date, or anything medical. "Plenty" must never add
work automatically.

### Evening card (~60s)

1. **What moved forward today?** — show confirmed completions; allow one
   user-reported win, or "nothing to add".
2. **What got in the way?** — one tap: too much planned / unclear next step /
   tired / interrupted / waiting / other.
3. **Tomorrow's first small step.**

Close plainly. On a hard day: *"Today was difficult. You don't need to make it
look better in the log."* Never demand gratitude, optimism, or three wins. If
nothing was logged, say **nothing was logged** — not that nothing was achieved.

### The "stuck" prompt

One question, shown on request only, chosen by situation (too much to choose
from / too large / avoidance / perfectionism / rechecking / hard day / stopping
work). See the companion §4 for the table. Never shame a re-open.

### Weekly

Attach five questions to the **existing Sunday planning task**. Do not create a
new recurring obligation. No automatic bulk completion or deletion.

**Acceptance:** A02, A12, A13, A14, A16, A21, A22.

---

## 5. P2 — Google Tasks read bridge (read-only)

Prove reads before rewarding anything.

- Read **both lists**, **all pages**. `showCompleted=true` requires
  `showHidden=true` to see first-party completions.
- Display **source, retrieval time, and stale/offline state** on screen.
- `due` is a **scheduled date, not a deadline** — the API discards time. Never
  convert a date-only midnight into the previous Toronto date.
- The task resource exposes **no recurrence rule and no skipped status**. Do not
  invent those fields.
- There is **no documented completion webhook**. Plan polling / refresh, with
  `updatedMin` for increments plus a bounded full refresh that also handles
  deletions.
- Prove recurrence behaviour with **harmless test tasks** before mapping the
  real 26-item list. Do not rebuild that list from a guessed recurrence model.

**Acceptance:** A03, A07, A08, A09.

---

## 6. P3 — explicit writes

Only actions the user explicitly took. Never inferred.

- Complete or reschedule **by provider ID**.
- Show **pending** until the provider confirms.
- On failure, preserve the intended action for retry. **Never fabricate a
  completion.**
- Never translate "skipped" into "completed".
- Keep these presentation states distinct: not completed / not logged / skipped
  / waiting / not applicable / sync unknown. Google exposes only
  needs-action and completed — richer annotations must not misrepresent it.

**Acceptance:** A04, A15.

---

## 7. P4 — reward ledger

Three layers only:

| Layer | Behaviour |
| --- | --- |
| Immediate acknowledgement | Quiet visual + one factual sentence: *"Practice completed. You recorded one answer."* |
| Immediate enjoyment | Pair the action with something already enjoyable; optional short celebration after. |
| Cumulative milestone | Optional cosmetic choice after **5** meaningful action days, then **10**. **Cumulative, not consecutive.** Thresholds are pilot defaults. |

**A meaningful action day** = at least one *user-selected discretionary focus
action* confirmed complete. It is **not** earned by opening the app, logging a
better mood, performing medical actions, or splitting a task into fragments. A
separate "started" acknowledgement may recognise effort without full credit.

**Never reward-gate:** rest, food, sleep, human contact, or health care. A
readable, comfortable theme is always available at zero points.

**Idempotency is the hard part.** Recognise a confirmed transition **once**,
whether it originated on the phone or by voice. Voice-originated rewards may
only appear at the next refresh — do not promise speaker celebration.
Occurrence identity must be established **empirically**: do not assume a
recurrence instance gets a new ID, or that a `completed` timestamp is an
immutable key. **If identity is uncertain, withhold the milestone and show the
uncertainty.** Never fabricate missed historical completions.

Show real-world consequence over points: *"Tomorrow's lunch is prepared."* Never
convert a cooked meal into a fictional dollar saving or imply points affect
immigration status.

**Acceptance:** A05, A06, A15.

---

## 8. P5 — notification policy

Start with **voice-triggered routines and on-open check-ins only**. If reminders
prove useful, trial **at most two** discretionary check-in prompts per day. One
dismissal is enough. A skipped check-in never becomes a backlog and is never
re-asked until complied with.

Set timezone and quiet hours explicitly. **A late job must expire its prompt**,
not deliver a morning question at night — the existing sender already tolerates
GitHub cron landing 1–3 hours late, so this is a real case. A closed day stays
editable; closing only stops further discretionary prompts.

Genuine deadlines and prescribed-care reminders keep an independent path and are
never suppressed by noise reduction.

**Acceptance:** A16, A19.

---

## 9. Data model

Application-owned. Not Google fields.

| Record | Minimum fields |
| --- | --- |
| `checkIn` | id, local date, timezone, phase, optional capacity/feeling/obstacle, selected task ref, optional first step, created, deletion state |
| `taskLink` | provider account ref (**private, never committed**), list id, task id, observed scheduled date, last provider update, sync status |
| `actionEvent` | stable event id, task ref, action kind, occurrence mapping *if verified*, reported time, observed time, source, confirmation state |
| `rewardGrant` | rule version, qualifying event/day, grant id, selected reward, revoked/corrected state |
| `preferences` | check-ins on/off, quiet hours, reminder budget, theme, motion, reward opt-in, retention choice |

Store these **outside** the legacy whole-state document, or migrate that
document to narrow updates first (P0.2).

---

## 10. Cross-cutting rules

### Health boundary — type 1 diabetes

**This is not negotiable and not a style preference.**

- A sudden drop in energy, focus, or mood **must not** be framed as a motivation
  problem. Low glucose produces exactly those symptoms.
- Point the user back to their existing diabetes plan. Never answer a symptom
  with a productivity timer.
- Never infer that a checkmark means a dose was taken. Never award points for
  extra treatment. Never treat an overdue medication task as "catch up now".
- Medication labels are **checklists, not instructions**. An untimed task does
  **not** mean the medication can be taken at any time.
- Mood entries are never broadcast and never override a medical reminder.

### Privacy

Answers stay private and deletable. Voice Match does not make spoken output
inaudible to a housemate — keep sensitive content on the phone, never in a
household announcement. Never commit account addresses, tokens, keys, task
contents, health details, or event IDs.

### Copy

Professional, direct, specific, encouraging. No death language. No verdicts on a
person. Acknowledge the interruption, name the obstacle, offer a manageable
restart.

---

## 11. Acceptance tests

All 24 tests (A01–A24) live in the companion. Map them to phases:

| Phase | Tests |
| --- | --- |
| P0 | A01, A10, A11, A19, A23 |
| P1 | A02, A12, A13, A14, A16, A21, A22 |
| P2 | A03, A07, A08, A09 |
| P3 | A04, A15 |
| P4 | A05, A06 |
| Voice | A17, A18, A20 |
| Pilot | A24 |

Use **harmless test records**. Record actual observed results — a filled-in
table is a claim of execution.

### Report status in exactly four states

**proposed** → **configured** → **verified in UI/API** → **verified on the
physical speaker**.

Do not claim end-to-end success until the speaker tests pass. The agent cannot
hear the speaker; that step belongs to Satya.

---

## 12. Pilot before complexity

14 days, one person. A usability experiment — it cannot prove psychological
causation.

| Days | Try | Observe |
| --- | --- | --- |
| 1–3 | Existing setup, minimal evening note | Baseline friction; was tracking itself a burden? |
| 4–10 | Morning + evening cards, acknowledgement, one enjoyable pairing | Did a chosen action start more easily? |
| 11–14 | Same loop, plus one cumulative milestone | Did the milestone add anything? |

**Keep** if choosing and starting got easier. **Simplify** if reviews exceed two
minutes. **Stop the reward layer** if points encourage busywork, false logging,
or guilt. A skipped day is missing information — not a failure, not a low-mood
label.

---

## 13. Order of work

1. **P0** — decay, write-safety, notification copy, channel audit, publisher
   stays off. *Nothing else starts first.*
2. **P1** — morning/evening cards, local only. Ship and use it.
3. **Pilot days 1–10** on P1 before building the bridge.
4. **P2** — Tasks read-only, with test tasks.
5. **P3** — explicit writes.
6. **P4** — reward ledger, only once P2/P3 identity is proven.
7. **P5** — notification policy.

If the pilot says the loop isn't helping, **stop at P1**. The bridge is only
worth building for a loop that already earns its place.
