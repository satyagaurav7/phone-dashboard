# FLOWSTATE handoff — 2026-09-05

Status of the dashboard after the P1 hardening pass. Written for the next
session. Nothing sensitive here: no account addresses, tokens, keys, task
contents, appointment details or event IDs.

Read with [CLAUDE.md](CLAUDE.md) (safety rules),
[CHECKINS-IMPLEMENTATION-PLAN.md](CHECKINS-IMPLEMENTATION-PLAN.md) (phases) and
[REMINDER-CHANNELS.md](REMINDER-CHANNELS.md) (channel audit).

## Commit status

Local, remote and deployed are three different things. As of writing:

| | Value |
| --- | --- |
| Local `main` | `83262f7` |
| Pushed to `origin/main` | see §"Push and deploy" below |
| Deployed to Pages | **not confirmed by this session** |

A push is not a deployment. GitHub Pages rebuilds in roughly 40 seconds; the
app must also be force-closed or hard-refreshed for the service worker to pick
up a new version.

## Deployed / shipped in code

These are committed and behave as described in automated tests.

| Area | State |
| --- | --- |
| Momentum decay | Removed. Progress only rises; quiet days cost nothing |
| Background brightness | Fixed. No longer follows the score |
| `actionDays()` | Days in the last 14 with anything recorded — the live signal |
| Narrow writes | `Dash.set` / `Dash.setMany` / `Dash.REMOVE`, field-path patches |
| Durable queue | Persisted, restored on load, replayed over the fresh snapshot |
| Sync status | saving / synced / offline+N / refused+N / local-fail / no-cloud |
| Day boundary | Guard reloads when the local date moves |
| P1 check-in cards | Morning and evening, all fields optional, deletable |
| Text escaping | `escHtml` / `escAttr` on every stored-text interpolation |
| Reminder controls | Per-category switches + snooze; nudges default off |
| Service worker | Prefix-scoped cache deletion, scope-limited fetch, no error caching, messaging isolated |
| Token pruning | `arrayRemove`, no longer erases a concurrent registration |
| Calendar/Tasks publisher | Manual, `--dry-run` only, no Google credentials |

## Local-only / not in this repository

- The other agent's alignment work — `DASHBOARD-ALIGNMENT-AUDIT.md`,
  `dashboard-core.mjs`, `tests/dashboard.test.mjs`, commits `01f2fa7` /
  `329302a`, branch `review/dashboard-alignment-20260905`. **Not on remote and
  not reachable from this workspace.** Its 18 passing tests are a candidate
  implementation, not deployment evidence. Nothing here claims to have applied
  it; the fixes above were implemented from requirements.

## Proposed, not built

- **P2 Google Tasks read bridge** — gated behind the pilot. Start read-only
  across both lists, show freshness and errors, prove recurrence with harmless
  test tasks.
- **P3 explicit writes**, **P4 reward ledger** — gated behind P2 provenance.
- Weather / currency / holiday widgets — optional, no demonstrated need.

## Blocked

| Blocked | Why |
| --- | --- |
| Signed-in round-trip test | App is behind a password gate this session will not sign into |
| Physical speaker tests | No speaker access |
| Google Tasks / Home / ChatGPT automation state | Needs authorised live surfaces |
| Publishing sensitive payloads | Automatic review rejected them. Not bypassed, not retried |

## Test evidence

Classification per the brief. **Inspection alone is not an end-to-end pass.**

| Test | Result |
| --- | --- |
| Disjoint concurrent writes preserve other device's fields | passed automatically |
| Offline hold → reload → replay over fresh snapshot | passed automatically |
| `REMOVE` survives queue serialisation | passed automatically |
| Refused write dropped, refusal stays visible | passed automatically |
| Reconnect drains queue in order | passed automatically |
| Fresh account seeds document | passed automatically |
| Input escaping vs `onerror` payload (real browser) | passed automatically |
| P1 renders in seven states at 375px | passed automatically |
| Momentum: 10 quiet days no longer decays | passed automatically |
| `actionDays` window arithmetic | passed automatically |
| Publisher has no schedule, no secrets, both dry-run | passed automatically |
| Signed-in save round-trip | **not tested** — blocked |
| Real phone layout | **not tested** — blocked |
| Midnight rollover on device | **not tested** — logic only |
| DST boundary behaviour | **not tested** |
| Multi-tab queue ownership | **not tested** — see limits |
| Same-field two-device conflict | **not tested** — see limits |
| Service worker cache isolation in browser | **not tested** — logic only |
| Speaker voice retrieval / completion | **not tested** — blocked |

## Known limits, stated plainly

- **Multi-tab is not coordinated.** The pending queue is per-tab in
  `localStorage` under one key. Two tabs open at once can interleave writes to
  it. This is not full multi-tab support and is not presented as such.
- **Same-field conflicts are last-write-wins.** Narrow writes fix *disjoint*
  field races. Two devices editing the same field, or adding to the same array
  concurrently, still resolve by arrival order.
- **Offline is partial.** The shell is cached. Authentication and the Firebase
  modules have their own network dependencies, so a cold offline start is not
  guaranteed to reach a usable app.
- **A local tick is not Google Tasks completion.** Dashboard taps are local
  activity records. Nothing in this app completes a Google task.
- **"Synced to cloud" means Firestore only** — not Tasks, Calendar or speaker.

## Phone actions still needed

Only where a person is genuinely required.

1. **Hard-refresh or force-close the app** so the new service worker activates.
2. **Confirm the sync line** reads "Synced to cloud" after one tap. If it sticks
   on "to sync", the writer needs looking at.
3. **Count one full day of notifications** across all sources — app push, Google
   Tasks, speaker. Establishes whether Tasks fires once at 09:00 or once per
   task.
4. **Delete the two blank recurring task rows** if they are still present.
5. **Confirm the recurring evening class series** is current before anything
   acts on it. Do not delete from memory.
6. **Confirm the dated appointment** against an authoritative source; it exists
   as a task with no matching Calendar event.

## Remaining acceptance tests

From the plan: A03, A04, A05, A06, A07, A08, A09 (Tasks bridge — gated), A10
and A11 partially covered by automated tests but not on device, A17, A18, A20
(speaker), A19 (phone notification count), A24 (pilot outcome).

## Pilot

P1 has shipped, so three days of the same active cards is **not** an untreated
baseline. A genuine comparison needs the cards off for the first stretch, then
on. Satya may decline the baseline or the tracking entirely. Reliability,
privacy and truthfulness fixes are not gated on the pilot and continue during
it; reward expansion and the Tasks bridge remain gated.
