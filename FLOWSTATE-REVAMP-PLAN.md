# FLOWSTATE — Revamp Plan

*Written 2026-07-15. Rebrand + psychological redesign of the phone dashboard.*

> **STATUS: SHIPPED 2026-07-15.** All 6 phases implemented and live. Old data
> fully preserved; streak seeded the momentum meter; best-streak lives on as a
> legacy stat on the History tab.

## Why this revamp exists

The current app is a drill sergeant: 5 mandatory daily habits, DENIED stamps,
ENTRY REFUSED screens, streak that zeroes on one bad day, fines that subtract
points. Satya's own words: "I'm finding it hard to even complete the daily wins"
and the punishment makes him avoid opening the app. A tool you avoid is a dead
tool, no matter how motivating it looks.

Diagnosis (from his answers):
- **All-or-nothing kills momentum** — 3 of 5 wins counts for nothing, so after one
  slip the rest of the day is abandoned.
- **Punishment backfires** — DENIED/broken-streak screens create shame-avoidance,
  the exact opposite of a daily check-in habit.

The 2027 PR goal, the honesty principle, and the money discipline all stay.
What changes is the engine: **from perfection-streak to momentum.**

## The new identity: FLOWSTATE

**Name:** FLOWSTATE (app title, home-screen icon, notifications)
**Feel:** focused game energy — dark, sleek, quietly glowing. Opening it feels
like entering a zone, not reporting to a border officer.
**Three words:** calm, kinetic, unbreakable.

Design language:
- Dark canvas (deep charcoal-navy, e.g. `#0B0E14` / `#111624` cards)
- One electric accent (cyan `#4FD8EB` or violet `#8B7CF6`) used ONLY for
  progress and glow — earned light in a dark room
- Soft gold retained as a secondary nod to the PR/passport story
- Progress = light: the more you do, the more the screen glows. Nothing ever
  turns red at you. `prefers-reduced-motion` fully respected.
- New icon: dark tile, glowing momentum ring (replaces the passport stamp)

Anti-goals: no shame states, no skull-and-crossbones red, no "REFUSED" screens,
no confetti spam. The reward is glow and motion, not noise.

## The new core loop

### 1. The Anchor — one tiny non-negotiable (replaces "5 core or fail")

> **Anchor = Check in: log CGM/insulin + tap one honest button about your day.
> Two minutes. Nearly impossible to fail.**

- Doing the Anchor = you showed up = the day counts. Period.
- The History heatmap marks Anchor days, so "showing up" is the visible habit —
  not perfection.
- Missing the Anchor doesn't erase anything; it's just a dim day on the map.

Why insulin/CGM as the anchor: it already happens every day (T1D), it's
genuinely important, and it anchors the check-in to an existing behavior
instead of demanding a new one (habit-stacking).

### 2. Small Wins & Big Wins (replaces mandatory Daily Wins)

Everything beyond the Anchor is **bonus fuel** — nothing is mandatory, nothing
can be failed, there is no DENIED state anywhere.

**Small Wins** (+3 momentum each; 2-minute actions, always available):
- 🚰 Hydrated properly
- 🚶 10-minute walk / moved my body
- 📖 Opened the CELPIP book — even 5 minutes
- 🍳 Cooked one meal (per-meal now, not all-or-nothing "zero delivery")
- 🧘 One breathing reset
- 🌙 Phone down before bed

**Big Wins** (+8 momentum each; celebrated with glow animation):
- 🏋️ Gym session
- 📚 CELPIP 20-minute block
- 💻 Upskill hour
- 🍽️ Full cooked day (all meals home-made)
- 🚭 Smoke-free day (stamped at day's end; if it slips, you simply don't stamp —
  no red, no penalty, the habit graph just shows the truth)
- 💸 Money move

Key mechanic: **a slip no longer poisons the day.** Skipped the gym? The walk,
the cooked lunch, and the reading still count and still glow. There is always
a next small win available — the day is never "already ruined."

