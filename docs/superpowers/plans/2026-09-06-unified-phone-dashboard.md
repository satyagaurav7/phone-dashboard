# Unified Phone Dashboard Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans when available to implement this plan task-by-task. Otherwise follow these checkboxes directly. No skill installation or parallel agents are required. The shared handoff protocol is in `docs/integration/START-HERE.md`.

**Goal:** Integrate workspace apps into Phone Dashboard while giving Claude and Codex one shared implementation record.

**Architecture:** Domain projects retain their logic and storage. A local collector inside Phone Dashboard emits validated, minimized snapshots; an authenticated publisher delivers them to a private Firestore namespace consumed by a new Workspace view. Shared Markdown records coordinate development across agents.

**Tech Stack:** Existing browser ES modules, Node ESM and `node:test`, existing Firebase browser/Admin SDKs, Firestore emulator for authorization tests. Python projects remain Python. Do not introduce a frontend framework, shared database, event bus, or new hosted dashboard.

**Spec:** [Unified workspace specification](../../integration/SPEC.md). Read it before executing. [Progress ledger](../../integration/STATUS.md) is authoritative for task status.

## Global constraints

- Phone Dashboard is the integration destination. Preserve Today and existing auth/sync/check-ins.
- Keep separate project repositories. Never initialize Git at the Projects root.
- Source records and domain computations stay with their owning projects.
- Runtime snapshots and private collector configuration live outside the repository and outside the Pages artifact.
- Google Tasks remains the action source; Calendar remains timed commitments. Do not enable Calendar/Tasks write publishing as part of this integration.
- No trade execution, auction bidding, downloader execution, video upload, or automatic new notifications in version 1.
- Both agents use the same SPEC, STATUS, and plan. Follow the ownership/handoff protocol; do not assume shared chat memory or shared worktree state.
- Tests use synthetic fixtures, injected clocks/fetch/filesystem handles, and emulator data. Never copy actual financial/identity/profile data into fixtures.
- Distinguish implemented locally, tested, published, and verified on phone. A planned test is not evidence.

## Baseline and task workflow

All commands below run from `phone-dashboard` unless another working directory is stated. New file paths are relative to that repository. Check actual files before modifying: an earlier handoff contains source from other branches that may not exist here.

Before each task, record checkout/branch/HEAD and existing changes in STATUS. Use a local runtime with Node >=20 for the proposed native-test scripts; verify `node --version`. If unavailable, resolve a supported runtime and record its executable path before testing. Do not run source scripts that scrape, upload, schedule, or trade to obtain fixtures.

For behavioral changes, add the specified failing tests, run them, implement focused code, rerun tests and the affected existing checks, then inspect the diff. If the task includes an authorized commit, stage exact files within the owning repository and record the hash in STATUS; never run `git add .` from Projects. Release ownership at handoff. Later task commands refer to files created by earlier tasks, not pre-existing capabilities.

## T1: Establish a safe deployment artifact and baseline

**Files:** Modify `.github/workflows/deploy.yml`; create `scripts/build-site.mjs`, `tests/site-build.test.mjs`; modify `.gitignore`; update `docs/integration/STATUS.md`.

**Consumes:** Actual app asset references in `index.html`, `manifest.json`, `sw.js` and modules discovered from imports.

**Produces:** `buildSite({root, outDir})` exported by `scripts/build-site.mjs`, which copies only explicitly approved public assets into a staging directory. CLI: `node scripts/build-site.mjs --out <directory>`. It refuses output equal to the source root and does not recursively copy repository root.

- [ ] Inventory references and capture current baseline. Record `git status --short`, branch, HEAD, Node version, existing test entry points, current rendered Today/auth behavior, and source asset list. Read `HANDOFF.md` for already-completed fixes and unresolved branch work.
- [ ] Write `tests/site-build.test.mjs` using a temporary synthetic source tree containing `index.html`, `sw.js`, `manifest.json`, `schedule.json`, dummy icons, and fake `.env`, `docs/private.md`, `.git/config`, `scripts/private.json`, `runtime/snapshot.json`. Invoke `buildSite`; assert approved shell files exist and every private file is absent. Assert a missing required shell asset fails clearly. Assert `outDir === root` is rejected.
- [ ] Run `node --test tests/site-build.test.mjs`; confirm the test fails because the build function does not exist.
- [ ] Implement the builder with an explicit file/directory allowlist from actual imports. Add `integrations/` when T3 introduces it; only browser-safe modules may live there. Keep server code under `scripts/`. Example copy primitive:

