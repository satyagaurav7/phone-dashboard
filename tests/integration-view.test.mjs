/* T3 Workspace view tests — node --test tests/integration-view.test.mjs

   Real DOM via jsdom (already a dependency, used by midnight.test.cjs). The
   view is the last gate before anything reaches a screen, so these tests care
   about two things above all: hostile text stays text, and an honest state is
   shown for every source rather than a blank or a guess. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SOURCES } from '../integrations/registry.mjs';
import { mountWorkspace, STATE_COPY } from '../integrations/view.mjs';
import { startWorkspace } from '../integrations/controller.mjs';
import { FIXTURE_SNAPSHOTS, createFixtureTransport } from '../integrations/fixtures.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const NOW = Date.parse('2026-09-07T12:00:00Z');

function dom() {
  const d = new JSDOM('<!doctype html><body><div id="ws"></div></body>');
  return { document: d.window.document, container: d.window.document.getElementById('ws'), window: d.window };
}

const snap = (over = {}) => ({
  schemaVersion: 1,
  sourceId: 'encore',
  observedAt: '2026-09-07T11:55:00Z',
  sourceUpdatedAt: null,
  expiresAt: '2026-09-07T12:10:00Z',
  status: 'ready',
  reasonCode: null,
  metrics: [{ key: 'itemCount', label: 'Catalogue items', value: 38076, unit: 'count' }],
  links: [],
  revision: 'sha256-x',
  ...over,
});

const sectionFor = (container, id) => container.querySelector('[data-source="' + id + '"]');
const stateText = (container, id) => sectionFor(container, id).querySelector('[data-state]').textContent;

/* ========================== structure ========================== */

test('every registered source gets a section, in registry order', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  view.render([], NOW);

  const rendered = [...container.querySelectorAll('[data-source]')].map(el => el.dataset.source);
  assert.deepEqual(rendered, SOURCES.map(s => s.id), 'order comes from the registry, never from the data');
});

test('a source with no snapshot says so rather than rendering blank', () => {
  const { container, document } = dom();
  mountWorkspace({ container, document }).render([], NOW);
  assert.equal(stateText(container, 'encore'), STATE_COPY['no-data']);
  assert.notEqual(STATE_COPY['no-data'], '');
});

test('one broken source cannot stop the others rendering', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  // A snapshot missing the fields the view reads must not throw the whole render.
  view.render([{ sourceId: 'encore' }, snap({ sourceId: 'ai-trading-lab', status: 'ready', metrics: [] })], NOW);
  assert.ok(sectionFor(container, 'ai-trading-lab'), 'sibling section still mounted');
  assert.equal(container.querySelectorAll('[data-source]').length, SOURCES.length);
});

/* ============================ states =========================== */

test('each state has distinct, non-empty copy', () => {
  const values = Object.values(STATE_COPY);
  assert.equal(new Set(values).size, values.length, 'two states share the same wording');
  for (const [k, v] of Object.entries(STATE_COPY)) assert.ok(v && v.length > 0, k + ' has no copy');
});

test('ready, degraded, unavailable, not-configured and reference-only each render differently', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  view.render([
    snap({ sourceId: 'encore', status: 'ready' }),
    snap({ sourceId: 'ai-trading-lab', status: 'degraded', reasonCode: 'invalid-data', metrics: [] }),
    snap({ sourceId: 'sleepforge', status: 'unavailable', reasonCode: 'unreachable', metrics: [] }),
    snap({ sourceId: 'graphify', status: 'not-configured', reasonCode: 'not-configured', metrics: [] }),
    snap({ sourceId: 'pr-documents', status: 'reference-only', metrics: [] }),
  ], NOW);

  assert.equal(stateText(container, 'encore'), STATE_COPY.ready);
  assert.equal(stateText(container, 'ai-trading-lab'), STATE_COPY.degraded);
  assert.equal(stateText(container, 'sleepforge'), STATE_COPY.unavailable);
  assert.equal(stateText(container, 'graphify'), STATE_COPY['not-configured']);
  assert.equal(stateText(container, 'pr-documents'), STATE_COPY['reference-only']);
});

