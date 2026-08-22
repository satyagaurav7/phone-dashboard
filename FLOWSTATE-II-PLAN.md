# FLOWSTATE II — Real-Stakes Upgrade Plan

*Written 2026-08-21. Extends [FLOWSTATE-REVAMP-PLAN.md](FLOWSTATE-REVAMP-PLAN.md) (shipped
2026-07-15). That revamp removed the punishment. This one adds the pull.*

> **Scope decision:** single `index.html`, no build step, still offline-capable, still
> Firestore-synced. One new CDN dependency only: **Motion** (spring physics), plus static
> hand-authored mesh-gradient SVGs for the background moods. Nothing else.
> *(Originally two: Haikei was the planned SVG source and was dropped — see Appendix.)*

---

## Why this exists

Satya's own words, 2026-08-21:

> "I don't even feel like opening the app. I don't see an incentive or small rewards or
> actually have tasks that show me progress in real life."

He then selected **all four** offered root causes: it's predictable/boring, the numbers don't
mean anything, he can't feel himself getting better, and it's overwhelming.

### The actual diagnosis

FLOWSTATE I fixed the right problem — the drill-sergeant streak created shame-avoidance — but
it removed the punishment **without replacing the pull**. What's left is an honest, well-built
logging tool. Logging tools do not create wanting.

Eight structural gaps, in order of how much they cost:

1. **The reward is glow, and glow isn't real.** Momentum, Visa Points, and flow states all
   live *inside the app*. Nothing you tap changes anything outside it. This is the whole
   complaint and everything below is downstream of it.

2. **Zero variable reward.** Tap → `+3`, same cyan, same toast, every time, forever. Dopamine
   tracks *prediction error*, not reward size. A perfectly predictable reward stops generating
   anticipation in roughly two weeks. There is currently no surprise surface anywhere.

3. **No progress narrative, only a state readout.** The app says where you are, never where
   you came from. No week-over-week, no personal records, no trend. Perceived competence
   *requires* comparison to a past self. A heatmap is a record, not a story.

4. **The Leak Log is a dead end.** You tap "delivery $20" and nothing happens. Honest, but
   pure cost with zero return — so eventually you stop tapping, which kills the data.

5. **No day closure.** The day never ends. No evening seal-the-day moment. The Zeigarnik
   effect (open loops nag) is working against him instead of for him.

6. **The screen looks identical at momentum 8 and momentum 88.** One arc length differs.
   `background-attachment:fixed` means the aurora literally never moves. Nine stacked cards
   share one `--card`-on-`--page` treatment with the same 1.5px border, so Supplements carries
   the same visual weight as the Anchor. Habituation is perceptual: an unchanging interface
   becomes invisible.

7. **Overwhelm at open.** Today renders ten cards: hero, Right Now, Anchor, push, Small Wins,
   Big Wins, Meals, Supplements, Leak Log, Guardrails, Timetable pointer. PRODUCT.md's own
   principle — "the most urgent thing is obvious in under 2 seconds" — is violated by the home
   screen.

8. **Craft ceiling.** Emoji as the entire icon system. Three font families across two CDNs,
   with five separate CSS comments admitting Clash Display is fighting the 375px layout. A
   desktop pointer-trail effect burning the most valuable pixels on a phone-first app. A
   vestigial passport MRZ strip from the old identity. And the single most satisfying possible
   moment — the momentum ring filling — doesn't animate at all; it re-renders at the new
   `stroke-dashoffset`.

---

## The core move: the app's headline becomes real money

Decision: **the hero stops being "Momentum 62" and becomes money — debt down / fund up.**

[MONEY-SAVING-TOOLKIT.md](MONEY-SAVING-TOOLKIT.md) (rewritten 2026-08-03 from real CIBC data)
already contains better raw material than any invented metric. Three numbers come straight out
of it, and all three are verifiable against a bank statement.

### Number 1 — The Weekly $228 (the burn-down)

> *"$228 per week for everything that isn't a bill."* — the single number in the toolkit.

Derivation, from the toolkit's own table (kept in the app so it can never drift into fiction):

| Envelope | Weekly | Monthly |
|---|---|---|
| Groceries | $81 | $350 |
| Gas | $69 | $300 |
| Food out (all restaurants + delivery) | $35 | $150 |
| Cannabis | $12 | $50 |
| Fun / entertainment | $14 | $60 |
| Personal care / clothing / misc | $17 | $75 |
| **Total** | **$228** | **$985** |

