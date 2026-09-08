/* T4 collector tests — node --test tests/integration-collect.test.mjs

   The collector is the only component that turns adapter output into a file.
   Its job is to be boring and bounded: hash, validate, write atomically, and
   never let one dead source take out another. Filesystem and clock injected. */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateConfig, validateOutDir } from '../scripts/integrations/config.mjs';
import { canonicalise, revisionOf, collectAll, planWrites } from '../scripts/integrations/collect.mjs';

const NOW = Date.parse('2026-09-07T12:00:00Z');
const now = () => NOW;

const snapshot = (over = {}) => ({
  schemaVersion: 1,
  sourceId: 'encore',
  observedAt: '2026-09-07T12:00:00Z',
  sourceUpdatedAt: null,
  expiresAt: '2026-09-07T12:15:00Z',
  status: 'ready',
  reasonCode: null,
  metrics: [{ key: 'itemCount', label: 'Catalogue items', value: 42, unit: 'count' }],
  links: [],
  ...over,
});

/* ============================= config ============================= */

test('a well-formed config is accepted', () => {
  const r = validateConfig({ sources: { encore: { baseUrl: 'http://localhost:5178' } } });
  assert.equal(r.ok, true);
  assert.equal(r.value.sources.encore.baseUrl, 'http://localhost:5178');
});