```js
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
// publicFiles is the reviewed manifest, never a recursive root scan.
await mkdir(outDir, { recursive: true });
for (const relative of publicFiles) {
  await cp(join(root, relative), join(outDir, relative), { recursive: true });
}
```

- [ ] Change deploy workflow to set up Node, run `node scripts/build-site.mjs --out _site`, then upload `_site` instead of `.`. Add `_site/`, `.integration-local/`, and local integration-config filenames to `.gitignore`; default runtime output remains outside the repository.
- [ ] Re-run the build tests. Build into a temporary location, preview that artifact, and verify every required shell/module/icon resolves plus existing service worker and authentication still initialize. No push/deployment is required to complete T1 locally.

**Acceptance:** Explicit artifact allowlist, private-file negative tests pass, artifact preview works, current production workflow changes are reviewable. Keep historical deployment behavior in STATUS, not as a claim that this version is deployed.

## T2: Define registry, validation, and freshness

**Files:** Create `integrations/registry.mjs`, `integrations/contract.mjs`, `tests/integration-contract.test.mjs`.

**Consumes:** SPEC inventory and contract.

**Produces:** `SOURCES` registry; `validateSnapshot(input)` returning `{ok:true,value}` or `{ok:false,errors}`; `displayState(snapshot, nowMs)` returning a status string including derived `stale`. Validation is browser-safe and deterministic. Hashing happens in the collector, not the view.