Excluded deliberately (monthly or automatic, not weekly decisions): subscriptions $45,
medical $50, car sinking fund $125.

**Why this is the right headline:**

- **It resets every Monday.** A fresh start every seven days — no "the week is already
  ruined." This is the same insight that made the Anchor work, applied to money.
- **It's literally his cash.** No invented currency, no fake progress.
- **It's causal.** Every Tim Hortons visibly moves it. Six visits in eight days at $6.11 is
  no longer an abstraction in a markdown file — it's the ring draining on the home screen.
- **It makes the Leak Log matter.** A logged leak now subtracts from a real number.
- **Everything inside it is guilt-free by definition.** This is the honest answer to "real
  money I'm allowed to spend": the $228 *is* the permission. Nothing is invented.

Hero treatment: a **burn-down ring** — starts full Monday, drains as spend is logged. Label:
`$146 left · 4 days`. Amber when the pace is ahead of the day, never red.

### Number 2 — The Emergency Fund (the climb)

The weekly ring drains; this one only climbs. Whatever remains of the $228 on Sunday night
rolls into the fund, and **the fund visibly jumps** — that's the cash-out moment.

| | |
|---|---|
| Current | **$0** |
| Starter target (1 month of essentials) | **$3,395** |
| Full target (3 months) | **$10,185** |
| Planned contribution | **$349/mo** |
| Coverage today | **0.6 months** |

Displayed as **months of coverage** (`0.6 → 1.0`), not just dollars. Months of coverage is a
life-safety number, and it's the honest "am I actually getting better" metric. Reaching the
starter target lands ~Jul 2027, which sits naturally alongside the PR timeline.

### Number 3 — Real Moves (the $/month unlocked counter)

This is the direct answer to *"tasks that show me progress in real life."*

The toolkit's mandatory list has **seven items and zero completed** between Jul 27 and Aug 4.
Each has a real dollar value. In the app they become **Real Moves** — one-time, dollar-valued,
outside-the-app actions:

| Real Move | Unlocks |
|---|---|
| Confirm August rent was paid | *urgent — no $, but blocks everything* |
| Find out what CIBC-DISATF is (one phone call) | **up to $433/mo** |
| Cancel 2 of 3 AI subscriptions | **$75/mo** |
| Cut Patreon back to one membership or zero | **$25/mo** |
| Confirm what Fit4Less actually costs | **$38/mo** |
| Fix the CIBC account fee (EQ Bank / Simplii) | **$17/mo** |
| Set the weekly $228 (separate account, every Monday) | *the mechanism* |

Completing one raises a permanent counter: **"$/month you've unlocked."** That number only
ever goes up, and it represents literal, verifiable life improvement. A single phone call is
worth `+$433/mo` — which is 124× more motivating than `+8 momentum`, and it's true.

Potential on the current list: **~$588/mo.**

The eight existing PR action items stay exactly as they are, on their own track. Real Moves is
a money track, not a replacement.

### What happens to momentum

**It stays, unchanged, and gets demoted visually.** It becomes the secondary "how hard am I
pushing right now" gauge under the money hero.

Non-negotiable reason: `scripts/notify.mjs` reimplements the momentum model (`SMALL_KEYS`,
`BIG_KEYS`, `dayGains`, `clampM`, `flowStateOf`, `momentumNow`) as duplicated constants at
lines 20–31. Changing the engine silently breaks every notification. See Hard Constraints.

---

## Reward architecture — all four currencies cash out real

Satya selected all four options. Each one maps to a mechanic that terminates outside the app.

### 1. Real money you're allowed to spend → **the Weekly $228**

Already covered. The envelope *is* the guilt-free purse. Spending inside it is permitted by
construction, so the app stops being a source of food guilt — which is currently one more
reason not to open it.

### 2. Earned time / permission to rest → **Rest Tokens**

Momentum buys permission. Tokens are spendable and shown as physical-looking objects.

| Earned by | Token |
|---|---|
| 3 consecutive days at Flow (momentum ≥ 50) | **Free Evening** — no obligations, no guilt |
| Reaching Deep Flow (≥ 75) | **Free Evening** + a visual unlock |
| 7 consecutive anchored days | **Weekend Token** — guilt-free rental weekend, inside the $300 gas envelope |
| Finishing the week under $228 | **Slow Sunday** |

