import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PLAN_URL = new URL('../day-plan.mjs', import.meta.url);
const schedule = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));

const base = (overrides = {}) => ({
  sched: schedule,
  state: { config: { choresStart: '2026-09-06', windowsStart: '2026-09-06' } },
  today: '2026-09-06',
  dayKind: 'sun',
  nowMin: 14 * 60 + 10,
  nowTs: Date.parse('2026-09-06T14:10:00-04:00'),
  ...overrides,
});

test('current routine with unfinished items is the action to do now', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  const plan = buildDayPlan(base({ nowMin: 15 * 60, nowTs: Date.parse('2026-09-06T15:00:00-04:00') }));
  assert.equal(plan.now.source, 'routine');
  assert.equal(plan.now.title, 'Afternoon');
  assert.ok(plan.now.remainingKeys.includes('study'));
});

test('chosen outcome is offered only when it fits before the next routine', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  const state = {
    config: { choresStart: '2026-09-04', windowsStart: '2026-09-04' },
    checkIns: { '2026-09-04': { firstStep: 'Finish one practice exercise', focusMinutes: 25 } },
  };
  const tooShort = buildDayPlan(base({
    state, today: '2026-09-04', dayKind: 'wfh', nowMin: 18 * 60 + 40,
    nowTs: Date.parse('2026-09-04T18:40:00-04:00'),
  }));
  assert.notEqual(tooShort.now?.source, 'outcome');
  assert.equal(tooShort.next.title, 'Evening');

  const fits = buildDayPlan(base({
    state, today: '2026-09-04', dayKind: 'wfh', nowMin: 20 * 60 + 25,
    nowTs: Date.parse('2026-09-04T20:20:00-04:00'),
  }));
  assert.equal(fits.now.source, 'outcome');
  assert.equal(fits.now.title, 'Finish one practice exercise');
  assert.equal(fits.now.activeMin, 25);
});

test('Now and adjustment protect work, commuting and sleep', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  for (const minute of [300, 520, 600, 1025, 1390]) {
    const plan = buildDayPlan(base({today:'2026-09-08',dayKind:'office',nowMin:minute,
      state:{config:{choresStart:'2026-09-08'},checkIns:{'2026-09-08':{firstStep:'Practice'}}}}));
    assert.equal(plan.now,null,`protected minute ${minute}`);
    for (const row of plan.adjustment.scheduled) {
      assert.ok(row.startMin>=375 && row.endMin<=1380);
      assert.ok(!((row.startMin<735 && row.endMin>520)||(row.startMin<1040 && row.endMin>795)),
        'no personal work during work or commute');
    }
  }
});

test('declared lunch remains actionable and transition gaps are reserved', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  assert.equal(buildDayPlan(base({dayKind:'office',nowMin:750})).now?.blockId,'midday');
  const state={checkIns:{'2026-09-06':{firstStep:'Practice',focusMinutes:25}}};
  assert.notEqual(buildDayPlan(base({state,dayKind:'wfh',nowMin:1220})).now?.source,'outcome');
});

test('running laundry is background and exposes its estimated handoff', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  const startedAt = Date.parse('2026-09-06T13:55:00-04:00');
  const state = {
    config: { choresStart: '2026-09-06', windowsStart: '2026-09-06' },
    chores: { laundry: { stage: { id: 'wash', startedAt, occurrence: '2026-09-06', done: ['sort'] } } },
  };
  const plan = buildDayPlan(base({ state }));
  assert.equal(plan.background.length, 1);
  assert.equal(plan.background[0].title, 'Wash cycle');
  assert.equal(plan.background[0].readyAt, Date.parse('2026-09-06T14:55:00-04:00'));
  assert.equal(plan.background[0].autoCompletes, false);
  assert.equal(plan.next.title, 'Afternoon');
});

test('elapsed machine estimate becomes the immediate check action', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  const startedAt = Date.parse('2026-09-06T13:55:00-04:00');
  const state = {
    config: { choresStart: '2026-09-06', windowsStart: '2026-09-06' },
    chores: { laundry: { stage: { id: 'wash', startedAt, occurrence: '2026-09-06', done: ['sort'] } } },
  };
  const plan = buildDayPlan(base({
    state, nowMin: 14 * 60 + 56, nowTs: Date.parse('2026-09-06T14:56:00-04:00'),
  }));
  assert.equal(plan.now.source, 'handoff');
  assert.equal(plan.now.title, 'Check Wash cycle');
  assert.equal(plan.now.choreId, 'laundry');
});

test('planner reports remaining active effort without counting machine wait', async () => {
  const { buildDayPlan } = await import(PLAN_URL);
  const plan = buildDayPlan(base());
  assert.equal(plan.remainingActiveMin, plan.dueChores.reduce((n, c) => n + c.activeMin, 0));
  assert.ok(plan.remainingActiveMin > 0);
  assert.ok(plan.background.every(item => item.activeMin === 0));
});

test('adjustment preview fits flexible work around fixed intervals with transitions', async () => {
  const { previewAdjustment } = await import(PLAN_URL);
  const preview = previewAdjustment({
    nowMin: 8 * 60,
    endMin: 10 * 60,
    transitionMin: 10,
    fixed: [{ id: 'meeting', title: 'Meeting', startMin: 8 * 60 + 30, endMin: 9 * 60 }],
    flexible: [
      { id: 'focus', title: 'Practice', activeMin: 25, preferredStart: 8 * 60 },
      { id: 'reset', title: 'Reset room', activeMin: 15, preferredStart: 8 * 60 },
    ],
  });
  assert.deepEqual(preview.scheduled.map(x => [x.id, x.startMin, x.endMin]), [
    ['reset', 8 * 60, 8 * 60 + 15],
    ['focus', 9 * 60 + 10, 9 * 60 + 35],
  ]);
  assert.deepEqual(preview.unscheduled, []);
});

test('adjustment preview explains work that cannot fit instead of compressing it', async () => {
  const { previewAdjustment } = await import(PLAN_URL);
  const preview = previewAdjustment({
    nowMin: 20 * 60,
    endMin: 21 * 60,
    fixed: [{ id: 'wind', title: 'Wind-down', startMin: 20 * 60 + 20, endMin: 21 * 60 }],
    flexible: [{ id: 'focus', title: 'Practice', activeMin: 25, preferredStart: 20 * 60 }],
  });
  assert.equal(preview.scheduled.length, 0);
  assert.deepEqual(preview.unscheduled, [{ id: 'focus', title: 'Practice', reason: 'No 25-minute opening before 21:00' }]);
});

test('passive background work never consumes an active scheduling slot', async () => {
  const { previewAdjustment } = await import(PLAN_URL);
  const preview = previewAdjustment({
    nowMin: 14 * 60,
    endMin: 15 * 60,
    background: [{ id: 'washer', startMin: 14 * 60, endMin: 15 * 60 }],
    flexible: [{ id: 'read', title: 'Read', activeMin: 20, preferredStart: 14 * 60 }],
  });
  assert.deepEqual(preview.scheduled.map(x => [x.startMin, x.endMin]), [[14 * 60, 14 * 60 + 20]]);
});