- [ ] Define stable IDs: `encore`, `ai-trading-lab`, `sleepforge`, `fanbox-downloader`, `anchor-context`, `ai-memory-portability`, `personal-hub`, `pr-documents`, `graphify`. Phone Dashboard itself remains the shell, not a self-polling adapter.
- [ ] Add synthetic schema tests for valid snapshots, unknown keys/IDs, wrong schema versions, non-finite numbers, too many metrics, oversized payloads, invalid dates, expiry before observation, and hostile links. Pass a clock into date-sensitive validation if needed; never use wall-clock dates in fixtures.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { displayState } from '../integrations/contract.mjs';
test('snapshot is stale at its expiry', () => {
  const snapshot = {
    status: 'ready', observedAt: '2026-09-06T14:00:00Z',
    sourceUpdatedAt: null, expiresAt: '2026-09-06T14:15:00Z'
  };
  assert.equal(displayState(snapshot, Date.parse(snapshot.expiresAt)), 'stale');
});
```

- [ ] Run `node --test tests/integration-contract.test.mjs` to see failure, then implement the registry and contract. Registry specifies labels, group, mode, TTL, allowed metric keys and allowed source hosts. Unverified URLs remain absent; references are explicit `reference-only`.
- [ ] Reject unknown fields rather than spreading incoming objects. Cap strings/arrays/bytes as SPEC requires. Distinguish source-data age from observation age. Keep reason-code copy in a fixed mapping.
- [ ] Re-run tests and T1 artifact checks. Record the contract version in STATUS.

**Acceptance:** Every source has a mode, bounds are enforced, freshness is deterministic, and arbitrary upstream JSON cannot reach the view.

## T3: Deliver a fixture-backed Workspace view

**Files:** Modify `index.html`, `sw.js`, `scripts/build-site.mjs`; create `integrations/view.mjs`, `integrations/controller.mjs`, `integrations/fixtures.mjs`, `tests/integration-view.test.mjs`.

**Consumes:** T2 contract/registry and a transport function.

**Produces:** `mountWorkspace({container, sources})` returning `{render(snapshots, nowMs), dispose()}`; `startWorkspace({view, subscribe, now})` returning a cleanup function. `subscribe(onSnapshots, onError)` returns an unsubscribe function. T6 supplies the real transport; fixtures supply it first.

- [ ] Write tests for distinct ready/stale/unavailable/not-configured/reference-only text, exact source ordering, empty metrics, and literal rendering of `<img onerror=...>` fixture text. Use an existing DOM test setup if present; otherwise keep presentation formatting pure and verify DOM interactions in a local browser.
- [ ] Run `node --test tests/integration-view.test.mjs`; observe failure. Implement a Workspace entry within the existing navigation, leaving Today default. Build text using `textContent`; validate outbound link protocols/hosts before assigning `href`.
- [ ] Lazy-load on Workspace entry after authentication. Render fixtures only in an explicit development mode; show a visible fixture badge and ensure production mode cannot silently display fixtures as live data. Display "Available on laptop" for local-only tools rather than a broken phone localhost link.
- [ ] Mount each section independently so a failed source cannot block Today. Dispose listeners and clear snapshots on sign-out and when leaving Workspace. Do not cache private snapshots in service worker or persistent browser storage.
- [ ] Add browser module files to T1 allowlist and shell cache strategy where needed; bump the existing cache version once for changed shell assets. Cache static modules, never integration data.
- [ ] Verify 390px and 1280px layouts, keyboard focus, 44px targets, reduced motion, stale clock transition, offline shell, blocked transport, and sign-out. Record screenshots/results in a local non-published QA location. Re-run contract/view/build tests.

**Acceptance:** A usable mobile Workspace with synthetic data and honest states; existing dashboard function still works. This completes the first reviewable UI slice before cloud setup.

## T4: Collect Encore and trading health

**Files:** Create `scripts/integrations/collect.mjs`, `scripts/integrations/config.mjs`, `scripts/integrations/adapters/encore.mjs`, `scripts/integrations/adapters/trading.mjs`, `tests/integration-collect.test.mjs`, `tests/integration-adapters.test.mjs`.

**Consumes:** Private config path passed as `--config`; explicit source roots/base URLs; injected fetch/readFile/clock.

**Produces:** Adapter signature `async collectSource({config, fetch, readFile, now}) -> snapshotWithoutRevision`; collector adds canonical SHA-256 `revision`, validates, and writes one JSON snapshot per source atomically to external `--out` directory. CLI defaults to preview and performs no cloud writes.

- [ ] Create synthetic mocked HTTP responses matching current handlers; inspect bounded field structure for product-feed schema without printing raw catalogue/personal values. Test 200, 404, malformed JSON, oversized response, stalled fetch, source timestamp missing/old, and partial failure across sources.
- [ ] Tests must assert collector requests only GET `/api/products`, GET `/api/status`, GET `/api/health`; no refresh/scrape or trading endpoints. Assert trading watchlists, raw errors/cache keys, and portfolio fields are absent in output. Assert the summary endpoint is not requested by default.
- [ ] Implement bounded collection with `Promise.allSettled`, at most two simultaneous requests, 5-second timeout per request, source-specific response size cap (products up to 25 MiB, health/status up to 128 KiB), and a fixed reason-code mapping. Stream or size-check before materializing unbounded responses. URL config is trusted operator input and never editable from cloud snapshots.

```js
const response = await fetch(url, {
  method: 'GET', signal: AbortSignal.timeout(5000), redirect: 'error'
});
if (!response.ok) throw new Error('unreachable');
// Read with an enforced byte limit, then map only allowed fields.
```

- [ ] Map Encore catalogue counts/timestamp from actual source fields; GET `/api/status` describes its current job, not a guaranteed successful catalogue update. Do not recompute pricing. Trading maps only boolean reachability, mode and existing guardrail booleans. Optional summary work remains disabled until a separate minimization test demonstrates exactly what can leave the laptop.
- [ ] Reject unknown config sources, directory traversal, credential-bearing URLs, output under repository root, and output inside source roots. No shell commands, recursive workspace scanning, source mutation, or process launching. Write temp file then atomic rename on the same volume.
- [ ] Run `node --test tests/integration-collect.test.mjs tests/integration-adapters.test.mjs`. Demonstrate a fixture-only CLI run with private temporary config/output, then an optional local endpoint read if available. Capture statuses/counts only in handoff.

**Acceptance:** Two sources produce contract-valid snapshots independently; failure remains bounded; local collector has no publication or source-write side effects.

## T5: Cover remaining apps and references

**Files:** Create adapters `scripts/integrations/adapters/sleepforge.mjs`, `downloader.mjs`, `references.mjs`, `graphify.mjs`; extend collector and adapter tests; update registry only for verified source metadata.

**Consumes:** Explicit external file paths and T4 adapter signature. Read `sleep-sounds-channel/src/sleepforge/catalogue.py` and downloader source to verify schemas before mapping. Reference entries use registry labels, not scraped document content.

**Produces:** Contract-valid snapshots for the remaining IDs; configured/reference state for every inventory row.

- [ ] Create synthetic ledger and manifest fixtures representing success, partial writes, missing files, and malformed JSON. Assert no filenames, titles, seed/private IDs, URLs, cookies, profile contents, or local paths survive minimization. File-modification time is a freshness hint, never proof an upload succeeded.
- [ ] Implement Sleepforge counts and supported stage values from actual ledger fields; never infer video visibility from a recorded ID. Downloader is opt-in through private config; absent path yields `not-configured`, not an error requiring the user to run it.
- [ ] Implement references using fixed project labels and mode. Do not traverse Personal Hub, PR documents, or profiles to build these entries. AI Memory Portability remains reference-only until an actual service is independently verified.
- [ ] Read Graphify graph metadata with a 10 MiB cap; output counts and observation/source timestamps only. Never publish the graph, absolute paths, code labels, or inferred relationships. Large/missing graphs produce a bounded status.
- [ ] Extend `node --test tests/integration-adapters.test.mjs tests/integration-collect.test.mjs` to assert all registry IDs receive an explicit state and no source's failure aborts others. Preview all cards in T3.

**Acceptance:** All workspace apps/reference collections are represented honestly, with no unintended content upload or automatic app execution.

## T6: Add private snapshot transport

**Files:** Create `scripts/integrations/publish.mjs`, `integrations/firestore-transport.mjs`, `tests/integration-publish.test.mjs`, `tests/integration-rules.test.mjs`, `firebase.integration.json`, `firestore.integration.rules`, `docs/integration/OPERATIONS.md`; update `scripts/package.json` for a reviewed emulator testing dependency if needed.

**Consumes:** T2 validated snapshots, existing signed-in browser user, operator-configured owner UID/credentials, inspected current production rules baseline.

**Produces:** `publishSnapshots({snapshots, uid, store, dryRun}) -> summary` with injected transactional store for unit tests; real Admin adapter restricted to `users/{uid}/integrations/{registeredSourceId}`. Browser `subscribeSnapshots({db, uid, onSnapshots, onError}) -> unsubscribe`. CLI `node scripts/integrations/publish.mjs --input <external-dir> --dry-run` is default; `--apply` is explicit.

- [ ] Inspect existing deployed rule configuration through available authorized interfaces before designing a production merge. Keep emulator rules and proposed production delta distinct. If access is unavailable, record it and continue emulator/local work.
- [ ] Add tests proving dry run invokes zero writes, unregistered source IDs fail, older observations cannot overwrite new ones, equal revisions skip writes, and an out-of-order race converges to the newest observation through a transaction. Do not use a plain read-then-write sequence.
- [ ] Write emulator authorization tests: unauthenticated read denied, wrong UID read denied, owner read allowed, all browser writes denied for integration namespace, existing dashboard paths retain their inspected behavior. Example assertion shape using the selected Firebase rules test SDK:

```js
await assertFails(getDoc(doc(anonymousDb, 'users/owner/integrations/encore')));
await assertFails(getDoc(doc(otherUserDb, 'users/owner/integrations/encore')));
await assertSucceeds(getDoc(doc(ownerDb, 'users/owner/integrations/encore')));
await assertFails(setDoc(doc(ownerDb, 'users/owner/integrations/encore'), fixture));
```

- [ ] Implement allowlist/path/size validation before Admin use and transactional revision checks. Do not reuse raw notification code that also sends FCM. Restrict credentials to the operator environment, document that Admin bypasses rules, and never place key files or refresh tokens under the published repo.
- [ ] Wire browser transport after successful existing authentication. Revalidate stored snapshots before rendering; a malicious stored object must not add fields, links, or markup. Cleanup all subscriptions on sign-out. Add the browser module to artifact allowlist.
- [ ] Run unit tests with `node --test tests/integration-publish.test.mjs`; run `firebase emulators:exec --only firestore --config firebase.integration.json "node --test tests/integration-rules.test.mjs"` after configuring local test dependencies. Record actual CLI/SDK versions and emulator project ID in OPERATIONS. These commands must not target the production project.
- [ ] Write OPERATIONS with private config fields, exact tested collect/preview/publish commands, credential setup references, namespace/rules merge procedure, freshness behavior, failed-source recovery, and rollback. Default manual execution; no scheduler installed by this task.

**Acceptance:** Validated snapshots move through emulator to Workspace; unauthorized reads/writes fail; dry-run and monotonic publishing tests pass; live setup is clearly separated from local completion.

## T7: Verify phone rollout and shared-agent continuation

**Files:** Modify `docs/integration/OPERATIONS.md`, `STATUS.md`; modify `.github/workflows/deploy.yml` only if verified rollout requires it. Any production rule changes must derive from the inspected baseline and remain separately reviewable.

**Consumes:** Completed T1–T6, actual authorized deployment target and private operator configuration.

**Produces:** A tested release artifact, rollout evidence, and complete next-agent handoff.

- [ ] Run the full new test set and relevant existing checks once after final code changes. Build and inspect the artifact; assert no snapshots, credentials, integration server scripts, tests, raw data, or private documents are included. Validate module URLs under the repository's Pages subpath.
- [ ] Stage a release preview and a narrowly scoped rules delta. Check the current request's deployment/publication authorization before live actions; complete local validation regardless. Record the exact release commit/artifact and outstanding rollout configuration if live action cannot proceed.
- [ ] When rollout is authorized, publish one minimized snapshot per configured source, deploy the reviewed rules/UI, then verify actual phone access over cellular. Test laptop off → expiry visible, partial source failure, sign-out, wrong user, offline reopen, source deep links, and current Today/check-in behavior. If physical access is unavailable, mark phone checks pending rather than complete.
- [ ] Verify existing notification defaults remain as documented and Calendar workflow stays manual/dry-run without Google credentials. Integration rollout must not re-enable retired publishers.
- [ ] Have the next Claude/Codex session resume using only START-HERE and repository state: it must identify completed tasks, current checkout/commit, test evidence, and next action. If the second tool is unavailable now, record this acceptance test as pending; do not claim cross-tool execution merely from creating files.
- [ ] Document rollback: disable Workspace subscription/entry, revert the UI release commit when authorized, stop collector/publisher invocation, preserve existing domain data and Firestore snapshots. Avoid deleting user data as rollback.

**Acceptance:** Local/deployed/phone states are independently evidenced; every source has an honest mode and freshness; shared handoff is sufficient to resume. Do not label full integration complete if physical-phone or authenticated-transport checks remain pending.

## T8: Improve Graphify as the shared navigation layer

**Files:** Create `docs/integration/GRAPHIFY.md`; if an enhancement is needed, create reproducible postprocessor `scripts/integrations/enhance-graph.mjs` and `tests/graph-enhancement.test.mjs`. Generated graph output remains external/local.

**Consumes:** Installed Graphify CLI help/version, explicit source-root allowlist, verified graph schema, current app revisions.

**Produces:** Repeatable local regeneration recipe and optional enhanced graph view. No runtime dependency on Graphify.

- [ ] Check installed command help before writing exact regeneration/hook commands. Record tool version, input roots/exclusions, output directory and observed source revisions in GRAPHIFY.md. Never assume the prior audit's 277 files cover the entire workspace.
- [ ] Implement enhancements through generator configuration or a reproducible postprocessor, rather than hand-editing generated HTML. Fixture-test missing nodes/unknown fields, undirected relations, inferred edges and generic duplicate names.
- [ ] Add project/confidence/relation filters, collapsed community groups, low-degree toggle, correct arrows, source-qualified search, and cached hull/layout calculations where supported. Keep raw graph immutable and expose suppressed edges through an explicit filter for auditability.
- [ ] Verify a fresh regeneration preserves enhancements and compare browser responsiveness/initial payload with the recorded baseline. Do not turn a single 2.3-second local measurement into a general performance guarantee.
- [ ] Treat hooks as optional follow-up: inspect each child repo's existing hooks and selected graph root before installation; preserve existing hooks and avoid broad personal-data indexing. Root AGENTS/CLAUDE pointers already provide the shared reading path.

**Acceptance:** Claude and Codex have a repeatable, scoped graph navigation workflow with no misleading assertion that inferred links are actual integration code.

## Final review before completion

- [ ] Every SPEC inventory row maps to T2/T5 and a visible source mode.
- [ ] Both agent entry points resolve to the same SPEC/STATUS/plan.
- [ ] Data contract names and adapter/transport signatures match across tasks.
- [ ] Runtime output is outside repo and Pages artifact; private Firestore rules are verified.
- [ ] No unverified production or phone check is marked passed.
- [ ] No task completion depends on forgotten chat context; the handoff includes actual next action and evidence.