test('an expired snapshot renders as stale, not ready', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  view.render([snap()], Date.parse('2026-09-07T12:10:00Z'));
  assert.equal(stateText(container, 'encore'), STATE_COPY.stale);
});

test('a reason code shows fixed copy, never a raw error string', () => {
  const { container, document } = dom();
  mountWorkspace({ container, document })
    .render([snap({ status: 'unavailable', reasonCode: 'timeout', metrics: [] })], NOW);
  const text = sectionFor(container, 'encore').textContent;
  assert.match(text, /did not respond in time/i);
  assert.equal(text.includes('timeout'), false, 'the bare code is not user copy');
});

/* ======================= hostile content ======================= */

test('script-shaped label text renders literally and creates no element', () => {
  const { container, document } = dom();
  const hostile = '<img src=x onerror=alert(1)>';
  mountWorkspace({ container, document })
    .render([snap({ metrics: [{ key: 'itemCount', label: hostile, value: 1, unit: null }] })], NOW);

  const section = sectionFor(container, 'encore');
  assert.equal(section.querySelectorAll('img').length, 0, 'markup was parsed instead of shown');
  assert.ok(section.textContent.includes(hostile), 'the text itself must still be visible');
});

test('a hostile source label cannot inject markup either', () => {
  const { container, document } = dom();
  const view = mountWorkspace({
    container, document,
    sources: [{ id: 'encore', label: '<script>bad()</script>', group: 'apps', mode: 'live', ttlMs: 1000, allowedMetricKeys: [], allowedHosts: [] }],
  });
  view.render([], NOW);
  assert.equal(container.querySelectorAll('script').length, 0);
});

test('links are re-validated in the view before href is assigned', () => {
  const { container, document } = dom();
  const view = mountWorkspace({
    container, document,
    sources: [{ id: 'encore', label: 'Encore', group: 'apps', mode: 'live', ttlMs: 1000, allowedMetricKeys: ['itemCount'], allowedHosts: ['ok.example'] }],
  });
  view.render([snap({
    links: [
      { label: 'Good', href: 'https://ok.example/dash' },
      { label: 'Bad protocol', href: 'javascript:alert(1)' },
      { label: 'Bad host', href: 'https://evil.example/' },
    ],
  })], NOW);

  const hrefs = [...sectionFor(container, 'encore').querySelectorAll('a')].map(a => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['https://ok.example/dash'], 'only the allowlisted https link survives');
});

test('a live source with no verified host says it is laptop-only, not a dead link', () => {
  const { container, document } = dom();
  mountWorkspace({ container, document }).render([snap()], NOW);
  const section = sectionFor(container, 'encore');
  assert.equal(section.querySelectorAll('a').length, 0);
  assert.match(section.textContent, /Available on laptop/i);
});

/* ============================ metrics ========================== */

test('metrics render with label and value; an empty list renders no rows', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  view.render([snap()], NOW);
  const section = sectionFor(container, 'encore');
  assert.match(section.textContent, /Catalogue items/);
  assert.match(section.textContent, /38,?076/);

  view.render([snap({ metrics: [] })], NOW);
  assert.equal(sectionFor(container, 'encore').querySelectorAll('[data-metric]').length, 0);
});

/* =========================== fixtures ========================== */

test('fixture transport refuses to run unless explicitly enabled', () => {
  assert.throws(() => createFixtureTransport({ enabled: false }), /explicitly enabled/i);
  assert.throws(() => createFixtureTransport({}), /explicitly enabled/i);
  assert.equal(typeof createFixtureTransport({ enabled: true }), 'function');
});

test('fixture rendering always shows a visible badge', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  view.render(FIXTURE_SNAPSHOTS, NOW, { fixture: true });
  assert.match(container.textContent, /sample data/i);

  view.render(FIXTURE_SNAPSHOTS, NOW, { fixture: false });
  assert.equal(/sample data/i.test(container.textContent), false, 'the badge must not linger on real data');
});

test('the fixtures include a hostile label so the escaping path is always exercised', () => {
  const labels = FIXTURE_SNAPSHOTS.flatMap(s => (s.metrics || []).map(m => m.label));
  assert.ok(labels.some(l => l.includes('<')), 'no hostile fixture present');
});

