/* T4 adapter tests — node --test tests/integration-adapters.test.mjs

   These are minimisation tests as much as mapping tests. The point is not that
   the adapters produce a number; it is that everything else the source offers
   stays on the laptop. Fixtures mirror the real handler shapes:

     encore/src/serve.mjs        GET /api/status  -> the `job` object
                                 GET /api/products -> {readme,count,topPicks,products[]}
     ai-trading-lab .../app.py   GET /api/health   -> {ok,trading_mode,watchlist,
                                   disk_cache_files,memory_cache_keys,recent_errors,guardrails}

   No wall clock, no network, no filesystem. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSource as collectEncore, ENCORE_ENDPOINTS } from '../scripts/integrations/adapters/encore.mjs';
import { collectSource as collectTrading, TRADING_ENDPOINTS } from '../scripts/integrations/adapters/trading.mjs';
import { validateSnapshot } from '../integrations/contract.mjs';

const NOW = Date.parse('2026-09-07T12:00:00Z');
const now = () => NOW;

/** Records every URL requested so tests can assert what was NOT called. */
function mockFetch(routes) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET' });
    const route = routes[new URL(String(url)).pathname];
    if (!route) return { ok: false, status: 404, headers: new Map(), text: async () => 'not found' };
    if (typeof route === 'function') return route();
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return {
      ok: route.status === undefined || route.status === 200,
      status: route.status ?? 200,
      headers: new Map([['content-length', String(body.length)]]),
      text: async () => body,
    };
  };
  return { fetch, calls };
}

const encoreJob = {
  running: false, step: 'done', pct: 100, done: 38076, total: 38076,
  startedAt: Date.parse('2026-09-07T11:00:00Z'),
  finishedAt: Date.parse('2026-09-07T11:40:00Z'),
};

// Shape-accurate, value-synthetic. Real economics fields present so the test
// proves they are dropped rather than that they were never offered.
const encoreProducts = {
  readme: 'Plain product feed',
  count: 38076,
  topPicks: [{ lot: 'X1', title: 'ITEM', profitMax: 999 }],
  products: [{
    lot: 'X1', title: 'ITEM', model: 'M', quantity: 1, house: 'H', city: 'C',
    category: 'CAT', condition: 'new', isNew: true, retail: 500, resale: 300,
    listAt: 250, takeAt: 200, profitMin: 40, profitMax: 120, currentBid: 55,
    bids: 3, maxBid: 180, landedIfWonNow: 70, premiumPct: 18,
    returnMultiple: 2.1, sellScore: 77, hoursLeft: 12, duplicateCount: 1,
    url: 'https://example.invalid/lot/X1',
  }],
};

const tradingHealth = {
  ok: true,
  trading_mode: 'paper',
  watchlist: ['NVDA', 'VFV.TO', 'TTWO'],
  disk_cache_files: 12,
  memory_cache_keys: ['quotes:NVDA:1d', 'bars:VFV.TO:5m'],
  recent_errors: ['Traceback: KeyError at providers/polygon.py:88 apiKey=sk_live_x'],
  guardrails: {
    orders_possible_from_dashboard: false,
    prediction_claims: false,
    risk_rules: 'config/risk.yaml enforced by src/risk on every execution path',
  },
};

/* ============================== Encore ============================== */

test('encore maps counts and job state, and nothing else', async () => {
  const { fetch } = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { body: encoreProducts } });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });

  assert.equal(snap.sourceId, 'encore');
  assert.equal(snap.status, 'ready');
  const keys = Object.fromEntries(snap.metrics.map(m => [m.key, m.value]));
  assert.equal(keys.itemCount, 38076);
  assert.equal(keys.jobState, 'done');
});

test('encore never forwards pricing, profit, bids, or the products array', async () => {
  const { fetch } = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { body: encoreProducts } });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  const serialised = JSON.stringify(snap);

  for (const banned of ['profitMin', 'profitMax', 'retail', 'resale', 'currentBid', 'maxBid',
                        'sellScore', 'landedIfWonNow', 'returnMultiple', 'topPicks', 'products',
                        'listAt', 'takeAt', 'premiumPct', 'readme']) {
    assert.equal(serialised.includes(banned), false, banned + ' leaked into the snapshot');
  }
  assert.equal(serialised.includes('999'), false, 'a profit figure leaked');
});

