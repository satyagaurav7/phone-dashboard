# Integration operations

How to collect, preview, and (eventually) publish workspace snapshots.

Everything below runs **manually on the laptop**. No scheduler is installed by
this work, and nothing here runs in CI or in the browser.

## Current state — read this first

| Stage | State |
|---|---|
| Collect app status into JSON | **Working** |
| Preview what would be published | **Working** |
| Publish to Firestore | **Blocked** — no credentials |
| Phone reads published snapshots | **Wired**, degrades to empty until rules land |

The Workspace tab is live and shows every source as "No data yet". That is
correct: the pipe from laptop to phone does not exist yet.

## What is genuinely blocked, and on whom

Three things need the account holder. None can be worked around by an agent,
and none should be.

**1. The Firestore rules delta has not been published.**
The live rules WERE read on 2026-09-08 and are recorded verbatim in
`firestore.production-baseline.rules`, which is also the rollback. They are:

```
match /dashboard/satya {
  allow read, write: if request.auth != null;
}
```

The merged file to publish is in that same document. Until it is published every
integration read is denied, and the Workspace degrades to "No data yet" plus a
one-line notice rather than an error banner — so the ordering does not matter.

Recorded but deliberately NOT changed: `request.auth != null` lets any
authenticated user of the project read and write the whole dashboard, not only
its owner. Tightening it to compare against a uid is a separate decision with
its own blast radius.

**2. No Admin credentials exist here, and an agent must not handle them.**
`publish.mjs --apply` exits with an error rather than pretending. Admin
credentials must live outside this repository and never be committed.

**3. The Firestore emulator cannot run on this machine.**
It is a Java process and no JRE is installed (checked: PATH, Program Files,
PowerShell). So `tests/integration-rules.test.mjs` does not exist — writing an
authorization test that has never executed would be worse than admitting the
gap. **The rules in this repo are unverified.**

## Namespace

```
users/{uid}/integrations/{sourceId}
```

One document per registered source. `sourceId` must appear in
`integrations/registry.mjs`; `publish.mjs` throws otherwise.

> **Note on the existing structure.** The app currently stores all of its state
> in a single document at `dashboard/satya` — a hardcoded id, not keyed to the
> auth uid. The integration namespace deliberately does not follow that shape,
> because a uid-keyed path lets a rule say `request.auth.uid == uid` instead of
> special-casing one document name. This does mean the project now has two
> shapes. That is a real cost, recorded here rather than hidden.

## Commands

Config lives **outside the repository**. It is operator input and must never be
editable from a cloud snapshot.

```json
{
  "sources": {
    "encore":         { "baseUrl": "http://localhost:5178" },
    "ai-trading-lab": { "baseUrl": "http://localhost:8000" }
  }
}
```

Base URLs must be bare origins. Credentials in a URL, non-http schemes, and
unregistered source ids are all rejected.

### Collect

```bash
# Preview — writes nothing.
node scripts/integrations/collect.mjs --config ~/private/flowstate-config.json

# Write snapshots to a directory OUTSIDE the repo and outside every source root.
node scripts/integrations/collect.mjs --config ~/private/flowstate-config.json --out ~/private/flowstate-snapshots
```

`--out` inside the repository is refused: snapshots there would be published to
GitHub Pages.

Tested output, against a live local Encore:

```
encore           ready (2 metrics)
ai-trading-lab   unavailable (0 metrics)
```

### Publish

```bash
# Dry run — the default. Shows what would be written.
node scripts/integrations/publish.mjs --input ~/private/flowstate-snapshots --uid <uid>

# Apply. Currently exits with an error: the Admin adapter is not configured.
node scripts/integrations/publish.mjs --input ~/private/flowstate-snapshots --uid <uid> --apply
```

Publishing rules, all covered by `tests/integration-publish.test.mjs`:

- an unregistered source never reaches the store
- a contract-invalid snapshot is rejected before any write
- an older or equal `observedAt` cannot overwrite a newer document
- an identical `revision` skips the write
- concurrent publishers converge on the newest observation through a
  transaction, not a read-then-write
- one rejected source does not stop the others

## The production rules delta

Do **not** deploy `firestore.integration.rules`. Instead:

1. Read the current live rules (Firebase console → Firestore → Rules) and save
   a copy before changing anything.
2. Add **only** this block to them, leaving every existing rule untouched:

```
match /users/{uid}/integrations/{sourceId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
```

3. Deploy, then confirm the existing dashboard still loads and saves.

`allow write: if false` does not protect the data from the publisher — **Admin
bypasses rules entirely**. It guarantees only that a browser session, including
a compromised one, cannot forge a snapshot. The write constraints that matter
are in `publish.mjs`.

### Verifying the rules once a JRE is available

```bash
npm i -D firebase-tools @firebase/rules-unit-testing --prefix tests
firebase emulators:exec --only firestore --config firebase.integration.json \
  "node --test tests/integration-rules.test.mjs"
```

That test file still needs writing. It must assert: unauthenticated read denied,
wrong-uid read denied, owner read allowed, **all** browser writes denied, and
the existing dashboard paths unchanged. Never point these at the production
project.

## The phone transport

`integrations/firestore-transport.mjs` is wired into `syncWorkspace()` and
published with the shell. It subscribes to `users/{uid}/integrations` for the
signed-in user only.

Every stored document is revalidated through the contract before the view sees
it, and a document that fails is dropped whole rather than partially rendered.
Admin bypasses rules on write, so "it is in the database" proves nothing about
its shape.

**A denied read degrades, it does not shout.** Until the rules delta is
published every read fails, and the Workspace shows the same nine cards reading
"No data yet" plus one quiet line explaining why they will not change. That is
accurate — nothing has been published — and it means the rules and the code can
land in either order. The raw Firestore error is never rendered: it names the
uid and the denied path.

If the user is signed out mid-navigation the transport is skipped entirely
rather than subscribing with a guessed uid.

## Freshness and recovery

- Each source has a TTL in `integrations/registry.mjs` (Encore 15 min, trading
  5 min, others 24 h, reference entries 7 days).
- The view derives `stale` from the clock, so a card goes out of date on its own
  when the laptop is off. `stale` is never a stored status.
- A failed source is published as an explicit failed observation, so a dead
  source cannot leave a stale document looking current.
- One source failing never removes or overwrites another.

## Rollback

- **Stop publishing:** stop running `publish.mjs`. Cards go stale, then stay
  stale. Nothing breaks.
- **Remove the data:** delete the `users/{uid}/integrations` collection.
- **Remove the UI:** revert the Workspace entry in `index.html`. Everything else
  in the app is untouched by this work.
- **Revert the rules:** re-apply the copy saved in step 1 above.
