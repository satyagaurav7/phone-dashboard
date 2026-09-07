import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const AUDIT_URL = new URL('../scripts/tasks-audit.mjs', import.meta.url);
const source = readFileSync(AUDIT_URL, 'utf8');

test('the audit can only read: no write verb appears anywhere in it', () => {
  // The safety property is structural, not a promise in a comment. If someone
  // later adds a POST here, this fails.
  for (const verb of ['PATCH', 'PUT', 'DELETE']) {
    assert.ok(!new RegExp(`method:\\s*['"\`]${verb}`, 'i').test(source), `${verb} must not appear`);
  }
  // Exactly one POST is legitimate: the OAuth token refresh, which goes to
  // Google's token endpoint and not to the Tasks API. Any second POST, or a
  // POST aimed at API, is a write and fails this test.
  const posts = source.match(/method:\s*'POST'/g) || [];
  assert.equal(posts.length, 1, 'the only POST may be the token refresh');
  assert.ok(source.includes("TOKEN_URL, { method: 'POST'"));
  assert.ok(!/fetch\(`\$\{API\}[^)]*method/.test(source), 'no request to the Tasks API may carry a method');
});

test('it refuses to run in CI, because this repository is public', () => {
  assert.ok(source.includes('GITHUB_ACTIONS'));
  assert.ok(/Refusing to run in CI/.test(source));
});

test('titles normalise for comparison without deciding identity', async () => {
  const { normalizeTitle } = await import(AUDIT_URL);
  assert.equal(normalizeTitle('  Reset  Room! '), 'reset room');
  assert.equal(normalizeTitle('Kitchen — Close'), 'kitchen close');
  assert.equal(normalizeTitle(null), '');
  assert.equal(normalizeTitle('Café'), 'cafe');
});

test('a single title match is a candidate; a duplicate is ambiguous', async () => {
  const { buildMapping } = await import(AUDIT_URL);
  const chores = [
    { id: 'roomreset', title: 'Reset room' },
    { id: 'stock', title: 'Stock check' },
    { id: 'carreset', title: 'Car reset' },
  ];
  const tasks = [
    { id: 't1', title: 'reset room' },
    { id: 't2', title: 'Stock Check' },
    { id: 't3', title: 'stock check' },
    { id: 't9', title: 'Pay rent' },
  ];
  const map = buildMapping(chores, tasks);
  assert.deepEqual(map.matched, [{ choreId: 'roomreset', taskId: 't1', title: 'Reset room' }]);
  assert.equal(map.ambiguous.length, 1);
  assert.deepEqual(map.ambiguous[0].candidates, ['t2', 't3']);
  assert.deepEqual(map.missing.map(m => m.choreId), ['carreset']);
  // An ambiguous chore claims neither task, so both stay listed as unmatched.
  assert.deepEqual(map.unmatchedTasks.sort(), ['t2', 't3', 't9']);
});

test('pagination follows every page and asks for completed and hidden tasks', async () => {
  const { paginate } = await import(AUDIT_URL);
  const seen = [];
  const get = async path => {
    seen.push(path);
    if (!path.includes('pageToken')) return { items: [{ id: 'a' }], nextPageToken: 'p2' };
    return { items: [{ id: 'b' }] };
  };
  const items = await paginate(get, 'lists/x/tasks', { showCompleted: 'true', showHidden: 'true' });
  assert.deepEqual(items.map(i => i.id), ['a', 'b']);
  assert.equal(seen.length, 2);
  assert.ok(seen.every(p => p.includes('showCompleted=true') && p.includes('showHidden=true')));
  assert.ok(seen[1].includes('pageToken=p2'));
});

test('an empty page terminates rather than looping', async () => {
  const { paginate } = await import(AUDIT_URL);
  const items = await paginate(async () => ({}), 'lists/x/tasks');
  assert.deepEqual(items, []);
});

test('the summary counts completed tasks and notes that due carries no time', async () => {
  const { summarise } = await import(AUDIT_URL);
  const [row] = summarise([{
    id: 'l1', title: 'FLOWSTATE', tasks: [
      { id: '1', status: 'needsAction', due: '2026-09-07T00:00:00.000Z' },
      { id: '2', status: 'completed', due: '2026-09-06T00:00:00.000Z' },
      { id: '3', status: 'needsAction' },
    ],
  }]);
  assert.equal(row.total, 3);
  assert.equal(row.open, 2);
  assert.equal(row.completed, 1);
  assert.equal(row.dated, 2);
  assert.equal(row.withTimeOfDay, 0, 'the API discards time of day; nothing should claim otherwise');
});
