import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CHORES_URL = new URL('../chores.mjs', import.meta.url);
const RULES_URL = new URL('../rules.mjs', import.meta.url);
const schedule = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));

// 2026-09-07 is a Monday, 2026-09-10 a Thursday, 2026-09-13 a Sunday.
const MON = '2026-09-07';
const THU = '2026-09-10';
const SUN = '2026-09-13';

const fixture = {
  chores: [
    { id: 'daily', title: 'Daily job', cadence: { mode: 'daily' }, activeMin: 8, steps: ['a', 'b'] },
    { id: 'thursday', title: 'Weekly job', cadence: { mode: 'weekly', dow: 4 }, activeMin: 35 },
    { id: 'monthly', title: 'Monthly job', cadence: { mode: 'monthly' }, activeMin: 25 },
    { id: 'anytime', title: 'When full', cadence: { mode: 'asneeded' }, activeMin: 8 },
    {
      id: 'staged', title: 'Laundry', cadence: { mode: 'weekly', dow: 0 },
      stages: [
        { id: 'sort', label: 'Sort and load', activeMin: 10 },
        { id: 'wash', label: 'Wash', waitMin: 60 },
        { id: 'fold', label: 'Fold', activeMin: 25 },
      ],
    },
  ],
};

test('a daily chore is due today until it is completed today', async () => {
  const { choreState, STATUS } = await import(CHORES_URL);
  const chore = fixture.chores[0];
  assert.equal(choreState({ chore, record: {}, today: MON }).status, STATUS.DUE);
  assert.equal(choreState({ chore, record: { last: MON }, today: MON }).status, STATUS.DONE);
  assert.equal(choreState({ chore, record: { last: '2026-09-06' }, today: MON }).status, STATUS.DUE);
});

test('a weekly chore is upcoming before its day and overdue after it', async () => {
  const { choreState, STATUS } = await import(CHORES_URL);
  const chore = fixture.chores[1]; // Thursday
  const onDay = choreState({ chore, record: {}, today: THU });
  assert.equal(onDay.status, STATUS.DUE);
  assert.equal(onDay.overdueDays, 0);

  const late = choreState({ chore, record: {}, today: SUN }); // three days past Thursday
  assert.equal(late.status, STATUS.OVERDUE);
  assert.equal(late.overdueDays, 3);
  assert.equal(late.dueDate, THU);
});

test('a weekly chore skipped for a month is ONE overdue job, never a backlog', async () => {
  // Section 8.7. The occurrence is computed from the cadence, so missing four
  // Thursdays cannot accumulate four copies.
  const { upkeepBoard, STATUS } = await import(CHORES_URL);
  const board = upkeepBoard({ sched: fixture, state: { chores: { thursday: { last: '2026-08-06' } } }, today: SUN });
  const rows = board.rows.filter(r => r.id === 'thursday');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, STATUS.OVERDUE);
  assert.equal(rows[0].dueDate, THU); // the current occurrence, not the missed one
});

test('completing a weekly chore early still satisfies the current occurrence', async () => {
  const { choreState, STATUS } = await import(CHORES_URL);
  const chore = fixture.chores[1];
  // Done on Saturday, asked about on Sunday: Thursday's occurrence is satisfied.
  const state = choreState({ chore, record: { last: '2026-09-12' }, today: SUN });
  assert.equal(state.status, STATUS.DONE);
});

test('a monthly chore is due only after thirty days', async () => {
  const { choreState, STATUS } = await import(CHORES_URL);
  const chore = fixture.chores[2];
  assert.equal(choreState({ chore, record: {}, today: MON }).status, STATUS.DUE);
  assert.equal(choreState({ chore, record: { last: '2026-09-01' }, today: MON }).status, STATUS.DONE);
  const late = choreState({ chore, record: { last: '2026-07-01' }, today: MON });
  assert.equal(late.status, STATUS.OVERDUE);
  assert.equal(late.overdueDays, 38);
});

