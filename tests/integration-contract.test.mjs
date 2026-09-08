/* T2 contract tests — run with: node --test tests/integration-contract.test.mjs
   Every fixture uses fixed instants. No wall-clock dates: a test that passes in
   September and fails in October is worse than no test. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, SCHEMA_VERSION, LIMITS, REASON_COPY, getSource, sourceIds } from '../integrations/registry.mjs';
import { validateSnapshot, displayState } from '../integrations/contract.mjs';

const OBSERVED = '2026-09-06T14:00:00Z';
const EXPIRES = '2026-09-06T14:15:00Z';
const NOW = Date.parse(OBSERVED);

const valid = (over = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  sourceId: 'encore',
  observedAt: OBSERVED,
  sourceUpdatedAt: null,
  expiresAt: EXPIRES,
  status: 'ready',
  reasonCode: null,
  metrics: [{ key: 'itemCount', label: 'Catalogue items', value: 42, unit: 'count' }],
  links: [],
  revision: 'sha256-abc',
  ...over,
});

const errorsFor = (input, nowMs = NOW) => {
  const r = validateSnapshot(input, nowMs);
  assert.equal(r.ok, false, 'expected validation to fail');
  return r.errors.join(' | ');
};

/* ============================ registry ============================ */

test('every SPEC source is registered exactly once, dashboard is not a source', () => {
  const ids = sourceIds();
  assert.deepEqual(ids, [...new Set(ids)], 'duplicate source IDs');
  for (const id of ['encore', 'ai-trading-lab', 'sleepforge', 'fanbox-downloader',
                    'anchor-context', 'ai-memory-portability', 'personal-hub',
                    'pr-documents', 'graphify']) {
    assert.ok(ids.includes(id), 'missing source ' + id);
  }
  assert.equal(ids.includes('phone-dashboard'), false, 'the shell must not poll itself');
});

test('every source declares a mode, group, and TTL', () => {
  for (const s of SOURCES) {
    assert.ok(['live', 'reference'].includes(s.mode), s.id + ' mode');
    assert.ok(typeof s.group === 'string' && s.group.length, s.id + ' group');
    assert.ok(Number.isFinite(s.ttlMs) && s.ttlMs > 0, s.id + ' ttlMs');
    assert.ok(Array.isArray(s.allowedMetricKeys), s.id + ' allowedMetricKeys');
    assert.ok(Array.isArray(s.allowedHosts), s.id + ' allowedHosts');
  }
});

test('SPEC default TTLs', () => {
  assert.equal(getSource('encore').ttlMs, 15 * 60_000);
  assert.equal(getSource('ai-trading-lab').ttlMs, 5 * 60_000);
  assert.equal(getSource('sleepforge').ttlMs, 24 * 3600_000);
  assert.equal(getSource('graphify').ttlMs, 24 * 3600_000);
  assert.equal(getSource('pr-documents').ttlMs, 7 * 24 * 3600_000);
});

test('reference sources publish no metrics and no hosts', () => {
  for (const s of SOURCES.filter(x => x.mode === 'reference')) {
    assert.deepEqual(s.allowedMetricKeys, [], s.id + ' must expose no metrics');
    assert.deepEqual(s.allowedHosts, [], s.id + ' must expose no links');
  }
});

test('no host is allowlisted until a URL is actually verified', () => {
  for (const s of SOURCES) assert.deepEqual(s.allowedHosts, [], s.id + ' has an unverified host');
});

test('every reason code has fixed user copy and no raw exception text', () => {
  for (const code of ['timeout', 'unreachable', 'invalid-data', 'missing-file', 'not-configured', 'source-stale']) {
    assert.ok(REASON_COPY[code] && REASON_COPY[code].length < LIMITS.maxStringChars, code);
  }
});

/* ============================ happy path ============================ */