"Permission to rest" is genuinely scarce when you're carrying real family obligation. Making
it an *earned, spendable object* converts rest from guilt into reward.

### 3. Unlockables inside the app → **the novelty lever**

The only currency that's free and infinitely repeatable, so it carries the anti-boredom load.

- **Ring skins:** Filament (default) → Tide → Ember → Aurora → Solstice → **Eclipse** (loot-only)
- **Background moods:** six static mesh SVGs in `moods/`, unlocked at cumulative anchored-day
  counts (10 / 25 / 50 / 100 / 200)
- **Titles:** layered onto the existing Visa Points levels

### 4. Real-world milestone unlocks → **pre-committed actions**

Hitting a threshold surfaces one specific real thing, pre-committed so it isn't a decision in
the moment:

| Milestone | Unlocks |
|---|---|
| Emergency fund ≥ $500 | File the **Disability Tax Credit** — T1D usually qualifies, refund + RDSP access |
| 4 straight weeks under $228 | **Book the CELPIP retest** (Reading 6 is the PR blocker) |
| Emergency fund ≥ $1,000 | **$50 to Wealthsimple** |
| 3 Real Moves complete | **Open the EQ Bank / Simplii account** |

---

## Variable reward layer

The anti-boredom engine. One rule makes it compatible with the honesty principle:

> **Randomness affects rewards only — never the record.**
> The heatmap, the anchored-day count, the money numbers, and the emergency fund are always
> literal truth. Only *bonuses* are variable.

All randomness is **seeded from the date string** (a small string hash), never `Math.random()`.
Three reasons this matters: it survives re-render, it can't be re-rolled by toggling an item
off and on, and it's reproducible for debugging.

| Mechanic | How it works |
|---|---|
| **Wildcard** | Each morning one of the six Small Wins is secretly worth **3×**. Revealed on tap. |
| **Loot roll** | Big Wins have a ~18% chance of a drop (Rest Token, ring skin, purse bump). Seeded by `date + key`. |
| **Daily Quest** | One pulled from a pool of ~20 by date hash — e.g. *"read 10 min before 9 AM."* Bonus on completion. |

---

## Progress narrative layer

Fixes "I can't feel myself getting better."

- **Delta chips** on every section title: `▲ 2 vs last week`
- **Identity counters** — the Atomic Habits mechanic, stated as identity, not score:
  `🍳 47 meals cooked instead of ordered · $940 kept`
- **Personal records board:** best reading week, longest anchored run, lowest food-out week
- **Sunday Recap card** — rendered to canvas, exportable as PNG. Creates an audience effect
  even with an audience of one.
- **Sparklines** on money tiles: food out, gas, groceries, week over week
- **The honest comparison:** food out was `$269 / 8 days` in early August. Every week shows
  against that baseline, because measuring against your past self is what growth *is*.

---

## Overwhelm fix — adaptive home + closure

### Time-of-day home

Ten cards collapse into four modes. One tap to `Full board` always available; the toggle
resets daily so the calm default holds.

| Mode | Window | Shows |
|---|---|---|
| **Dawn** | 05:00–10:00 | Anchor · hydrate · breakfast + insulin · supplements — **4 taps max** |
| **Day** | 10:00–17:00 | Right Now block · lunch + insulin · hydration pace · catch-up · week's $228 |
| **Dusk** | 17:00–21:30 | Big Wins · cook dinner · reading · spend log |
| **Night** | 21:30–05:00 | **Seal the Day** · tomorrow's first move · phone down |

### Seal the Day — the closure ritual

A 20-second evening card, the highest-ROI missing moment in the app:

1. What happened today (facts, no scoring)
2. Money: what the week has left
3. Rewards banked — tokens, loot, unlocks
4. Tomorrow's single first move
5. **Seal** → the day commits, the screen dims, the app goes quiet

Closure turns the open loop off. Right now the day just fades.

---

## Visual system

### Design tokens

New **semantic** token layer. The current names are archaeological (`--passport` is a surface,
`--maple` is amber and means urgency, `--customs` is the progress accent) which makes any
reskin risky. Old names stay as aliases so nothing breaks.

