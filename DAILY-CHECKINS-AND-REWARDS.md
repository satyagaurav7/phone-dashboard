# FLOWSTATE: daily check-ins and rewards

Research and implementation proposal, 2026-09-05. Source baseline: commit `6841352215c2e07b5477a1b1a176dbecfb68941c`.

**Status: proposed, not implemented.** This documentation change does not alter the application, Google records, Home routines, or notification settings. It is the repository-safe companion to a private Deep Research report. It includes no private check-in answers, account addresses, appointment details, or user health history.

## Product recommendation

Use a short loop: assess capacity, select one useful action, define an easy start, acknowledge the actual result, and adjust tomorrow. Keep the full Google Tasks checklist. A focused view must not replace it.

Two optional daily interactions are enough to test initially:

- **Morning, about 45 seconds:** capacity (low/usual/plenty); one selected existing task; smallest first step and a recognizable cue.
- **Evening, about 60 seconds:** one real win or nothing to add; optional obstacle; tomorrow's first step.

An on-demand “Help me start” interaction can ask whether the obstacle is uncertainty, effort, discomfort, or waiting for someone. It offers a smaller step, clarification, or a pause. These are authored self-reflection prompts, not diagnostic tests. Durations and thresholds are pilot defaults, not scientifically established optima.

The owner explicitly chose the full routine checklist: the prior Google audit records 22 daily and four weekly recurring items. Preserve those records and their untimed presentation. Use application-level grouping, a visible full-list control, and an optional selection of one to three focus items. Keep genuine deadlines discoverable; do not silently reschedule them.

No language model is required for the first version. Templates and transparent rules should handle the loop. Optional future generative text must not fabricate completion or mutate records without an explicit user action.

## Evidence and its limits