test('a valid snapshot passes and is rebuilt, not spread', () => {
  const r = validateSnapshot(valid(), NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value).sort(), [
    'expiresAt', 'links', 'metrics', 'observedAt', 'reasonCode',
    'revision', 'schemaVersion', 'sourceId', 'sourceUpdatedAt', 'status',
  ]);
  assert.equal(r.value.metrics[0].value, 42);
});

test('validation does not mutate its input', () => {
  const input = valid();
  const before = JSON.stringify(input);
  validateSnapshot(input, NOW);
  assert.equal(JSON.stringify(input), before);
});

/* ======================= rejection: shape ========================= */

test('unknown top-level keys are rejected, never carried through', () => {
  assert.match(errorsFor(valid({ evil: 'payload', __proto__: 'x' })), /unknown keys/);
  const r = validateSnapshot(valid({ evil: 'payload' }), NOW);
  assert.equal(r.ok, false);
});

test('unregistered source IDs are rejected', () => {
  assert.match(errorsFor(valid({ sourceId: 'not-a-real-app' })), /not a registered source/);
  assert.match(errorsFor(valid({ sourceId: 'phone-dashboard' })), /not a registered source/);
});

test('wrong schema versions are rejected', () => {
  assert.match(errorsFor(valid({ schemaVersion: 2 })), /schemaVersion/);
  assert.match(errorsFor(valid({ schemaVersion: '1' })), /schemaVersion/);
});

test('non-objects are rejected without throwing', () => {
  for (const bad of [null, undefined, 42, 'x', [], true]) {
    assert.equal(validateSnapshot(bad, NOW).ok, false);
  }
});

test('unknown status and reason codes are rejected', () => {
  assert.match(errorsFor(valid({ status: 'fine' })), /status/);
  assert.match(errorsFor(valid({ status: 'stale' })), /status/, 'stale is derived, never stored');
  assert.match(errorsFor(valid({ reasonCode: 'ECONNREFUSED at line 42' })), /reasonCode/);
});

/* ======================= rejection: numbers ======================= */

test('non-finite metric values are rejected', () => {
  for (const v of [NaN, Infinity, -Infinity]) {
    assert.match(errorsFor(valid({ metrics: [{ key: 'itemCount', label: 'n', value: v, unit: null }] })), /finite/);
  }
});

test('metric keys outside the source allowlist are rejected', () => {
  assert.match(errorsFor(valid({ metrics: [{ key: 'portfolioValue', label: 'Portfolio', value: 1, unit: null }] })),
    /not allowed for encore/);
});

test('more than 8 metrics is rejected', () => {
  const metrics = Array.from({ length: 9 }, () => ({ key: 'itemCount', label: 'n', value: 1, unit: null }));
  assert.match(errorsFor(valid({ metrics })), /at most 8/);
});

test('oversized payloads are rejected', () => {
  const big = 'x'.repeat(LIMITS.maxStringChars + 1);
  assert.match(errorsFor(valid({ metrics: [{ key: 'itemCount', label: big, value: 1, unit: null }] })), /exceeds 160/);
});

/* ========================= rejection: dates ====================== */

test('invalid dates are rejected', () => {
  assert.match(errorsFor(valid({ observedAt: '2026' })), /observedAt/);
  assert.match(errorsFor(valid({ observedAt: 'yesterday' })), /observedAt/);
  assert.match(errorsFor(valid({ observedAt: 1778689402000 })), /observedAt/);
});

test('expiry before or equal to observation is rejected', () => {
  assert.match(errorsFor(valid({ expiresAt: '2026-09-06T13:00:00Z' })), /after observedAt/);
  assert.match(errorsFor(valid({ expiresAt: OBSERVED })), /after observedAt/);
});

test('timestamps more than 5 minutes in the future are rejected', () => {
  assert.match(errorsFor(valid({ observedAt: '2026-09-06T14:06:00Z', expiresAt: '2026-09-06T14:30:00Z' })), /future/);
  // Inside the skew allowance, a slightly fast collector clock is tolerated.
  assert.equal(validateSnapshot(valid({ observedAt: '2026-09-06T14:04:00Z' }), NOW).ok, true);
});

