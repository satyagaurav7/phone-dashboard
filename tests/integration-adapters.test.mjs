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