test('encore never forwards the raw job error string', async () => {
  const failing = { ...encoreJob, step: 'failed', error: 'ENOENT: no such file /Users/Satya/secret/path.json' };
  const { fetch } = mockFetch({ '/api/status': { body: failing }, '/api/products': { body: encoreProducts } });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });

  assert.equal(JSON.stringify(snap).includes('ENOENT'), false);
  assert.equal(JSON.stringify(snap).includes('/Users/Satya'), false);
  assert.equal(snap.status, 'degraded');
  assert.equal(snap.reasonCode, 'invalid-data');
});

test('encore requests only the two read endpoints, never refresh or scrape', async () => {
  const { fetch, calls } = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { body: encoreProducts } });
  await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });

  const paths = calls.map(c => new URL(c.url).pathname).sort();
  assert.deepEqual(paths, ['/api/products', '/api/status']);
  assert.deepEqual([...ENCORE_ENDPOINTS].sort(), ['/api/products', '/api/status']);
  assert.ok(calls.every(c => c.method === 'GET'), 'only GET is allowed');
  for (const forbidden of ['/api/refresh', '/api/prepare', '/api/queue', '/api/queue/status']) {
    assert.equal(paths.includes(forbidden), false, forbidden + ' must never be called');
  }
});

test('encore 404 on the product feed is unavailable, not a crash', async () => {
  const { fetch } = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { status: 404, body: { error: 'no products.json yet' } } });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.reasonCode, 'missing-file');
});

test('encore malformed JSON is invalid-data, not a thrown parse error', async () => {
  const { fetch } = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { body: '{"count": 4' } });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.reasonCode, 'invalid-data');
});

test('encore oversized product feed is refused before parsing', async () => {
  const { fetch } = mockFetch({
    '/api/status': { body: encoreJob },
    '/api/products': () => ({
      ok: true, status: 200,
      headers: new Map([['content-length', String(26 * 1024 * 1024)]]),
      text: async () => { throw new Error('must not read a body this large'); },
    }),
  });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.reasonCode, 'invalid-data');
});

test('encore stalled fetch becomes a timeout', async () => {
  const { fetch } = mockFetch({
    '/api/status': { body: encoreJob },
    '/api/products': () => { const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e; },
  });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.reasonCode, 'timeout');
});

test('encore expiry is observation plus the registry TTL, not source time', async () => {
  const { fetch } = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { body: encoreProducts } });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  assert.equal(Date.parse(snap.expiresAt) - Date.parse(snap.observedAt), 15 * 60_000);
  assert.equal(snap.sourceUpdatedAt, new Date(encoreJob.finishedAt).toISOString());
});

test('encore with no finished job reports sourceUpdatedAt null, never a guess', async () => {
  const { fetch } = mockFetch({
    '/api/status': { body: { running: true, step: 'scraping lots', pct: 40 } },
    '/api/products': { body: encoreProducts },
  });
  const snap = await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch, now });
  assert.equal(snap.sourceUpdatedAt, null);
});

/* ============================== Trading ============================= */

test('trading maps only reachability, mode, and guardrails', async () => {
  const { fetch } = mockFetch({ '/api/health': { body: tradingHealth } });
  const snap = await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });

  assert.equal(snap.sourceId, 'ai-trading-lab');
  assert.equal(snap.status, 'ready');
  const keys = Object.fromEntries(snap.metrics.map(m => [m.key, m.value]));
  assert.equal(keys.reachable, true);
  assert.equal(keys.tradingMode, 'paper');
  assert.equal(keys.paperTrading, true);
  assert.equal(keys.guardrailsActive, true);
});

test('trading never forwards watchlist, cache keys, or raw errors', async () => {
  const { fetch } = mockFetch({ '/api/health': { body: tradingHealth } });
  const snap = await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });
  const serialised = JSON.stringify(snap);

  for (const banned of ['NVDA', 'VFV.TO', 'TTWO', 'watchlist', 'memory_cache_keys',
                        'quotes:', 'recent_errors', 'Traceback', 'sk_live_', 'polygon',
                        'disk_cache_files', 'risk_rules']) {
    assert.equal(serialised.includes(banned), false, banned + ' leaked into the snapshot');
  }
});