test('unknown source IDs are rejected', () => {
  const r = validateConfig({ sources: { 'not-a-source': { baseUrl: 'http://localhost:1' } } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /not a registered source/);
});

test('credential-bearing and non-http base URLs are rejected', () => {
  for (const baseUrl of ['http://user:pass@localhost:5178', 'file:///etc/passwd',
                         'javascript:alert(1)', 'http://localhost:5178/../etc']) {
    const r = validateConfig({ sources: { encore: { baseUrl } } });
    assert.equal(r.ok, false, baseUrl + ' should be rejected');
  }
});

test('config with no sources is rejected rather than silently doing nothing', () => {
  assert.equal(validateConfig({ sources: {} }).ok, false);
  assert.equal(validateConfig({}).ok, false);
  assert.equal(validateConfig(null).ok, false);
});

test('output directory may not sit inside the repository or a source root', () => {
  const repoRoot = path.resolve('/repo');
  const sourceRoots = [path.resolve('/work/encore')];

  assert.equal(validateOutDir(path.resolve('/repo/snapshots'), { repoRoot, sourceRoots }).ok, false);
  assert.equal(validateOutDir(repoRoot, { repoRoot, sourceRoots }).ok, false);
  assert.equal(validateOutDir(path.resolve('/work/encore/out'), { repoRoot, sourceRoots }).ok, false);
  assert.equal(validateOutDir(path.resolve('/private/snapshots'), { repoRoot, sourceRoots }).ok, true);
});

test('directory traversal in the output path is rejected', () => {
  const repoRoot = path.resolve('/repo');
  assert.equal(validateOutDir(path.resolve('/repo/../repo/x'), { repoRoot, sourceRoots: [] }).ok, false);
});

/* ============================ revision ============================ */

test('revision is stable regardless of key order', () => {
  const a = { schemaVersion: 1, sourceId: 'encore', status: 'ready' };
  const b = { status: 'ready', sourceId: 'encore', schemaVersion: 1 };
  assert.equal(revisionOf(a), revisionOf(b));
  assert.match(revisionOf(a), /^sha256-[0-9a-f]{64}$/);
});

test('revision ignores any incoming revision field', () => {
  const base = snapshot();
  assert.equal(revisionOf({ ...base, revision: 'sha256-forged' }), revisionOf(base));
});

test('revision changes when a value changes', () => {
  assert.notEqual(revisionOf(snapshot()), revisionOf(snapshot({ status: 'degraded' })));
});

test('canonicalise sorts keys but preserves array order', () => {
  const out = canonicalise({ b: 1, a: { d: 2, c: [3, 1, 2] } });
  assert.deepEqual(Object.keys(out), ['a', 'b']);
  assert.deepEqual(Object.keys(out.a), ['c', 'd']);
  assert.deepEqual(out.a.c, [3, 1, 2], 'array order is meaningful and must survive');
});

/* ============================ collectAll ========================== */

const okAdapter = id => async () => snapshot({ sourceId: id });

test('each collected snapshot is validated and gets a revision', async () => {
  const results = await collectAll({
    config: { sources: { encore: { baseUrl: 'http://localhost:5178' } } },
    adapters: { encore: okAdapter('encore') },
    fetch: async () => { throw new Error('unused'); },
    now,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.match(results[0].snapshot.revision, /^sha256-[0-9a-f]{64}$/);
});

test('one failing source does not take out another', async () => {
  const results = await collectAll({
    config: {
      sources: {
        encore: { baseUrl: 'http://localhost:5178' },
        'ai-trading-lab': { baseUrl: 'http://localhost:8000' },
      },
    },
    adapters: {
      encore: okAdapter('encore'),
      'ai-trading-lab': async () => { throw new Error('adapter exploded'); },
    },
    fetch: async () => { throw new Error('unused'); },
    now,
  });
  const byId = Object.fromEntries(results.map(r => [r.sourceId, r]));
  assert.equal(byId.encore.ok, true);
  assert.equal(byId['ai-trading-lab'].ok, false);
  assert.equal(byId['ai-trading-lab'].reasonCode, 'unreachable');
  assert.equal(JSON.stringify(results).includes('adapter exploded'), false, 'raw error text must not survive');
});

test('an adapter returning a contract-invalid snapshot is refused, not written', async () => {
  const results = await collectAll({
    config: { sources: { encore: { baseUrl: 'http://localhost:5178' } } },
    adapters: { encore: async () => snapshot({ metrics: [{ key: 'portfolioValue', label: 'x', value: 1, unit: null }] }) },
    fetch: async () => { throw new Error('unused'); },
    now,
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reasonCode, 'invalid-data');
  assert.equal(results[0].snapshot, undefined);
});

test('at most two sources are in flight at once', async () => {
  let inFlight = 0, peak = 0;
  const slow = id => async () => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, 5));
    inFlight -= 1;
    return snapshot({ sourceId: id });
  };
  await collectAll({
    config: {
      sources: {
        encore: { baseUrl: 'http://localhost:1' },
        'ai-trading-lab': { baseUrl: 'http://localhost:2' },
        sleepforge: { baseUrl: 'http://localhost:3' },
        graphify: { baseUrl: 'http://localhost:4' },
      },
    },
    adapters: {
      encore: slow('encore'), 'ai-trading-lab': slow('ai-trading-lab'),
      sleepforge: slow('sleepforge'), graphify: slow('graphify'),
    },
    fetch: async () => { throw new Error('unused'); },
    now,
  });
  assert.ok(peak <= 2, 'peak concurrency was ' + peak);
});

/* ============================ writing ============================= */

test('preview mode plans no writes at all', () => {
  const writes = planWrites([{ ok: true, sourceId: 'encore', snapshot: snapshot({ revision: 'sha256-x' }) }], null);
  assert.deepEqual(writes, []);
});

test('writes are one file per source, temp then rename on the same volume', () => {
  const outDir = path.resolve('/private/snapshots');
  const writes = planWrites([{ ok: true, sourceId: 'encore', snapshot: snapshot({ revision: 'sha256-x' }) }], outDir);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].finalPath, path.join(outDir, 'encore.json'));
  assert.equal(path.dirname(writes[0].tempPath), outDir, 'temp must share the volume with the target');
  assert.notEqual(writes[0].tempPath, writes[0].finalPath);
  assert.equal(JSON.parse(writes[0].body).sourceId, 'encore');
});

test('failed sources are still written as explicit failed observations', () => {
  const writes = planWrites(
    [{ ok: false, sourceId: 'ai-trading-lab', reasonCode: 'unreachable', snapshot: snapshot({ sourceId: 'ai-trading-lab', status: 'unavailable', reasonCode: 'unreachable', metrics: [], revision: 'sha256-y' }) }],
    path.resolve('/private/snapshots'),
  );
  assert.equal(writes.length, 1, 'a down source must not leave a stale file looking current');
  assert.equal(JSON.parse(writes[0].body).status, 'unavailable');
});

test('a failed source with no snapshot writes nothing rather than a broken file', () => {
  const writes = planWrites([{ ok: false, sourceId: 'encore', reasonCode: 'invalid-data' }], path.resolve('/private/snapshots'));
  assert.deepEqual(writes, []);
});