test('an as-needed chore is available but never late', async () => {
  const { choreState, STATUS } = await import(CHORES_URL);
  const state = choreState({ chore: fixture.chores[3], record: {}, today: MON });
  assert.equal(state.status, STATUS.ANYTIME);
  assert.equal(state.overdueDays, 0);
  assert.equal(state.dueDate, null);
});

test('moving a chore defers it without touching anything external', async () => {
  const { choreState, STATUS } = await import(CHORES_URL);
  const chore = fixture.chores[0];
  const moved = choreState({ chore, record: { moved: '2026-09-09' }, today: MON });
  assert.equal(moved.status, STATUS.UPCOMING);
  assert.equal(moved.dueDate, '2026-09-09');
  // ...and it comes back on the day it was moved to.
  assert.equal(choreState({ chore, record: { moved: '2026-09-09' }, today: '2026-09-09' }).status, STATUS.DUE);
});

test('active effort excludes machine waiting time', async () => {
  const { choreCatalogue } = await import(CHORES_URL);
  const staged = choreCatalogue(fixture).find(c => c.id === 'staged');
  assert.equal(staged.activeMin, 35); // 10 sort + 25 fold
  assert.equal(staged.waitMin, 60);   // the wash, which is not effort
});

test('a running stage reports an estimate and never completes itself', async () => {
  const { stagePlan } = await import(CHORES_URL);
  const chore = fixture.chores[4];
  const startedAt = Date.parse('2026-09-13T13:55:00-04:00');
  const plan = stagePlan({ chore, record: { stage: { id: 'wash', startedAt } }, nowTs: startedAt + 10 * 60000 });
  assert.equal(plan.current.id, 'wash');
  assert.equal(plan.stages[0].state, 'complete');
  assert.equal(plan.stages[1].state, 'running');
  assert.equal(plan.stages[2].state, 'pending');
  assert.equal(plan.readyAt, startedAt + 60 * 60000);
  assert.equal(plan.overdueEstimate, false);

  // The estimate elapses. That is a prompt to check, not a finished stage.
  const past = stagePlan({ chore, record: { stage: { id: 'wash', startedAt } }, nowTs: startedAt + 90 * 60000 });
  assert.equal(past.overdueEstimate, true);
  assert.equal(past.current.state, 'running');
  assert.equal(past.stages[2].state, 'pending');
});

test('a fresh install is never told it is already behind', async () => {
  // The app cannot know what was cleaned before it started watching, so it must
  // not assert a backlog on day one. Occurrences due before choresStart show as
  // due now, with no "late" claim attached.
  const { upkeepBoard, choreState, STATUS } = await import(CHORES_URL);
  const fresh = upkeepBoard({ sched: fixture, state: { config: { choresStart: SUN } }, today: SUN });
  assert.equal(fresh.rows.filter(r => r.status === STATUS.OVERDUE).length, 0);
  assert.ok(fresh.rows.some(r => r.status === STATUS.DUE));

  // The weekly Thursday job fell due before adoption: due, not three days late.
  const thursday = choreState({ chore: fixture.chores[1], record: {}, today: SUN, since: SUN });
  assert.equal(thursday.status, STATUS.DUE);
  assert.equal(thursday.overdueDays, 0);

  // ...and once the app HAS been watching, lateness is reported honestly again.
  const watched = choreState({ chore: fixture.chores[1], record: {}, today: SUN, since: '2026-08-01' });
  assert.equal(watched.status, STATUS.OVERDUE);
  assert.equal(watched.overdueDays, 3);
});

test('the production catalogue reports no backlog on its first day', async () => {
  const { upkeepBoard, STATUS } = await import(CHORES_URL);
  const board = upkeepBoard({ sched: schedule, state: { config: { choresStart: MON } }, today: MON });
  assert.equal(board.rows.filter(r => r.status === STATUS.OVERDUE).length, 0);
});

