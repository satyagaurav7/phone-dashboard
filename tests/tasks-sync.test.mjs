import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SYNC_URL = new URL('../scripts/tasks-sync.mjs', import.meta.url);
const source = readFileSync(SYNC_URL, 'utf8');

const MON = '2026-09-07'; // Monday
const THU = '2026-09-10';

const sched = {
  chores: [
    { id: 'roomreset', title: 'Reset room', cadence: { mode: 'daily' }, activeMin: 8, steps: ['a'] },
    { id: 'roomclean', title: 'Room clean', cadence: { mode: 'weekly', dow: 4 }, activeMin: 35, steps: ['a'] },
    { id: 'waste', title: 'Waste', cadence: { mode: 'asneeded' }, activeMin: 5, steps: ['a'] },
  ],
};
const state = { config: { choresStart: MON } };
// Most tests below are about ONE chore's reconciliation. Using the full
// catalogue would also drag in `roomclean`, which is genuinely overdue on a
// Monday and correctly gets created — true, but noise for these assertions.
const solo = { chores: [sched.chores[0]] };

test('identity is the marker, never the title', async () => {
  const { markerFor, parseMarker } = await import(SYNC_URL);
  assert.equal(markerFor('roomreset', MON), 'flowstate:roomreset@2026-09-07');
  assert.deepEqual(parseMarker('some note\nflowstate:roomreset@2026-09-07'), { choreId: 'roomreset', occurrence: MON });
  assert.equal(parseMarker('Reset room'), null);
  assert.equal(parseMarker(null), null);
});

test('a due chore with no task is created exactly once', async () => {
  const { planSync } = await import(SYNC_URL);
  const plan = planSync({ sched: solo, state, today: MON, tasks: [] });
  assert.deepEqual(plan.create.map(c => c.choreId), ['roomreset']);
  assert.equal(plan.create[0].notes, 'flowstate:roomreset@2026-09-07');
  assert.equal(plan.create[0].due, '2026-09-07T00:00:00.000Z');
});

test('an already-open task is kept, never duplicated', async () => {
  const { planSync } = await import(SYNC_URL);
  const tasks = [{ id: 'g1', title: 'Reset room', status: 'needsAction', notes: 'flowstate:roomreset@2026-09-07' }];
  const plan = planSync({ sched: solo, state, today: MON, tasks });
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.keep.map(k => k.taskId), ['g1']);
});

test('one open occurrence: a stale open task blocks a new one', async () => {
  // Section 8.7. An unfinished task from an older occurrence is THE outstanding
  // job. Creating today's as well would start the backlog the plan forbids.
  const { planSync } = await import(SYNC_URL);
  const tasks = [{ id: 'old', title: 'Reset room', status: 'needsAction', notes: 'flowstate:roomreset@2026-09-01' }];
  const plan = planSync({ sched: solo, state, today: MON, tasks });
  assert.deepEqual(plan.create, []);
  assert.equal(plan.keep[0].occurrence, '2026-09-01');
});

test('completion in Google wins and is reported back, not overwritten', async () => {
  const { planSync } = await import(SYNC_URL);
  const tasks = [{ id: 'g1', title: 'Reset room', status: 'completed', notes: 'flowstate:roomreset@2026-09-07' }];
  const plan = planSync({ sched: solo, state, today: MON, tasks });
  assert.deepEqual(plan.inboundCompletions, [{ choreId: 'roomreset', occurrence: MON, taskId: 'g1' }]);
  assert.deepEqual(plan.create, [], 'a completed occurrence is never recreated');
});

test('a completion FLOWSTATE already knows about is not reported twice', async () => {
  const { planSync } = await import(SYNC_URL);
  const known = { config: { choresStart: MON }, chores: { roomreset: { done: { [MON]: true } } } };
  const tasks = [{ id: 'g1', title: 'Reset room', status: 'completed', notes: 'flowstate:roomreset@2026-09-07' }];
  const plan = planSync({ sched, state: known, today: MON, tasks });
  assert.deepEqual(plan.inboundCompletions, []);
});

test("the user's own tasks are seen, never touched, and never deleted", async () => {
  const { planSync } = await import(SYNC_URL);
  const tasks = [
    { id: 'mine', title: 'Call the landlord', status: 'needsAction', notes: 'remember the deposit' },
    { id: 'mine2', title: 'Reset room', status: 'needsAction' }, // same title, no marker: NOT ours
  ];
  const plan = planSync({ sched: solo, state, today: MON, tasks });
  assert.deepEqual(plan.foreign.sort(), ['mine', 'mine2']);
  assert.deepEqual(plan.deletes, []);
  // The unmarked look-alike must not be adopted, so today's task is still created.
  assert.deepEqual(plan.create.map(c => c.choreId), ['roomreset']);
});