/* ========================== controller ========================= */

test('controller subscribes, renders, and cleans up exactly once', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  let unsubscribed = 0;
  const stop = startWorkspace({
    view,
    subscribe: onSnapshots => { onSnapshots([snap()]); return () => { unsubscribed += 1; }; },
    now: () => NOW,
  });
  assert.equal(stateText(container, 'encore'), STATE_COPY.ready);

  stop();
  assert.equal(unsubscribed, 1);
  assert.equal(container.textContent.trim(), '', 'snapshots are cleared on teardown, not left on screen');

  stop();
  assert.equal(unsubscribed, 1, 'cleanup is idempotent');
});

test('the clock alone can move a section from ready to stale', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  let clock = NOW;
  let fireTick = null;
  const stop = startWorkspace({
    view,
    subscribe: onSnapshots => { onSnapshots([snap()]); return () => {}; },
    now: () => clock,
    tick: fn => { fireTick = fn; return () => { fireTick = null; }; },
  });
  assert.equal(stateText(container, 'encore'), STATE_COPY.ready);

  // Only the clock moves. No new snapshot arrives — which is exactly the case
  // where a card would otherwise sit on "Ready" after the laptop slept.
  clock = Date.parse('2026-09-07T12:10:00Z');
  fireTick();
  assert.equal(stateText(container, 'encore'), STATE_COPY.stale, 'the ticker must re-render against the current clock');

  stop();
  assert.equal(fireTick, null, 'the ticker is stopped on cleanup');
});

test('a transport error is shown without leaking the error text', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  const stop = startWorkspace({
    view,
    subscribe: (onSnapshots, onError) => { onError(new Error('FirebaseError: permission-denied at /users/abc123')); return () => {}; },
    now: () => NOW,
  });
  assert.equal(container.textContent.includes('abc123'), false);
  assert.equal(container.textContent.includes('FirebaseError'), false);
  assert.match(container.textContent, /could not load/i);
  stop();
});

test('a reference source reads "Reference only" even with nothing published', () => {
  const { container, document } = dom();
  mountWorkspace({ container, document }).render([], NOW);
  // These are pointers, not services. "No data yet" would imply one is pending.
  for (const id of ['pr-documents', 'personal-hub', 'anchor-context', 'ai-memory-portability']) {
    assert.equal(stateText(container, id), STATE_COPY['reference-only'], id);
  }
  assert.equal(stateText(container, 'encore'), STATE_COPY['no-data'], 'a live source still says no data');
});

test('the derived state is exposed for styling and reset between renders', () => {
  const { container, document } = dom();
  const view = mountWorkspace({ container, document });
  const attr = id => sectionFor(container, id).querySelector('[data-state]').dataset.state;

  view.render([snap()], NOW);
  assert.equal(attr('encore'), 'ready');
  view.render([snap({ status: 'unavailable', reasonCode: 'unreachable', metrics: [] })], NOW);
  assert.equal(attr('encore'), 'unavailable', 'a stale attribute would keep the old colour');
});

/* Source guard for the bug that shipped: syncWorkspace() lives OUTSIDE draw(),
   but referenced draw()'s local `root`, so it threw ReferenceError before its
   own try/catch and the Workspace silently rendered nothing. jsdom tests of the
   view could not catch it — the view was fine; the caller never ran. */
test('syncWorkspace does not reach for draw()-local variables', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('async function syncWorkspace');
  assert.ok(start > 0, 'syncWorkspace not found — rename the test with the function');
  const body = html.slice(start, html.indexOf('\n    }', start));

  // Comments in this function legitimately mention draw()'s root while
  // explaining the bug, so only executable lines are checked.
  const code = body.replace(new RegExp('//[^' + String.fromCharCode(10) + ']*', 'g'), '');
  const identifiers = new Set(code.split(/[^A-Za-z_$]+/));
  assert.equal(identifiers.has('root'), false,
    'syncWorkspace referenced `root`, which is local to draw() and undefined here');
  assert.ok(body.includes("document.getElementById('workspaceRoot')"),
    'the container must be looked up from document, not a draw() local');
});