test('trading requests only /api/health — never portfolio, overview, or summary', async () => {
  const { fetch, calls } = mockFetch({ '/api/health': { body: tradingHealth } });
  await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });

  const paths = calls.map(c => new URL(c.url).pathname);
  assert.deepEqual(paths, ['/api/health']);
  assert.deepEqual([...TRADING_ENDPOINTS], ['/api/health']);
  for (const forbidden of ['/api/summary', '/api/portfolio', '/api/overview', '/api/watchlist',
                           '/api/journal', '/api/signals', '/api/odds', '/api/news']) {
    assert.equal(paths.includes(forbidden), false, forbidden + ' must never be called by default');
  }
});

test('trading reports guardrails down when orders become possible', async () => {
  const unsafe = { ...tradingHealth, guardrails: { ...tradingHealth.guardrails, orders_possible_from_dashboard: true } };
  const { fetch } = mockFetch({ '/api/health': { body: unsafe } });
  const snap = await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });

  const keys = Object.fromEntries(snap.metrics.map(m => [m.key, m.value]));
  assert.equal(keys.guardrailsActive, false);
  assert.equal(snap.status, 'degraded', 'orders reachable from the dashboard is not a healthy state');
});

test('trading live mode is reported as such, not silently normalised to paper', async () => {
  const { fetch } = mockFetch({ '/api/health': { body: { ...tradingHealth, trading_mode: 'live' } } });
  const snap = await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });
  const keys = Object.fromEntries(snap.metrics.map(m => [m.key, m.value]));
  assert.equal(keys.tradingMode, 'live');
  assert.equal(keys.paperTrading, false);
});

test('trading unreachable is bounded, not thrown', async () => {
  const fetch = async () => { throw new TypeError('fetch failed'); };
  const snap = await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });
  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.reasonCode, 'unreachable');
  assert.equal(snap.metrics.length, 0, 'no invented metrics when the source is down');
});

test('trading expiry uses the 5-minute registry TTL', async () => {
  const { fetch } = mockFetch({ '/api/health': { body: tradingHealth } });
  const snap = await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch, now });
  assert.equal(Date.parse(snap.expiresAt) - Date.parse(snap.observedAt), 5 * 60_000);
});

/* ===================== both satisfy the contract ==================== */

test('both adapters produce contract-valid snapshots once a revision is added', async () => {
  const e = mockFetch({ '/api/status': { body: encoreJob }, '/api/products': { body: encoreProducts } });
  const t = mockFetch({ '/api/health': { body: tradingHealth } });
  for (const snap of [
    await collectEncore({ config: { baseUrl: 'http://localhost:5178' }, fetch: e.fetch, now }),
    await collectTrading({ config: { baseUrl: 'http://localhost:8000' }, fetch: t.fetch, now }),
  ]) {
    assert.equal(snap.revision, undefined, 'the adapter must not mint a revision');
    const r = validateSnapshot({ ...snap, revision: 'sha256-test' }, NOW);
    assert.equal(r.ok, true, snap.sourceId + ': ' + JSON.stringify(r.errors));
  }
});

/* ===================== T5: file-backed and reference ==================== */

import { collectSource as collectSleepforge } from '../scripts/integrations/adapters/sleepforge.mjs';
import { collectSource as collectDownloader } from '../scripts/integrations/adapters/downloader.mjs';
import { collectSource as collectGraphify } from '../scripts/integrations/adapters/graphify.mjs';
import { collectSource as collectReference } from '../scripts/integrations/adapters/references.mjs';
import { SOURCES } from '../integrations/registry.mjs';
import { ADAPTERS } from '../scripts/integrations/collect.mjs';

/** Fake filesystem. Records every path touched so tests can assert what was NOT read. */
function fakeFs(files = {}) {
  const reads = [];
  return {
    reads,
    stat: async p => { reads.push(p); if (!(p in files)) throw new Error('ENOENT'); return { size: files[p].length, mtimeMs: Date.parse('2026-09-07T09:00:00Z') }; },
    readFile: async p => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; },
  };
}

