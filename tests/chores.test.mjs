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
  const record = { stage: { id: 'wash', startedAt, occurrence: SUN, done: ['sort'] } };
  const plan = stagePlan({ chore, record, nowTs: startedAt + 10 * 60000, occurrence: SUN });
  assert.equal(plan.current.id, 'wash');
  assert.equal(plan.stages[0].state, 'complete', 'sort was recorded done, so it reads done');
  assert.equal(plan.stages[1].state, 'running');
  assert.equal(plan.stages[2].state, 'pending');
  assert.equal(plan.readyAt, startedAt + 60 * 60000);
  assert.equal(plan.overdueEstimate, false);

  // The estimate elapses. That is a prompt to check, not a finished stage.
  const past = stagePlan({ chore, record, nowTs: startedAt + 90 * 60000, occurrence: SUN });
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

test('the production catalogue is well formed and carries no inline score', async () => {
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

test('a chore done on its due day earns, and late still earns something', async () => {
  const { choreLedger, CHORE_POINTS } = await import(CHORES_URL);
  const state = { config: { choresStart: THU }, chores: { thursday: { done: { [THU]: true } } } };
  const led = choreLedger({ sched: { chores: [fixture.chores[1]] }, state, today: THU });
  assert.equal(led.total, CHORE_POINTS.onTime);

  const lateState = { config: { choresStart: THU }, chores: { thursday: { done: { '2026-09-11': true } } } };
  const late = choreLedger({ sched: { chores: [fixture.chores[1]] }, state: lateState, today: '2026-09-11' });
  // -5 for Thursday spent outstanding, then +1 for finishing it on Friday.
  assert.equal(late.total, CHORE_POINTS.outstandingPerDay + CHORE_POINTS.late);
});

test('an outstanding chore is charged every day it stays undone', async () => {
  const { choreLedger, CHORE_POINTS } = await import(CHORES_URL);
  const state = { config: { choresStart: THU }, chores: {} };
  // Thursday due, never done; asked on Sunday. Thu/Fri/Sat are complete days
  // and charge; Sunday is still in progress and does not.
  const led = choreLedger({ sched: { chores: [fixture.chores[1]] }, state, today: SUN });
  assert.equal(led.total, 3 * CHORE_POINTS.outstandingPerDay);
  assert.equal(led.pendingToday, CHORE_POINTS.outstandingPerDay);
  assert.deepEqual(led.outstandingToday, ['Weekly job']);
});

test('today is never charged before it is over', async () => {
  const { choreLedger } = await import(CHORES_URL);
  const state = { config: { choresStart: MON }, chores: {} };
  const led = choreLedger({ sched: { chores: [fixture.chores[0]] }, state, today: MON });
  assert.equal(led.total, 0, 'a chore due today costs nothing yet');
  assert.ok(led.pendingToday < 0, 'but the exposure is reported');
});

test('a daily chore charges for each skipped day', async () => {
  const { choreLedger, CHORE_POINTS } = await import(CHORES_URL);
  const state = { config: { choresStart: '2026-09-07' }, chores: {} };
  const led = choreLedger({ sched: { chores: [fixture.chores[0]] }, state, today: '2026-09-10' });
  assert.equal(led.total, 3 * CHORE_POINTS.outstandingPerDay); // 07, 08, 09
});

test('a moved chore is not charged before the day it was moved to', async () => {
  const { choreLedger } = await import(CHORES_URL);
  const sched = { chores: [fixture.chores[0]] };
  // movedAt is required: a deferral covers days from when it was requested,
  // not every day in the record's past. See the regression test below.
  const state = { config: { choresStart: MON }, chores: { daily: { moved: '2026-09-10', movedAt: MON } } };
  const led = choreLedger({ sched, state, today: '2026-09-09' });
  assert.equal(led.total, 0);
  assert.equal(led.pendingToday, 0);
});

test('nothing is charged for days before the app was adopted', async () => {
  const { choreLedger } = await import(CHORES_URL);
  const state = { config: { choresStart: SUN }, chores: {} };
  const led = choreLedger({ sched: fixture, state, today: SUN });
  assert.equal(led.total, 0);
});

test('an as-needed chore can never be missed', async () => {
  const { choreLedger } = await import(CHORES_URL);
  const state = { config: { choresStart: MON }, chores: {} };
  const led = choreLedger({ sched: { chores: [fixture.chores[3]] }, state, today: SUN });
  assert.equal(led.total, 0);
  assert.equal(led.pendingToday, 0);
});

test('chores move the balance but NEVER the day verdict or the stake', async () => {
  // The boundary that keeps a missed bin from costing real money: stakes.mjs
  // posts on evaluateDay's verdict, which must not move when chores are missed.
  const rules = await import(RULES_URL);
  const { choreLedger } = await import(CHORES_URL);
  const day = { anchor: true, log: { anchor: Date.parse('2026-09-07T06:30:00-04:00') } };
  const args = { sched: schedule, dayKind: 'office', day, dateStr: MON, nowMin: null, isDayOff: false };
  const verdictBefore = rules.evaluateDay(args);

  const neglected = { config: { choresStart: '2026-08-01' }, chores: {} };
  const led = choreLedger({ sched: schedule, state: neglected, today: MON });
  assert.ok(led.total < -100, 'a month of neglect genuinely hurts the balance');

  const verdictAfter = rules.evaluateDay(args);
  assert.equal(verdictAfter.verdict, verdictBefore.verdict);
  assert.equal(verdictAfter.delta, verdictBefore.delta);
  assert.equal(rules.balance({ sched: schedule, state: neglected, today: MON }).total, 0,
    'the scoring engine cannot see chores at all');
});

test('completing accumulates history rather than overwriting it', async () => {
  const { completePatch } = await import(CHORES_URL);
  const first = completePatch(THU, {});
  const second = completePatch(SUN, first);
  assert.deepEqual(second.done, { [THU]: true, [SUN]: true });
  assert.equal(second.last, SUN);
});

test('moving a chore cannot erase penalties already assessed', async () => {
  // Regression. `moved` alone used to be applied to every past date, so a chore
  // three days overdue at -15 dropped to 0 the instant "Move to tomorrow" was
  // pressed — turning the button into an eraser for the whole mechanic.
  const { choreLedger, CHORE_POINTS } = await import(CHORES_URL);
  const sched = { chores: [{ id: 'x', title: 'X', cadence: { mode: 'weekly', dow: 0 }, activeMin: 10, steps: ['a'] }] };
  const base = { config: { choresStart: '2026-09-06' }, chores: {} };
  const before = choreLedger({ sched, state: base, today: '2026-09-09' }).total;
  assert.equal(before, 3 * CHORE_POINTS.outstandingPerDay);

  const moved = {
    config: { choresStart: '2026-09-06' },
    chores: { x: { moved: '2026-09-10', movedAt: '2026-09-09' } },
  };
  assert.equal(choreLedger({ sched, state: moved, today: '2026-09-09' }).total, before,
    'history is untouched by a deferral made today');

  // The deferral does suppress the days it actually covers, going forward.
  const later = { config: { choresStart: '2026-09-06' }, chores: { x: { moved: '2026-09-12', movedAt: '2026-09-09' } } };
  assert.equal(choreLedger({ sched, state: later, today: '2026-09-11' }).total, before,
    'the deferred days 09/09-09/11 add no further charge');
});

test('a legacy move record forgives nothing retroactively', async () => {
  const { choreLedger, CHORE_POINTS } = await import(CHORES_URL);
  const sched = { chores: [{ id: 'x', title: 'X', cadence: { mode: 'weekly', dow: 0 }, activeMin: 10, steps: ['a'] }] };
  // Written before movedAt existed: it must not silently wipe assessed charges.
  const legacy = { config: { choresStart: '2026-09-06' }, chores: { x: { moved: '2026-09-10' } } };
  assert.equal(choreLedger({ sched, state: legacy, today: '2026-09-09' }).total, 3 * CHORE_POINTS.outstandingPerDay);
});

test("yesterday's ticked steps do not carry into today's occurrence", async () => {
  const { upkeepBoard } = await import(CHORES_URL);
  const sched = { chores: [{ id: 'y', title: 'Y', cadence: { mode: 'daily' }, activeMin: 5, steps: ['a', 'b'] }] };
  const stale = { config: { choresStart: '2026-09-06' }, chores: { y: { steps: { 0: true }, stepsOccurrence: '2026-09-08' } } };
  assert.deepEqual(upkeepBoard({ sched, state: stale, today: '2026-09-09' }).rows[0].stepsDone, {},
    'a new day starts with an empty checklist');

  const current = { config: { choresStart: '2026-09-06' }, chores: { y: { steps: { 0: true }, stepsOccurrence: '2026-09-09' } } };
  assert.deepEqual(upkeepBoard({ sched, state: current, today: '2026-09-09' }).rows[0].stepsDone, { 0: true },
    "today's own progress is kept");
});

test('every suggested tap time falls inside the window that scores it', async () => {
  // The app must never display a time and then punish following it.
  const rules = await import(RULES_URL);
  rules.assertSchedule(schedule);
  for (const kind of ['office', 'wfh', 'sat', 'sun']) {
    for (const block of rules.blocksFor(schedule, kind)) {
      for (const key of block.keys) {
        const [h, m] = schedule.tapPlan.itemTimes[kind][key].split(':').map(Number);
        const at = h * 60 + m;
        assert.ok(at >= block.startMin && at <= block.endMin,
          `${kind} ${key} suggested outside ${block.id}`);
      }
    }
  }
});

test('a drifted schedule is rejected rather than shipped', async () => {
  const rules = await import(RULES_URL);
  const broken = JSON.parse(JSON.stringify(schedule));
  broken.tapPlan.itemTimes.office.dinner = '19:40'; // before Evening opens
  assert.throws(() => rules.assertSchedule(broken), /dinner is suggested at 19:40/);
});

test('a stage started last week does not look live this week', async () => {
  const { stagePlan } = await import(CHORES_URL);
  const chore = fixture.chores[4];
  const record = { stage: { id: 'wash', startedAt: Date.now(), occurrence: '2026-09-06' } };
  const stale = stagePlan({ chore, record, nowTs: Date.now(), occurrence: '2026-09-13' });
  assert.equal(stale.current, null, "last week's load is not still running");
  const live = stagePlan({ chore, record, nowTs: Date.now(), occurrence: '2026-09-06' });
  assert.equal(live.current.id, 'wash');
});

test('jumping to a later stage marks the skipped ones skipped, not done', async () => {
  // Starting the dryer used to silently assert that sorting and washing had
  // happened. It says "skipped" now, because the app did not see them happen.
  const { stagePlan, startStagePatch } = await import(CHORES_URL);
  const chore = fixture.chores[4];
  const patch = startStagePatch({ chore, record: {}, stageId: 'fold', occurrence: '2026-09-13', nowTs: 1 });
  const plan = stagePlan({ chore, record: patch, nowTs: 2, occurrence: '2026-09-13' });
  assert.equal(plan.stages[0].state, 'skipped');
  assert.equal(plan.stages[1].state, 'skipped');
  assert.equal(plan.stages[2].state, 'running');
});

test('working through stages in order records them as genuinely complete', async () => {
  const { stagePlan, startStagePatch } = await import(CHORES_URL);
  const chore = fixture.chores[4];
  let record = startStagePatch({ chore, record: {}, stageId: 'sort', occurrence: '2026-09-13', nowTs: 1 });
  record = startStagePatch({ chore, record, stageId: 'wash', occurrence: '2026-09-13', nowTs: 2 });
  record = startStagePatch({ chore, record, stageId: 'fold', occurrence: '2026-09-13', nowTs: 3 });
  const plan = stagePlan({ chore, record, nowTs: 4, occurrence: '2026-09-13' });
  assert.equal(plan.stages[0].state, 'complete');
  assert.equal(plan.stages[1].state, 'complete');
  assert.equal(plan.stages[2].state, 'running');
});

test('undo removes only today and restores the previous completion', async () => {
  const { undoCompletePatch, completePatch } = await import(CHORES_URL);
  const after = completePatch(SUN, { done: { [THU]: true } });
  const undone = undoCompletePatch(SUN, after);
  assert.deepEqual(undone.done, { [THU]: true });
  assert.equal(undone.last, THU, 'the earlier completion is not lost');
  assert.equal(undoCompletePatch(THU, { done: { [THU]: true } }).last, null);
});

test('undo actually returns the points the completion earned', async () => {
  const { choreLedger, completePatch, undoCompletePatch } = await import(CHORES_URL);
  const sched = { chores: [fixture.chores[0]] };
  const base = { config: { choresStart: MON } };
  const done = { ...base, chores: { daily: completePatch(MON, {}) } };
  const withPoints = choreLedger({ sched, state: done, today: MON }).total;
  const undone = { ...base, chores: { daily: undoCompletePatch(MON, done.chores.daily) } };
  assert.equal(choreLedger({ sched, state: undone, today: MON }).total, 0);
  assert.ok(withPoints > 0);
});