```
--surface-0  page          --accent-flow    momentum / progress
--surface-1  card          --accent-money   the money hero
--surface-2  well          --accent-warn    pace warning (amber, never red)
--surface-3  raised        --accent-pr      gold, PR narrative
```

### Elevation — three levels, not one

Currently every card is `--card` + 1.5px `--line`. Result: no hierarchy. New:

- **L2 (hero / primary):** money ring, Anchor — raised surface, real shadow, accent hairline
- **L1 (standard):** ordinary cards
- **L0 (recessed):** Supplements, Guardrails, reference content — sunken well, no shadow

### Type

Drop from three families to two + mono. Keep **Satoshi** (body) and the mono. Clash Display
loses its layout fight — five CSS comments already document it being tightened to fit 375px.
Display duties move to Satoshi's heavy weights, reserving one display face for the hero
number only. **Self-host in `fonts/`** to kill FOUT on the phone.

### Icons

A **hand-authored inline SVG sprite** (~14 glyphs) for all structural UI: nav, section titles,
controls. One `<symbol>` set at the top of the document, referenced by `<use>` — zero network
cost, no third dependency, styleable via `currentColor`.

Emoji stay *only* where the emoji is the content — the win chips, where it's expressive and
personal. Replacing structural emoji with real vector icons is most of what separates "quickly
built" from "insanely good."

> An icon library (Lucide) was considered and dropped: Motion is the only runtime dependency,
> and 14 glyphs don't justify a second one.

### Motion — [motion.dev](https://motion.dev), free, one ESM import, no build step

```html
<script type="module">
  import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm"
</script>
```

Version pinned (the docs recommend against `latest`). The mini HTML/SVG `animate()` build is
~2.3 KB.

| Where | What |
|---|---|
| Money ring | **Spring** burn-down + fill. The single most satisfying moment in the app. |
| Money + momentum numbers | Count-up / count-down, never a snap |
| Card entrance | `stagger` on tab change — the app arrives instead of appearing |
| Adaptive home | Layout transitions between Dawn/Day/Dusk/Night |
| Loot + unlocks | Escalating celebration — a rare drop must *not* look like a small win |

### Background — static mood art + CSS modulation

A static SVG cannot react to state on its own, so the reactivity is CSS's job, not the art's:

1. Six base mesh SVGs = the unlockable **background moods** (hand-authored — see Appendix)
2. Ship them as static assets (zero runtime cost, service-worker cached, works offline)
3. Modulate **hue-rotate / saturation / opacity / drift speed** on top via CSS custom
   properties set from JS, bound to momentum and time of day

Result: real mesh-gradient depth *plus* a background that genuinely differs at momentum 8 and
88 — fixing gap #6 without a runtime gradient engine. The art sits on `#moodLayer::before`, not
in the `background` shorthand, so its opacity is momentum-bound like everything else.

### Removals

- **Pointer trail** — desktop-mouse eye candy in a phone-first app; `pointermove` barely fires
  on touch. It occupies the exact hero space the money ring needs.
- **MRZ strip** — 44 characters of vestigial passport noise in the most valuable pixels.
- **`background-attachment:fixed`** — replaced by the modulated mood layer.

---

## Data model additions

Additive only. Every existing field keeps its meaning; nothing is migrated destructively.

```js
S.money = {
  weekStart: '2026-08-17',                 // Monday
  envelopes: { groceries:81, gas:69, foodout:35, cannabis:12, fun:14, personal:17 },
  spend: [ { d:'2026-08-21', cat:'foodout', amt:6.11, note:'Tims' } ],
  efund: 0,                                 // mirrors config.efund
  efundTarget: 3395,
  monthlyUnlocked: 0                        // Real Moves $/mo counter
}
S.realMoves = { rentaug:false, disatf:false, aisubs:false, patreon:false,
                fit4less:false, cibcfee:false, envelope:false }
S.rewards   = { tokens:[], unlocks:[], skin:'filament', mood:'default' }
S.records   = { bestReadWeek:0, longestAnchorRun:0, lowestFoodOutWeek:null }
S.sealed    = { '2026-08-21': true }
```

---

## Hard constraints

1. **`scripts/notify.mjs` mirrors the momentum constants** (lines 20–31: `SMALL_KEYS`,
   `BIG_KEYS`, `dayGains`, `clampM`, `flowStateOf`, `momentumNow`). Any change to the momentum
   engine **must** be mirrored there in the same commit, or notifications silently break. This
   plan avoids touching the engine for exactly this reason.
