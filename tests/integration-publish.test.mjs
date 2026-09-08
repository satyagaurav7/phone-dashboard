/* T6 publisher + transport tests — node --test tests/integration-publish.test.mjs

   The store is injected, so every rule here is proven without Firebase, without
   credentials, and without the network. What is NOT covered by this file: the
   Firestore security rules themselves. Those need the emulator, which needs
   Java, which is not installed on this machine — see docs/integration/OPERATIONS.md.
   Nothing here should be read as evidence that the deployed rules are correct. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { publishSnapshots, snapshotPath } from '../scripts/integrations/publish.mjs';
import { subscribeSnapshots } from '../integrations/firestore-transport.mjs';

const NOW = Date.parse('2026-09-07T12:00:00Z');
const UID = 'owner123';

const snap = (over = {}) => ({
  schemaVersion: 1,
  sourceId: 'encore',
  observedAt: '2026-09-07T11:55:00Z',
  sourceUpdatedAt: null,
  expiresAt: '2026-09-07T12:10:00Z',
  status: 'ready',
  reasonCode: null,
  metrics: [{ key: 'itemCount', label: 'Catalogue items', value: 42, unit: 'count' }],
  links: [],
  revision: 'sha256-aaa',
  ...over,
});

/**
 * Fake transactional store. Records every write, and can simulate a concurrent
 * writer landing between get and set so the retry path is actually exercised
 * rather than assumed.
 */
function fakeStore(seed = {}, { conflictOnce = null } = {}) {
  const docs = { ...seed };
  const writes = [];
  let attempts = 0;
  return {
    docs, writes, get attempts() { return attempts; },
    async runTransaction(fn) {
      for (let i = 0; i < 5; i += 1) {
        attempts += 1;
        const staged = [];
        const tx = {
          async get(path) { return docs[path] ?? null; },
          set(path, value) { staged.push([path, value]); },
        };
        const snapshotBefore = JSON.stringify(docs);
        await fn(tx);
        // Simulate another writer committing first, on the first attempt only.
        if (conflictOnce && attempts === 1) {
          Object.assign(docs, conflictOnce);
          continue; // conflict → retry, exactly as Firestore would
        }
        if (JSON.stringify(docs) !== snapshotBefore) continue; // someone else moved
        for (const [path, value] of staged) { docs[path] = value; writes.push({ path, value }); }
        return;
      }
      throw new Error('transaction retries exhausted');
    },
  };
}

/* ============================== paths ============================== */

test('snapshots are written only under the owner integrations namespace', () => {
  assert.equal(snapshotPath(UID, 'encore'), 'users/owner123/integrations/encore');
});

test('a uid or source that could escape the namespace is refused', () => {
  for (const bad of ['', '../admin', 'a/b', null, undefined, 'x'.repeat(200)]) {
    assert.throws(() => snapshotPath(bad, 'encore'), /uid/i, 'uid ' + String(bad));
  }
  assert.throws(() => snapshotPath(UID, 'not-a-source'), /registered/i);
  assert.throws(() => snapshotPath(UID, '../../dashboard/satya'), /registered/i);
});

/* ============================= dry run ============================= */

test('DRY RUN is the default and performs zero writes', async () => {
  const store = fakeStore();
  const summary = await publishSnapshots({ snapshots: [snap()], uid: UID, store, now: () => NOW });
  assert.equal(summary.dryRun, true, 'dryRun must default to true');
  assert.equal(store.writes.length, 0);
  assert.equal(summary.results[0].action, 'would-write');
});

test('--apply is what actually writes', async () => {
  const store = fakeStore();
  const summary = await publishSnapshots({ snapshots: [snap()], uid: UID, store, dryRun: false, now: () => NOW });
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].path, 'users/owner123/integrations/encore');
  assert.equal(summary.written, 1);
});

/* =========================== validation =========================== */

test('an unregistered source ID never reaches the store', async () => {
  const store = fakeStore();
  const summary = await publishSnapshots({
    snapshots: [snap({ sourceId: 'exfiltrate' })], uid: UID, store, dryRun: false, now: () => NOW,
  });
  assert.equal(store.writes.length, 0);
  assert.equal(summary.results[0].action, 'rejected');
  assert.equal(summary.rejected, 1);
});

test('a contract-invalid snapshot is rejected before any write', async () => {
  const store = fakeStore();
  const summary = await publishSnapshots({
    // portfolioValue is not an allowed metric key for encore
    snapshots: [snap({ metrics: [{ key: 'portfolioValue', label: 'x', value: 1, unit: null }] })],
    uid: UID, store, dryRun: false, now: () => NOW,
  });
  assert.equal(store.writes.length, 0);
  assert.equal(summary.results[0].action, 'rejected');
});

test('only contract fields are written — extra keys never survive', async () => {
  const store = fakeStore();
  await publishSnapshots({
    snapshots: [{ ...snap(), stowaway: 'secret', __proto__: { polluted: true } }],
    uid: UID, store, dryRun: false, now: () => NOW,
  });
  // The extra key makes it contract-invalid, so nothing is written at all.
  assert.equal(store.writes.length, 0);
});

