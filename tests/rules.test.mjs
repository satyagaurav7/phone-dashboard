import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const RULES_URL = new URL('../rules.mjs', import.meta.url);

const sched = {
  dayKinds: ['sun', 'office', 'office', 'wfh', 'wfh', 'wfh', 'sat'],
  tapPlan: {
    itemTimes: { office: { a: '09:05', b: '10:05' }, wfh: { gym: '09:00', fuel: '09:00' } },
    blocks: {
      office: [
        { id: 'one', title: 'One', start: '09:00', end: '10:00', keys: ['a'] },
        { id: 'two', title: 'Two', start: '10:00', end: '11:00', keys: ['b'] },
      ],
      wfh: [
        { id: 'gym', title: 'Gym', start: '07:00', end: '10:00', keys: ['gym'] },
        { id: 'fuel', title: 'Fuel', start: '08:30', end: '09:30', keys: ['fuel'] },
      ],
    },
  },
};

const at = (date, time) => new Date(`${date}T${time}:00-04:00`).getTime();

test('scores an item logged inside its window', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const result = evaluateDay({ sched, dayKind: 'office', day: { a: true, log: { a: at('2026-09-07', '09:30') } }, dateStr: '2026-09-07', nowMin: 570, isDayOff: false });
  assert.equal(result.blocks[0].items[0].state, 'inWindow');
  assert.equal(result.delta, 2);
});

test('late logging gives one point and does not rescue a failed block', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const result = evaluateDay({ sched, dayKind: 'office', day: { a: true, log: { a: at('2026-09-07', '10:30') } }, dateStr: '2026-09-07', nowMin: 600, isDayOff: false });
  assert.equal(result.blocks[0].items[0].state, 'late');
  assert.equal(result.blocks[0].state, 'failed');
  assert.equal(result.delta, -7);
});

test('an incomplete open block contributes nothing', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const result = evaluateDay({ sched, dayKind: 'office', day: {}, dateStr: '2026-09-07', nowMin: 570, isDayOff: false });
  assert.equal(result.blocks[0].state, 'open');
  assert.equal(result.blocks[0].items[0].state, 'pending');
  assert.equal(result.delta, 0);
});

test('legacy wall-clock strings remain readable as late logs', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const result=evaluateDay({sched,dayKind:'office',day:{a:true,log:{a:'09:30'}},dateStr:'2026-09-07',nowMin:null,isDayOff:false});
  assert.equal(result.blocks[0].items[0].state,'late');
});

test('a clean day applies item, block, and day-clean points', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const day = { a: true, b: true, log: { a: at('2026-09-07', '09:30'), b: at('2026-09-07', '10:30') } };
  const result = evaluateDay({ sched, dayKind: 'office', day, dateStr: '2026-09-07', nowMin: null, isDayOff: false });
  assert.deepEqual(result.blocks.map(block => block.state), ['passed', 'passed']);
  assert.equal(result.verdict, 'passed');
  assert.equal(result.delta, 34);
});

test('one missed block fails a day even when every other block is clean', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const day = { a: true, log: { a: at('2026-09-07', '09:30') } };
  const result = evaluateDay({ sched, dayKind: 'office', day, dateStr: '2026-09-07', nowMin: null, isDayOff: false });
  assert.equal(result.verdict, 'failed');
});

test('a day off has no score and emits no edges', async () => {
  const { evaluateDay, dueEdges } = await import(RULES_URL);
  const result = evaluateDay({ sched, dayKind: 'office', day: {}, dateStr: '2026-09-07', nowMin: null, isDayOff: true });
  assert.equal(result.verdict, 'off');
  assert.equal(result.delta, 0);
  assert.deepEqual(dueEdges({ sched, dayKind: 'office', day: {}, dateStr: '2026-09-07', prevMin: 0, nowMin: 1440, isDayOff: true }), []);
});

test('balance excludes dates before windowsStart', async () => {
  const { balance } = await import(RULES_URL);
  const state = { config: { windowsStart: '2026-09-07' }, days: { '2026-09-06': {}, '2026-09-07': {} }, dayOff: {} };
  const result = balance({ sched, state, today: '2026-09-07' });
  assert.deepEqual(Object.keys(result.states), ['2026-09-07']);
});

test('blackout begins below negative fifty', async () => {
  const { tierForBalance } = await import(RULES_URL);
  assert.equal(tierForBalance(-50), 'debt');
  assert.equal(tierForBalance(-51), 'blackout');
});

test('overlapping blocks evaluate independently', async () => {
  const { evaluateDay } = await import(RULES_URL);
  const day = { gym: true, log: { gym: at('2026-09-07', '09:00') } };
  const result = evaluateDay({ sched, dayKind: 'wfh', day, dateStr: '2026-09-07', nowMin: 600, isDayOff: false });
  assert.equal(result.blocks.find(block => block.id === 'gym').state, 'passed');
  assert.equal(result.blocks.find(block => block.id === 'fuel').state, 'failed');
});

test('dueEdges uses an exclusive lower and inclusive upper bound', async () => {
  const { dueEdges } = await import(RULES_URL);
  const args = { sched, dayKind: 'office', day: {}, dateStr: '2026-09-07', isDayOff: false };
  assert.deepEqual(dueEdges({ ...args, prevMin: 524, nowMin: 540 }).map(edge => edge.kind), ['open']);
  assert.deepEqual(dueEdges({ ...args, prevMin: 540, nowMin: 585 }).map(edge => edge.kind), ['warn']);
  assert.deepEqual(dueEdges({ ...args, prevMin: 585, nowMin: 600 }).map(edge => edge.kind), ['close', 'open']);
});

test('schedule assertions reject missing and duplicate keys', async () => {
  const { assertSchedule } = await import(RULES_URL);
  const missing = structuredClone(sched);
  missing.tapPlan.blocks.office[1].keys = [];
  assert.throws(() => assertSchedule(missing), /b.*office|office.*b/i);
  const duplicate = structuredClone(sched);
  duplicate.tapPlan.blocks.office[1].keys = ['a', 'b'];
  assert.throws(() => assertSchedule(duplicate), /a.*office|office.*a/i);
});

test('the fifth day off in a rolling 28-day window is refused with the next date', async () => {
  const { canDeclareDayOff } = await import(RULES_URL);
  const dayOff = Object.fromEntries(['2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01'].map(date => [date, { declaredAt: 1 }]));
  assert.deepEqual(canDeclareDayOff({ dayOff, dateStr: '2026-09-07' }), { allowed: false, nextAvailableDate: '2026-09-08' });
});

test('the production schedule assigns every timed item to exactly one valid block', async () => {
  const { assertSchedule, blocksFor } = await import(RULES_URL);
  const production = JSON.parse(await readFile(new URL('../schedule.json', import.meta.url), 'utf8'));
  assert.equal(assertSchedule(production), true);
  for (const kind of ['office', 'wfh', 'sat', 'sun']) assert.equal(blocksFor(production, kind).length, 7);
});