2. **Offline must survive CDN failure.** Motion and the mood SVGs get service-worker cached,
   and every animation is feature-detected — if `import` fails, the app renders fully and
   statically. No animation is load-bearing for function.
3. **Honesty is not negotiable.** No invented money. The Weekly $228 and the emergency fund
   must reconcile against an actual CIBC statement. Variable rewards never touch the record.
4. **Reconcile monthly.** The emergency fund figure is only true if the money is actually
   there. A monthly reconcile prompt is part of the design, not an afterthought.
5. **Accessibility holds:** WCAG AA (body ≥4.5:1, large ≥3:1), full `prefers-reduced-motion`
   (Motion respects it; all animation degrades to instant), tap targets ≥44px, never color
   alone for state.
6. **Two unverified numbers stay visibly unverified.** Family support ($667/mo observed vs
   $2,000/mo planned — a $1,333/mo swing) and the DISATF purpose. The app must *show* these as
   unconfirmed rather than quietly assuming. That's what makes it trustworthy.

---

## Phases

Skin lands first — same reasoning as FLOWSTATE I: *"the theme lands first so every later
change already feels like the new app."* Each phase is one commit, live in ~40s.

| # | Phase | What | Effort |
|---|---|---|---|
| **1** | **New Skin & Motion** | Semantic tokens, 3-level elevation, type fix, inline SVG icon sprite, Motion CDN + spring ring + count-up + stagger, kill trail/MRZ, six background moods | ~3h |
| **2** | **Money Engine** | Weekly $228 burn-down, six envelopes, spend logging, Leak Log → spend, emergency fund climb, money hero | ~4h |
| **3** | **Real Moves** | Dollar-valued action list, `$/month unlocked` counter, unverified-number flags | ~2h |
| **4** | **Cash-Out** | Rest Tokens, milestone unlocks, Sunday rollover → fund jump | ~3h |
| **5** | **Variable Reward** | Date-seeded Wildcard, loot rolls, Daily Quest pool | ~2.5h |
| **6** | **Adaptive Home + Seal the Day** | Four time modes, Full-board toggle, closure ritual | ~3h |
| **7** | **Progress Narrative** | Deltas, records board, identity counters, Sunday Recap PNG | ~3h |
| **8** | **Reactive Environment** | Momentum-bound mood modulation, time-of-day tint, skins wired to unlocks | ~2h |

**Total ≈ 22.5h.** Phases 2 and 3 are the ones that answer the actual complaint; 1 is first
because he needs to *see* it change.

---

## Success criteria (honest ones)

- He opens the app **without being notified** — because there's a number in it he wants to see.
- A tap produces a change he can point at **outside** the app.
- Within 30 days: **at least three Real Moves complete.** Zero of eight got done in the eight
  days after the last toolkit rewrite; that's the baseline to beat.
- The emergency fund is **above $0** and the coverage number has moved off 0.6.
- On a bad day he still opens it, because the week resets Monday and nothing scolds him.
- He can answer "am I better than last month?" from the home screen, with a real number.
- The app looks visibly different at momentum 8 vs 88.

---

## Appendix — tools

Two were chosen. One survived: Motion. Haikei was dropped once it turned out to require a human
in a browser — see below.

### Motion — [motion.dev](https://motion.dev)

Free, open-source core; one pinned ESM CDN import; ~2.3 KB for the mini HTML/SVG `animate()`.
Hybrid engine, hardware-accelerated where the property allows, honors reduced-motion.
(**Motion+** is a separate optional paid extras bundle — not needed here.)

*Used for:* the spring ring, count-ups, staggered entrances, layout transitions, escalating
celebration.

### ~~Haikei~~ → hand-authored mood SVGs — *superseded 2026-08-21*