// Shape-accurate ledger: the real file carries slug, recipe_slug, seed and
// video_id, so the fixture does too — the test proves they are dropped.
const LEDGER = JSON.stringify({
  version: 1,
  episodes: [
    { number: 1, slug: 'deep-brown-noise-000', recipe_slug: 'deep-brown-noise', seed: 8675309, created: '2026-09-06', video_id: 'XpNSoPNVa60', status: 'rendered' },
    { number: 2, slug: 'deep-brown-noise-001', recipe_slug: 'deep-brown-noise', seed: 1234567, created: '2026-09-07', video_id: 'ZzQqWwEeRr1', status: 'uploaded' },
  ],
});

test('sleepforge maps counts and the last recorded stage only', async () => {
  const fs = fakeFs({ '/p/ledger.json': LEDGER });
  const snap = await collectSleepforge({ config: { ledgerPath: '/p/ledger.json' }, ...fs, now });
  const m = Object.fromEntries(snap.metrics.map(x => [x.key, x.value]));
  assert.equal(snap.status, 'ready');
  assert.equal(m.episodeCount, 2);
  assert.equal(m.latestStage, 'uploaded', 'newest by episode number, not array order');
  assert.equal(m.ledgerAvailable, true);
});

test('sleepforge never forwards slugs, seeds, or video IDs', async () => {
  const fs = fakeFs({ '/p/ledger.json': LEDGER });
  const snap = await collectSleepforge({ config: { ledgerPath: '/p/ledger.json' }, ...fs, now });
  const s = JSON.stringify(snap);
  for (const banned of ['deep-brown-noise', 'XpNSoPNVa60', 'ZzQqWwEeRr1', '8675309', '1234567', 'slug', 'seed', 'video_id', 'recipe']) {
    assert.equal(s.includes(banned), false, banned + ' leaked');
  }
});

test('sleepforge does not claim an upload is published', async () => {
  const fs = fakeFs({ '/p/ledger.json': LEDGER });
  const snap = await collectSleepforge({ config: { ledgerPath: '/p/ledger.json' }, ...fs, now });
  const stage = snap.metrics.find(m => m.key === 'latestStage');
  assert.match(stage.label, /recorded/i, 'the label must not imply the video is live');
  assert.equal(/publish|live|public/i.test(JSON.stringify(snap)), false);
});

test('sleepforge handles missing, malformed, and unconfigured ledgers', async () => {
  const none = await collectSleepforge({ config: {}, ...fakeFs(), now });
  assert.equal(none.status, 'not-configured');

  const missing = await collectSleepforge({ config: { ledgerPath: '/nope.json' }, ...fakeFs(), now });
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.reasonCode, 'missing-file');

  const bad = await collectSleepforge({ config: { ledgerPath: '/p/x.json' }, ...fakeFs({ '/p/x.json': '{"episodes":' }), now });
  assert.equal(bad.reasonCode, 'invalid-data');
});

test('downloader is opt-in: no path and no manifest are both not-configured', async () => {
  const unset = await collectDownloader({ config: {}, ...fakeFs(), now });
  assert.equal(unset.status, 'not-configured');

  // Configured but the downloader has never run: still not an error to fix.
  const absent = await collectDownloader({ config: { manifestPath: '/p/manifest.json' }, ...fakeFs(), now });
  assert.equal(absent.status, 'not-configured');
  assert.equal(absent.reasonCode, 'not-configured');
});