test('without a clock, future checks are skipped and remain deterministic', () => {
  assert.equal(validateSnapshot(valid({ observedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:15:00Z' })).ok, true);
});

/* ========================= rejection: links ====================== */

test('hostile links are rejected', () => {
  const link = href => valid({ links: [{ label: 'Open', href }] });
  assert.match(errorsFor(link('javascript:alert(1)')), /https/);
  assert.match(errorsFor(link('file:///etc/passwd')), /https/);
  assert.match(errorsFor(link('http://example.com/')), /https/);
  assert.match(errorsFor(link('https://user:pass@example.com/')), /credentials/);
  assert.match(errorsFor(link('https://example.com/?token=secret')), /query or fragment/);
  assert.match(errorsFor(link('https://evil.example/')), /not allowlisted/);
  assert.match(errorsFor(link('not a url')), /valid URL/);
});

test('more than 3 links is rejected', () => {
  const links = Array.from({ length: 4 }, () => ({ label: 'x', href: 'https://a.example/' }));
  assert.match(errorsFor(valid({ links })), /at most 3/);
});

test('script-shaped label text is data, never markup, and stays capped', () => {
  const label = '<img src=x onerror=alert(1)>';
  const r = validateSnapshot(valid({ metrics: [{ key: 'itemCount', label, value: 1, unit: null }] }), NOW);
  assert.equal(r.ok, true, 'the contract stores text verbatim; the view must render it with textContent');
  assert.equal(r.value.metrics[0].label, label);
});

/* ========================== displayState ========================= */

test('snapshot is stale at its expiry', () => {
  const snapshot = { sourceId: 'encore', status: 'ready', observedAt: OBSERVED, sourceUpdatedAt: null, expiresAt: EXPIRES };
  assert.equal(displayState(snapshot, Date.parse(snapshot.expiresAt)), 'stale');
});

test('snapshot is ready one millisecond before expiry', () => {
  const snapshot = { sourceId: 'encore', status: 'ready', observedAt: OBSERVED, sourceUpdatedAt: null, expiresAt: EXPIRES };
  assert.equal(displayState(snapshot, Date.parse(EXPIRES) - 1), 'ready');
});

test('fresh observation of old source data is still stale', () => {
  const snapshot = {
    sourceId: 'encore', status: 'ready',
    observedAt: OBSERVED, expiresAt: EXPIRES,
    sourceUpdatedAt: '2026-09-01T14:00:00Z', // 5 days old, cap is 24h
  };
  assert.equal(displayState(snapshot, NOW), 'stale', 'a 200 response does not make the data behind it current');
});

test('unavailable and not-configured outrank staleness', () => {
  const base = { sourceId: 'encore', observedAt: OBSERVED, sourceUpdatedAt: null, expiresAt: EXPIRES };
  const late = Date.parse(EXPIRES) + 1;
  assert.equal(displayState({ ...base, status: 'unavailable' }, late), 'unavailable');
  assert.equal(displayState({ ...base, status: 'not-configured' }, late), 'not-configured');
});

test('reference entries never go stale and make no health claim', () => {
  const snapshot = {
    sourceId: 'pr-documents', status: 'reference-only',
    observedAt: OBSERVED, sourceUpdatedAt: null, expiresAt: EXPIRES,
  };
  assert.equal(displayState(snapshot, Date.parse(EXPIRES) + 10 * 24 * 3600_000), 'reference-only');
});

test('degraded is preserved while in date', () => {
  const snapshot = { sourceId: 'encore', status: 'degraded', observedAt: OBSERVED, sourceUpdatedAt: null, expiresAt: EXPIRES };
  assert.equal(displayState(snapshot, NOW), 'degraded');
});