### 3. Momentum meter (replaces the streak)

A 0–100 gauge that is the emotional center of the home screen — a glowing ring
that fills and brightens as momentum rises.

- Anchor: **+10**
- Small Win: **+3** (up to 4/day count toward momentum)
- Big Win: **+8**
- Each new day: **−4 drift** (quiet days slowly cool; nothing ever "breaks")
- Range 0–100. It can dip; it can never be destroyed. Weeks of work can't
  evaporate at 11:59 PM.

Flow states (shown as the label under the ring):
| Momentum | State |
|----------|-------|
| 0–24 | ⚫ Cold start |
| 25–49 | 🌊 In motion |
| 50–74 | ⚡ Flow |
| 75–100 | 🔥 Deep flow |

Old streak data isn't lost: current streak seeds the starting momentum
(e.g. `min(100, streak × 8 + 20)`), and best-streak is preserved as a
lifetime stat. Visa Points/levels stay (they feed the PR narrative) but
**only gain — all point deductions are removed.**

### 4. De-punishment pass

- Remove: DENIED tri-state taps, ENTRY REFUSED seal, "streak broken 💔" toast,
  fine point-deductions, red shame styling.
- The Penalty Box becomes the **Leak Log**: same honest money tracking (cab,
  delivery, smokes, impulse), neutral styling, no point loss. It quietly totals
  into the Money tab where it belongs. Honesty stays; flagellation goes.
- Status lines rewritten: "3 of 5 stamped — keep the ink wet" →
  "Momentum +16 today and rising."

### 5. Notifications retuned (same infra, new voice)

- **7 AM Flow Brief** (unchanged schedule, new tone): "🌊 Office day. Momentum
  62 — one small win keeps it climbing. Card payment in 2 days."
- **9 PM Anchor Save** (replaces streak-threat): fires only if the Anchor isn't
  done. "Your anchor takes 2 minutes. Log it and the day counts." No death
  language, no countdown dread.
- Sender logic change: check anchor fields instead of 5 core habits; copy
  rewritten. Infra (FCM, crons, dedupe) already works — just fixed today.

### What is NOT changing

- The 2027 PR goal, countdowns, action items — still the north star (PR tab).
- Money tab, real numbers, honest record — untouched.
- Plan tab timetable + Right Now card — untouched (they fit flow perfectly;
  Right Now card gets the new skin and becomes the top "what's my next move").
- Firestore data model keeps all history; new fields are additive.
- No fake progress: the meter only moves for real logged actions.

## Implementation phases

| Phase | What | Effort |
|-------|------|--------|
| 1 | **Theme + rebrand**: dark palette, FLOWSTATE name/manifest/icons, glow system, kill red shame styling | ~2h |
| 2 | **Momentum engine**: compute meter from day history (pure function, derived not stored where possible), migrate streak → starting momentum, flow-state labels, hero ring UI | ~3h |
| 3 | **Anchor + Small/Big Wins**: restructure Today tab (Anchor card on top, Small Wins row, Big Wins list), remove DENIED tri-state, per-meal cooking stamps | ~3h |
| 4 | **De-punishment pass**: Leak Log reframe, copy rewrite everywhere, remove deductions from XP | ~1h |
| 5 | **Notifications retune**: anchor-based 9 PM check, new copy in notify.mjs, brief includes momentum | ~1h |
| 6 | **History reskin**: heatmap = anchor days + momentum intensity, lifetime stats (best streak preserved as legacy stat) | ~1h |

Each phase is one commit, live in ~40s, verifiable on the phone immediately.
Phase order matters: the theme lands first so every later change already feels
like the new app.

## Success criteria (honest ones)

- Satya opens the app on a *bad* day without dreading it — because there is
  nothing in it that scolds him.
- A day with one 2-minute action feels recorded, not failed.
- The meter is believable: dips visible, recoveries visible, nothing fake.
- 30 days from now: anchor-day count is the metric that matters — not
  perfect-day count.