test('downloader publishes counts, never filenames, URLs, or creators', async () => {
  const manifest = JSON.stringify({
    'https://fanbox.cc/@creator/posts/1': { file: 'C:/Users/Satya/pics/secret-01.png', status: 'done' },
    'https://fanbox.cc/@creator/posts/2': { file: 'C:/Users/Satya/pics/secret-02.png', status: 'pending' },
  });
  const snap = await collectDownloader({ config: { manifestPath: '/p/m.json' }, ...fakeFs({ '/p/m.json': manifest }), now });
  const m = Object.fromEntries(snap.metrics.map(x => [x.key, x.value]));
  assert.equal(m.downloadedCount, 1);
  assert.equal(m.pendingCount, 1);
  // 'fanbox' is excluded deliberately: it is the registered source id, not
  // content. Everything below comes from inside the manifest.
  const s = JSON.stringify(snap);
  for (const banned of ['creator', 'secret-01', 'secret-02', 'C:/', 'png', 'https://']) {
    assert.equal(s.includes(banned), false, banned + ' leaked');
  }
});

test('graphify reports graph size and never reads the path-keyed manifest', async () => {
  const graph = JSON.stringify({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] });
  const fs = fakeFs({ '/p/graph.json': graph, '/p/manifest.json': '{"C:/Users/Satya/secret.mjs":{}}' });
  const snap = await collectGraphify({ config: { graphPath: '/p/graph.json' }, ...fs, now });

  const m = Object.fromEntries(snap.metrics.map(x => [x.key, x.value]));
  assert.equal(m.nodeCount, 2);
  assert.equal(m.edgeCount, 1);
  assert.equal(fs.reads.includes('/p/manifest.json'), false,
    'manifest.json is keyed by absolute local paths and must never be opened');
  assert.equal(JSON.stringify(snap).includes('C:/Users'), false);
});

test('graphify never publishes node labels or inferred edges', async () => {
  const graph = JSON.stringify({
    nodes: [{ id: 'x', label: 'PasswordAuthGate', source_file: 'C:/Users/Satya/index.html' }],
    links: [{ source: 'x', target: 'x', relation: 'calls' }],
  });
  const snap = await collectGraphify({ config: { graphPath: '/p/g.json' }, ...fakeFs({ '/p/g.json': graph }), now });
  const s = JSON.stringify(snap);
  for (const banned of ['PasswordAuthGate', 'C:/Users', 'index.html', 'calls', 'relation']) {
    assert.equal(s.includes(banned), false, banned + ' leaked');
  }
});

test('graphify over the size cap is bounded, not streamed', async () => {
  const huge = { stat: async () => ({ size: 11 * 1024 * 1024, mtimeMs: 0 }),
                 readFile: async () => { throw new Error('must not read an 11 MiB graph'); } };
  const snap = await collectGraphify({ config: { graphPath: '/p/big.json' }, ...huge, now });
  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.reasonCode, 'invalid-data');
});


test('reference adapters touch no filesystem at all', async () => {
  for (const id of ['anchor-context', 'ai-memory-portability', 'personal-hub', 'pr-documents']) {
    const fs = fakeFs();
    const snap = await collectReference({ sourceId: id, ...fs, now });
    assert.equal(snap.status, 'reference-only', id);
    assert.deepEqual(snap.metrics, [], id + ' must publish no counts');
    assert.deepEqual(snap.links, []);
    assert.equal(snap.sourceUpdatedAt, null);
    // A file count is still a disclosure: it says how much is in there.
    assert.equal(fs.reads.length, 0, id + ' opened something');
  }
});

test('AI Memory Portability stays reference-only until a real service is verified', async () => {
  const snap = await collectReference({ sourceId: 'ai-memory-portability', ...fakeFs(), now });
  assert.equal(snap.status, 'reference-only', 'a design document is not a connected integration');
});

test('EVERY registered source has an adapter and produces a contract-valid snapshot', async () => {
  for (const source of SOURCES) {
    const adapter = ADAPTERS[source.id];
    assert.ok(adapter, source.id + ' has no adapter');
    // Unconfigured on purpose: this asserts the honest resting state of each one.
    const snap = await adapter({
      sourceId: source.id, config: {}, ...fakeFs(),
      fetch: async () => { throw new Error('down'); }, now,
    });
    const r = validateSnapshot({ ...snap, revision: 'sha256-test' }, NOW);
    assert.equal(r.ok, true, source.id + ': ' + JSON.stringify(r.errors));
    assert.ok(['ready', 'degraded', 'unavailable', 'not-configured', 'reference-only'].includes(snap.status),
      source.id + ' produced no explicit state');
  }
});