/* ========================== monotonicity ========================== */

test('an older observation cannot overwrite a newer one', async () => {
  const path = snapshotPath(UID, 'encore');
  const store = fakeStore({ [path]: snap({ observedAt: '2026-09-07T11:59:00Z', revision: 'sha256-new' }) });
  const summary = await publishSnapshots({
    snapshots: [snap({ observedAt: '2026-09-07T11:00:00Z', revision: 'sha256-old' })],
    uid: UID, store, dryRun: false, now: () => NOW,
  });
  assert.equal(store.writes.length, 0);
  assert.equal(summary.results[0].action, 'refused-older');
  assert.equal(store.docs[path].revision, 'sha256-new', 'the newer document survives');
});

test('an identical revision skips the write entirely', async () => {
  const path = snapshotPath(UID, 'encore');
  const store = fakeStore({ [path]: snap() });
  const summary = await publishSnapshots({
    snapshots: [snap({ observedAt: '2026-09-07T11:58:00Z' })], // newer, same revision
    uid: UID, store, dryRun: false, now: () => NOW,
  });
  assert.equal(store.writes.length, 0, 'an unchanged snapshot must not burn a write');
  assert.equal(summary.results[0].action, 'skipped-unchanged');
});

test('RACE: an out-of-order concurrent write converges on the newest observation', async () => {
  const path = snapshotPath(UID, 'encore');
  // We try to publish 11:55. Mid-transaction, another publisher commits 12:05.
  const store = fakeStore({}, {
    conflictOnce: { [path]: snap({ observedAt: '2026-09-07T12:05:00Z', revision: 'sha256-newer' }) },
  });
  const summary = await publishSnapshots({
    snapshots: [snap({ observedAt: '2026-09-07T11:55:00Z', revision: 'sha256-mine' })],
    uid: UID, store, dryRun: false, now: () => NOW,
  });

  assert.ok(store.attempts > 1, 'the transaction must retry, not read-then-write blindly');
  assert.equal(store.docs[path].revision, 'sha256-newer', 'the newest observation wins');
  assert.equal(summary.results[0].action, 'refused-older');
});

/* ======================= partial failure ========================== */

test('one rejected source does not stop the others publishing', async () => {
  const store = fakeStore();
  const summary = await publishSnapshots({
    snapshots: [
      snap({ sourceId: 'bogus' }),
      snap({ sourceId: 'ai-trading-lab', metrics: [{ key: 'reachable', label: 'Reachable', value: true, unit: null }] }),
    ],
    uid: UID, store, dryRun: false, now: () => NOW,
  });
  assert.equal(summary.written, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(store.writes[0].path, 'users/owner123/integrations/ai-trading-lab');
});

/* ============================ transport =========================== */

const listenWith = docs => (path, onDocs) => { onDocs(docs); return () => {}; };

test('the transport revalidates stored documents before they reach the view', () => {
  let received = null;
  subscribeSnapshots({
    uid: UID, nowMs: NOW, onSnapshots: s => { received = s; }, onError: () => {},
    listen: listenWith([
      snap(),
      // A tampered stored document: extra key, hostile link, unknown source.
      { ...snap({ sourceId: 'ai-trading-lab' }), evil: '<script>x</script>' },
      snap({ sourceId: 'not-registered' }),
    ]),
  });
  assert.equal(received.length, 1, 'only the valid document survives revalidation');
  assert.equal(received[0].sourceId, 'encore');
});

test('a stored document cannot smuggle in extra fields or links', () => {
  let received = null;
  subscribeSnapshots({
    uid: UID, nowMs: NOW, onSnapshots: s => { received = s; }, onError: () => {},
    listen: listenWith([{ ...snap(), links: [{ label: 'x', href: 'javascript:alert(1)' }] }]),
  });
  assert.deepEqual(received, [], 'a hostile link invalidates the whole document');
});

test('the transport reads only the owner namespace', () => {
  let path = null;
  subscribeSnapshots({
    uid: UID, nowMs: NOW, onSnapshots: () => {}, onError: () => {},
    listen: (p, onDocs) => { path = p; onDocs([]); return () => {}; },
  });
  assert.equal(path, 'users/owner123/integrations');
});

test('a transport error is reported without the raw error object', () => {
  let errArg = 'untouched';
  subscribeSnapshots({
    uid: UID, nowMs: NOW, onSnapshots: () => {}, onError: e => { errArg = e; },
    listen: (p, onDocs, onErr) => { onErr(new Error('permission-denied at users/owner123')); return () => {}; },
  });
  assert.equal(errArg, undefined, 'the view is told that it failed, never why');
});

test('unsubscribe is passed through and is idempotent', () => {
  let stops = 0;
  const stop = subscribeSnapshots({
    uid: UID, nowMs: NOW, onSnapshots: () => {}, onError: () => {},
    listen: (p, onDocs) => { onDocs([]); return () => { stops += 1; }; },
  });
  stop(); stop();
  assert.equal(stops, 1);
});