test('the board orders overdue first and totals only outstanding effort', async () => {
  const { upkeepBoard, STATUS } = await import(CHORES_URL);
  const board = upkeepBoard({
    sched: fixture,
    // Completed *today*. Completing a daily chore six days ago would leave it
    // due again, which is the whole point of a daily cadence.
    state: { chores: { daily: { last: SUN }, thursday: { last: '2026-08-06' } } },
    today: SUN,
  });
  assert.equal(board.rows[0].status, STATUS.OVERDUE);
  assert.equal(board.rows.at(-1).status, STATUS.DONE);
  // daily is done today, so its 8 minutes are not counted as outstanding.
  assert.equal(board.rows.find(r => r.id === 'daily').status, STATUS.DONE);
  assert.ok(!board.rows.filter(r => ['overdue', 'due'].includes(r.status)).some(r => r.id === 'daily'));
  assert.ok(board.activeMinDue > 0);
  assert.equal(board.outstanding, board.rows.filter(r => ['overdue', 'due'].includes(r.status)).length);
});

test('completing clears steps and any running stage', async () => {
  const { completePatch } = await import(CHORES_URL);
  const patch = completePatch(MON);
  assert.equal(patch.last, MON);
  assert.deepEqual(patch.steps, {});
  assert.equal(patch.stage, null);
  assert.equal(patch.moved, null);
});

test('date maths steps calendar days, not fixed 24-hour spans', async () => {
  const { addDays, daysBetween, dayOfWeek } = await import(CHORES_URL);
  // Toronto leaves DST on 2026-11-01. A 24-hour step would land on the wrong day.
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
  assert.equal(dayOfWeek(SUN), 0);
  assert.equal(dayOfWeek(THU), 4);
});

test('the production catalogue is well formed and scores nothing', async () => {
  const { upkeepBoard } = await import(CHORES_URL);
  const board = upkeepBoard({ sched: schedule, state: {}, today: MON });
  assert.ok(board.rows.length >= 10);
  for (const row of board.rows) {
    assert.ok(row.id && row.title, 'every chore needs an id and title');
    assert.ok(row.steps.length || row.stages.length, `${row.id} needs steps or stages`);
    assert.equal(typeof row.activeMin, 'number');
    assert.ok(!('delta' in row) && !('points' in row), `${row.id} must carry no score`);
  }
});

test('chores never reach the scoring engine', async () => {
  // The guarantee in plan section 8.10, asserted rather than assumed: adding a
  // pile of overdue chores must not move the day verdict, the delta, or the balance.
  const rules = await import(RULES_URL);
  const day = { anchor: true, log: { anchor: Date.parse('2026-09-07T06:30:00-04:00') } };
  const base = rules.evaluateDay({ sched: schedule, dayKind: 'office', day, dateStr: MON, nowMin: null, isDayOff: false });

  const withChores = { ...JSON.parse(JSON.stringify(schedule)) };
  const state = { chores: Object.fromEntries(schedule.chores.map(c => [c.id, { last: '2025-01-01' }])) };
  const after = rules.evaluateDay({ sched: withChores, dayKind: 'office', day, dateStr: MON, nowMin: null, isDayOff: false });

  assert.equal(after.verdict, base.verdict);
  assert.equal(after.delta, base.delta);
  assert.equal(rules.balance({ sched: schedule, state: { ...state, config: {} }, today: MON }).total, 0);
});

test('getready is one scored item per day, not several', async () => {
  const rules = await import(RULES_URL);
  rules.assertSchedule(schedule);
  for (const kind of ['office', 'wfh', 'sat', 'sun']) {
    const morning = rules.blocksFor(schedule, kind).find(b => b.id === 'morning');
    assert.ok(morning.keys.includes('getready'), `${kind} morning is missing getready`);
    assert.equal(morning.keys.filter(k => k === 'getready').length, 1);
    const time = schedule.tapPlan.itemTimes[kind].getready;
    const [h, m] = time.split(':').map(Number);
    const at = h * 60 + m;
    assert.ok(at >= morning.startMin && at <= morning.endMin, `${kind} getready time sits outside Morning`);
  }
  assert.equal(schedule.tapPlan.steps.getready.length, 4);
});