Haikei ([haikei.app](https://haikei.app)) is an **interactive browser generator** — sliders and a
download button, no API, no CLI, no headless export. The one artefact it produces could therefore
only ever come from Satya sitting in the browser, which made a cosmetic asset a hard human
dependency. Its licence terms also could not be confirmed: the fetch to haikei.app returned
content-blocked during research, and still did on re-check.

**Decision:** the six mood SVGs are hand-authored to the same brief instead. Haikei outputs a
static SVG, and a layered mesh gradient is just `<radialGradient>` blobs — nothing about the
format needed the generator. This also let the brief carry constraints Haikei's output would not
have honoured:

- **Transparent base, no opaque backdrop rect** — the page canvas stays authoritative and the
  opacity blend stays clean.
- **No `<filter>` / `feGaussianBlur`** — a blurred full-screen background layer is a real GPU
  cost on a phone. All softness comes from multi-stop gradient falloff.
- **Alpha ceilings per mood** so nothing fights the foreground cards.
- Self-contained, no external refs, 2.6–3.6 KB each, id-namespaced per mood.

Shipped in `moods/`: `default` · `drift` (10 anchored days) · `nebula` (25) · `glacier` (50) ·
`cinder` (100) · `meridian` (200). Cold → warm → gold, so the progression reads as escalating
reward. Precached in `sw.js` (`flowstate-v3`), and the CSS gradient stack still renders alone if
they 404.

**Four bugs this surfaced.** The first three were invisible to inspection and only showed up
once the art was rasterised and measured — see `tools/mood-measure.html`, which now guards all
of them.

1. **The art ignored momentum.** `--mood-img` was originally a layer in `#moodLayer`'s
   `background` shorthand, but `--mood-intensity` only scales the gradients through `calc()`
   inside their `rgba()`. A background-image's alpha can't be reached that way — so the SVG
   would have sat at full strength at momentum 0 while the gradients dimmed, quietly
   re-breaking gap #6, the exact problem this layer exists to fix. The art now lives on
   `#moodLayer::before`, whose `opacity` *is* bound to intensity, inheriting the drift and
   filter as a group.

2. **No mood could read warm.** The four gradients were hardcoded cyan/violet, so the stack
   fought any mood that wasn't — cinder's rose and meridian's gold both composited to brown.
   The poles are now `--mood-c1` / `--mood-c2`, carried per mood in `MOODS[]`, so the whole
   screen shifts together instead of the art fighting a fixed overlay.

3. **Cards inverted into holes.** Cards are opaque `--surface-1` (L\* 7.4). Measured over the
   real art at deep flow, the page *behind* the card band sat at L\* 9.3–15.3 — brighter than
   the cards on top of it, so every card read as a hole punched in a glowing screen. Fixed with
   a vertical `mask-image` falloff on the art layer: the hero band is card-free so the art keeps
   full strength where the ring sits, then falls off through the scroll body. Stops were chosen
   by sweeping candidates through the harness rather than by eye — the hero band loses only
   0.9 L\* while worst-case card-band lightness drops 9.5 → 6.5.

4. **Two unlocks were downgrades.** The six SVGs were authored independently, so their raw
   densities didn't line up with the earn order: plain `drift` measured *dimmer* than `default`,
   and `glacier` dimmer than `nebula`. Earning a reward at day 10 would have made the screen
   quieter. `MOODS[].k` is a per-mood brightness multiplier that normalises them into a
   monotonic ramp without re-authoring the art; `default` stays at 1.00 so the shipped baseline
   is untouched for anyone who has unlocked nothing.

**And one false alarm worth recording.** The harness first reported meridian as reading *green*
(hue 108) and I nearly "fixed" art that was fine. The metric was wrong, not the SVG: it took a
**linear** mean of hue, and meridian is a violet/gold composition — averaging 258° and 40° lands
on green, a colour that appears nowhere in the file. Switching to a chroma-weighted **circular**
mean put it at hue 23, correctly gold. Measurement gets verified before it gets trusted; the
same pass also caught that the elevation check was sampling the hero band, which is card-free,
instead of the band where cards actually sit. Meridian did turn out to need a smaller real fix —
two violet blobs at .50/.40 opacity made the day-200 gold crown 42% violet — but that is a
composition judgement, not the thing the broken metric was shouting about.

### Considered and rejected

**Base44** and **Lovable** are full app builders — both want to regenerate the app on their own
stack and would fight the single-file / Firestore / offline / service-worker setup that already
works. Useful for throwaway mockups, wrong for shipping into this codebase.

**Rive** would be ideal for the ring, but its free tier is editor-only — exporting `.riv`
runtime files starts at $9/mo. Motion covers the same ground for free.

**21st.dev** is now paid-only (from $6/mo) and Tailwind/React-shaped.