test('renaming a task in Google does not orphan it', async () => {
  const { planSync } = await import(SYNC_URL);
  const tasks = [{ id: 'g1', title: 'tidy up lol', status: 'needsAction', notes: 'flowstate:roomreset@2026-09-07' }];
  const plan = planSync({ sched: solo, state, today: MON, tasks });
  assert.deepEqual(plan.create, []);
  assert.equal(plan.keep[0].choreId, 'roomreset');
});

test('an as-needed chore is never pushed to Google', async () => {
  const { planSync } = await import(SYNC_URL);
  const plan = planSync({ sched, state, today: THU, tasks: [] });
  assert.ok(!plan.create.some(c => c.choreId === 'waste'));
});

test('only the chores explicitly opted in are synced', async () => {
  const { planSync } = await import(SYNC_URL);
  const narrowed = { ...sched, tasksSync: { chores: ['roomclean'] } };
  const plan = planSync({ sched: narrowed, state, today: THU, tasks: [] });
  assert.deepEqual(plan.create.map(c => c.choreId), ['roomclean']);
});

test('planning is idempotent: applying then replanning proposes nothing', async () => {
  const { planSync } = await import(SYNC_URL);
  const first = planSync({ sched: solo, state, today: MON, tasks: [] });
  const applied = first.create.map((c, i) => ({ id: `new${i}`, title: c.title, status: 'needsAction', notes: c.notes }));
  const second = planSync({ sched: solo, state, today: MON, tasks: applied });
  assert.deepEqual(second.create, [], 'a second run must not duplicate anything');
});

test('an ambiguous creation reconciles instead of blindly retrying', async () => {
  const { retryDecision } = await import(SYNC_URL);
  const marker = { choreId: 'roomreset', occurrence: MON };
  const created = [{ id: 'g1', notes: 'flowstate:roomreset@2026-09-07' }];
  assert.deepEqual(retryDecision({ error: { retryable: true }, marker, tasksAfterRefetch: created }),
    { action: 'already-created', safe: true });
  assert.deepEqual(retryDecision({ error: { retryable: true }, marker, tasksAfterRefetch: [] }),
    { action: 'retry', safe: true });
  assert.deepEqual(retryDecision({ error: { retryable: false }, marker, tasksAfterRefetch: [] }),
    { action: 'pause-for-review', safe: false });
});

test('a read-only credential cannot pass the write gate', async () => {
  const { canWrite } = await import(SYNC_URL);
  assert.equal(canWrite({ scope: 'https://www.googleapis.com/auth/tasks.readonly' }), false);
  assert.equal(canWrite({ scope: 'https://www.googleapis.com/auth/tasks' }), true);
  assert.equal(canWrite({}), false);
  assert.equal(canWrite(null), false);
});

test('writing is gated three times over and defaults to a dry run', () => {
  assert.ok(source.includes("const LIVE = process.argv.includes('--live')"));
  assert.ok(/tasksSync\?\.enabled !== true/.test(source), 'schedule must opt in');
  assert.ok(/if \(!canWrite\(creds\)\)/.test(source), 'scope must permit writing');
  assert.ok(/DRY RUN\. Nothing was written/.test(source));
});

test('the script contains no delete path at all', () => {
  assert.ok(!/method:\s*'DELETE'/i.test(source), 'nothing here may delete a task');
  const posts = source.match(/method:\s*'POST'/g) || [];
  assert.equal(posts.length, 2, 'exactly two POSTs: the token refresh and task creation');
});

test('it refuses to run in CI, because this repository is public', () => {
  assert.ok(/Refusing to run in CI/.test(source));
});

test('due dates are sent as calendar days, since the API discards time', async () => {
  const { dueFor } = await import(SYNC_URL);
  assert.equal(dueFor('2026-11-01'), '2026-11-01T00:00:00.000Z');
  // The day Toronto leaves DST. A local-midnight instant would shift the date.
  assert.ok(dueFor('2026-11-01').startsWith('2026-11-01'));
});

test('an overdue chore is pushed too, not only a chore due today', async () => {
  // The behaviour that made the narrowed fixtures necessary, asserted directly:
  // roomclean is a Thursday job, and on the following Monday it is genuinely
  // outstanding, so it belongs in Google.
  const { planSync } = await import(SYNC_URL);
  const plan = planSync({ sched, state: { config: { choresStart: '2026-09-01' } }, today: MON, tasks: [] });
  assert.deepEqual(plan.create.map(c => c.choreId).sort(), ['roomclean', 'roomreset']);
  assert.equal(plan.create.find(c => c.choreId === 'roomclean').occurrence, '2026-09-03');
});