| Finding | Design implication and limitation |
| --- | --- |
| Progress-monitoring interventions improved goal attainment on average across 138 randomized studies. | Show recorded actions and a short weekly review. This does not validate points or a particular prompt frequency. [Harkin et al., 2016](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20Harkin%20raw%20FINAL.pdf). |
| Cue/action planning helps people act on intentions. | Ask for one first step linked to a situation. Avoid invented time blocks. [Gollwitzer, NCI research resource](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions). |
| Immediate enjoyment and earlier rewards can support persistence/motivation in studied settings. | Offer an enjoyable activity pairing and prompt factual acknowledgement. App-specific effectiveness remains untested. [Woolley and Fishbach, 2016](https://kaitlinwoolley.com/wp-content/uploads/2017/08/woolleyfishbachjcr20161.pdf), [2018](https://kaitlinwoolley.com/wp-content/uploads/2018/07/woolleyfishbachjpsp2018.pdf). |
| Expected tangible rewards can undermine interest under some conditions; reward timing studies also find benefits. | Neither “all rewards are bad” nor “more rewards are better” is justified. Prefer choice and evaluate the result. [Deci et al., 1999, institutional abstract](https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/), [Liu et al., 2022](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.853879/full). |
| Constructive responses to mistakes can support improvement; a single habit lapse need not derail formation. | Preserve progress and offer a manageable restart. No shame or streak reset. [Breines and Chen, 2012, abstract](https://journals.sagepub.com/doi/10.1177/0146167212445599), [Lally et al., 2010](https://repositorio.ispa.pt/server/api/core/bitstreams/370f1dca-cc04-4d3d-a0f0-36d16109ec37/content). |
| Mood-monitoring research does not establish that frequent tracking reliably improves mental health, and burden can occur. | Keep feelings optional, private, and separate from rewards. This is a general product boundary, not a statement about this owner. [Astill Wright et al., 2026](https://mental.jmir.org/2026/1/e84020), [2025](https://mental.jmir.org/2025/1/e79500). |

Sources were accessed on 2026-09-05. Some research was available as abstracts or indexed publisher text; do not claim full-text review of every cited paper. No study validates the exact proposed product.

## Repository findings to resolve before building

1. `index.html` maintains dashboard checkmarks independently of Google Tasks. Firestore sync does not establish Google Tasks sync.
2. Momentum subtracts four per elapsed day in `normalize()`, with a zero floor; prolonged inactivity can reach zero. Theme intensity also depends on momentum. Review whether this conflicts with the supportive design.
3. Existing completion glow is useful. Reward arrays/theme assets are scaffolding, not proof that unlock granting works.
4. `PRODUCT.md` still contains punitive day-rejection guidance. `FLOWSTATE-II-PLAN.md` contains rest tokens, variable prizes, and unsupported neurochemical claims. Treat these as historical, not current implementation requirements.
5. `calendar.yml` is manual and dry-run-only, but **`notify.yml` still has scheduled triggers**. Do not say all automation is paused. Runtime delivery and credentials were not inspected in this research.
6. `notify.mjs` checks dashboard flags and includes “today isn't counted yet.” It can therefore disagree with tasks completed elsewhere. Audit its source and actual delivery before adding reminders.
7. `setDoc(..., {merge:false})` writes the whole dashboard state. A background importer or second device requires a safer concurrency design before it shares this state.
8. Old task/score/budget assumptions may be stale. Confirm current values before turning them into recommendations or rewards.

No runtime failure or psychological reaction is claimed solely from these source observations.

## Reward rules

Start with a quiet acknowledgement of a confirmed action and an optional enjoyable pairing. Use factual sentences such as “Practice completed” or “Your next step is saved.” If nothing was logged, do not infer that nothing was achieved.

An optional cosmetic milestone can be tested at five and ten cumulative meaningful-action days. A qualifying day has at least one user-selected discretionary focus action confirmed complete. Counts are not consecutive. A comfortable theme remains available without earning anything.

Required properties:

- A start and a completed task are different records.
- Mood, energy, positivity, app opens, and number of check-in answers do not earn points.
- Essential care, meals, sleep, ordinary rest, and human contact are never locked behind rewards.
- No random payouts, loot rolls, hidden multipliers, fake savings, or automatic budget increases.
- No relationship between app points and legal or immigration status.
- No automatic task completion when a timer ends, a routine runs, or the user remains silent.
- A missed day retains previous milestones. Returning is welcomed without falsely changing history.
- A mistaken completion can be corrected; replay and toggling cannot duplicate rewards.
- Essential/time-sensitive actions are not delayed until a reward threshold is reached.
- Cosmetic rewards can be disabled without disabling tasks or check-ins.

The dopamine prediction-error/two-week rule and precise motivational multipliers in older plans lack support for this application. Do not repeat them as facts.

## Source-of-truth contract

| Data | Owner |
| --- | --- |
| Task title, scheduled date, completion | Google Tasks |
| Timed commitments | Google Calendar |
| Optional capacity/feeling/obstacle and first-step selection | Private FLOWSTATE records |
| Reward grants and richer habit annotations | Private FLOWSTATE ledger linked to source records |
| Voice task commands and simple routines | Google Home |

Recommended sequence: read-only task proof of concept → check-in cards → explicit provider writes → idempotent reward ledger → consolidated notification controls. Do not reactivate the retired publisher or generate routine Calendar events.

### API and integration constraints

- Google documents task voice creation/edit/completion. Exact due-today and cross-list retrieval remains a speaker acceptance test. A Home Tasks settings page is not evidence of a default-list selector. [Google task controls](https://support.google.com/googlehome/answer/16722329?hl=en).
- The Tasks API's `due` means scheduled date, not true deadline, and cannot preserve time of day. The documented task resource exposes neither recurrence rules nor native skipped status. [Task resource](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).
- Read all list/task pages. Use `showCompleted=true` plus `showHidden=true` for first-party-client completions. Use `updatedMin` with reconciliation; handle deletions. The reviewed API has no documented completion watch channel, so design polling/refresh rather than assume webhooks. [List method](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list), [API surface](https://developers.google.com/workspace/tasks/reference/rest).
- Preserve native recurring series. Establish occurrence identity using harmless completion/missed-day tests; do not assume a new task ID per occurrence or use mutable timestamps alone as reward IDs. [Repeating tasks](https://support.google.com/tasks/answer/12132599?hl=en).
- Home scripts support documented device/time/voice operations. No direct FLOWSTATE check-in write or Google Tasks completion starter was found in the reviewed schema. Do not confuse a spoken prompt with a form that captures an answer. [Supported schema](https://developers.home.google.com/automations/starters-conditions-and-actions).
- Do not build on retired Conversational Actions or assume a Gemini API integration installs itself into Home. [Google sunset documentation](https://developers.google.com/assistant/ca-sunset).
- Use separate records, narrow updates, and transactions where appropriate for concurrent reward grants. Plan offline pending state and retry deduplication. [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

Application-owned records should include: `checkIn`, `taskLink`, `actionEvent`, `rewardGrant`, and `preferences`. Store provider identifiers privately. Record both the observed time and reported action time, timezone, source, and confirmation state. If recurrence mapping is uncertain, do not automatically award a milestone.

Prefer minimal data, optional free text, clear retention, export/delete, and quiet hours. Check ownership rules before storing sensitive answers; the existing shared dashboard document is not automatically suitable.

## Google Home experience

The current official device matrix lists **Google Home Max without Gemini Live**; Home Max and Nest Hub Max are different products. Basic personal organization does not need Home Premium. Physical hardware/account state must still be verified. [Google feature/device documentation](https://support.google.com/googlehome/answer/16618650?hl=en).

Use Personal Routines for personal information. Household routines cannot supply personal calendar results. Exact available actions vary. [Google routines](https://support.google.com/googlehome/answer/7029585?hl=en).

Proposed phrases, not installed features:

| Phrase | Intended behavior |
| --- | --- |
| “Morning check” | Short capacity/next-step prompt; separately tested task retrieval; optional agenda. Answers are entered privately in the app. |
| “Help me start” | First-step prompt and optional short timer/audio. No assumed branching or persistence. |
| “Evening reset” | Invite a private win/obstacle/next-step review; optional tomorrow agenda. |
| “What are my tasks due today?” | Test across lists; use the phone's full checklist if incomplete. |
| “Mark my task to return the parcel as completed” | Native action; confirm the matched record. |
| “Focus time” | Previously saved routine; physical timer execution remains untested. |

A timer is a start aid, not a completion detector. Voice-originated reward acknowledgement may wait until FLOWSTATE refreshes; there is no implemented immediate speaker reward callback.

## Notification policy

Begin with on-open and voice-triggered check-ins. Optional reminders can trial a maximum of two discretionary prompts per day, with one dismissal sufficient. This cap is a design choice. Do not create extra daily task debt from unanswered check-ins.

Audit Tasks phone notifications, existing app pushes, Home routines, and other reminders together. Google documents 9 AM notifications for untimed tasks on Android; actual batching and controls must be checked. Do not assume per-list muting or disable necessary reminder channels indiscriminately. [Android Tasks guidance](https://support.google.com/tasks/answer/7675838?co=GENIE.Platform%3DAndroid&hl=en).

Use America/Toronto for planning, explicit quiet hours, expired-prompt suppression, and one cross-device dedupe policy. Closing a day suppresses discretionary reflection prompts but keeps records editable and real deadline reminders independent.

## Validation and pilot

Runtime checks are pending. Verify these before describing the system as integrated:

1. Full inventory preserved; focused view reversible; undated and overdue tasks discoverable.
2. Harmless task in each list retrieved and completed correctly by voice.
3. App observes completion once; no reward on failed writes, duplicate polls, or timer expiry.
4. Complete/undo/recomplete preserves truthful state without duplicated grants.
5. A missed recurring task and its next occurrence map correctly without invented history.
6. Date-only tasks survive Toronto midnight, travel/timezone differences, and DST tests.
7. Concurrent phone/laptop/background edits do not overwrite one another.
8. Offline edits remain explicitly pending and reconcile once.
9. Skipping, low capacity, and unpleasant feelings cause no penalties or diagnoses.
10. Shared-home use does not expose private check-in answers.
11. Deletion, opt-out, quiet hours, reduced motion, and reward-off mode work.
12. Calendar publisher stays dry-run-only; separate notification runtime is audited honestly.

Use a 14-day usability pilot: days 1–3 approximate baseline; days 4–10 brief checks plus acknowledgement/enjoyment; days 11–14 optional milestone. Measure meaningful focus actions, perceived helpfulness/pressure, and duplicate reminders. Do not optimize app opens or positive mood reports. This one-person sequence cannot prove causality. Simplify or stop if the extra tracking creates burden.

## Instructions for the next Claude session

Read `CLAUDE.md` and this proposal before older product/reward documents. First report which capabilities are source-verified, previously reported, proposed, and physically tested. When implementation is requested, begin with a narrow task-read proof of concept and a reviewable change to contradictory copy. Preserve current records and do not quietly reactivate scheduled Google writes. Keep private implementation evidence and user answers out of this public repository.
