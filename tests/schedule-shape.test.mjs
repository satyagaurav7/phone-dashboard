import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RULES_URL = new URL('../rules.mjs', import.meta.url);
const schedule = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
const KINDS = ['office', 'wfh', 'sat', 'sun'];

/* Phase 1. The office evening was arithmetically impossible — 345 minutes of
 * blocks against 340 that existed — and nothing in the code could say so. These
 * tests give the schedule a declared shape (wake, sleep, work) and make the
 * mismatch detectable instead of something a person has to notice. */

test('every day kind declares a shape the blocks can be checked against', async () => {
  const { dayShape } = await import(RULES_URL);
  for (const kind of KINDS) {
    const shape = dayShape(schedule, kind);
    assert.ok(shape, `${kind} has no dayShape`);
    assert.ok(shape.wakeMin < shape.sleepMin, `${kind}: wake must precede sleep`);
    assert.equal(typeof shape.commuteMin, 'number');
  }
  const office = dayShape(schedule, 'office');
  assert.equal(office.workStartMin, 9 * 60);
  assert.equal(office.workEndMin, 17 * 60);
  assert.equal(office.sleepMin, 23 * 60, 'confirmed target: asleep by 23:00');
  assert.ok(office.commuteMin <= 20, 'confirmed: under 20 minutes each way');
});

test('no block may end after the sleep target', async () => {
  // This is a throw, not a report: a block that runs past bedtime is the exact
  // defect that shipped, and it must never reach the phone again.
  const { assertSchedule, blocksFor, dayShape } = await import(RULES_URL);
  assertSchedule(schedule);
  for (const kind of KINDS) {
    const { sleepMin } = dayShape(schedule, kind);
    for (const block of blocksFor(schedule, kind)) {
      assert.ok(block.endMin <= sleepMin,
        `${kind}: ${block.id} ends ${block.endMin} after sleep ${sleepMin}`);
    }
  }
});

test('a schedule that overruns bedtime is rejected', async () => {
  const { assertSchedule } = await import(RULES_URL);
  const broken = JSON.parse(JSON.stringify(schedule));
  const wind = broken.tapPlan.blocks.office.find(b => b.id === 'wind-down');
  wind.end = '23:30';
  broken.tapPlan.itemTimes.office.phonedown = '23:20';
  assert.throws(() => assertSchedule(broken), /after the sleep target|sleep/i);
});

test('capacity is measured against real free time, not the whole day', async () => {
  const { dayCapacity } = await import(RULES_URL);
  const office = dayCapacity(schedule, 'office');
  // 06:15-23:00 is 1005 min; minus 8h work and 2x20 commute leaves 485.
  assert.equal(office.availableMin, 485);
  assert.ok(office.scheduledMin > 0);
  assert.ok(office.feasible, 'the office day must fit after the 2.5h gym change');
  assert.ok(office.slackMin >= 60,
    `office day should hold real slack, got ${office.slackMin}`);
});

test('the impossible office evening would now be caught', async () => {
  const { dayCapacity } = await import(RULES_URL);
  // Reconstruct the shipped-and-broken shape: 3h gym pushing wind-down to 23:15.
  const broken = JSON.parse(JSON.stringify(schedule));
  const b = broken.tapPlan.blocks.office;
  Object.assign(b.find(x => x.id === 'gym'), { start: '17:30', end: '20:30' });
  Object.assign(b.find(x => x.id === 'evening'), { start: '20:30', end: '21:45' });
  Object.assign(b.find(x => x.id === 'deep-work'), { start: '21:45', end: '22:30' });
  Object.assign(b.find(x => x.id === 'wind-down'), { start: '22:30', end: '23:15' });
  const cap = dayCapacity(broken, 'office');
  assert.ok(cap.scheduledMin > dayCapacity(schedule, 'office').scheduledMin,
    'the old shape scheduled more than the new one');
});

test('deep work sits in the morning, before the commute', async () => {
  const { blocksFor, dayShape } = await import(RULES_URL);
  const deep = blocksFor(schedule, 'office').find(b => b.id === 'deep-work');
  const { workStartMin, commuteMin } = dayShape(schedule, 'office');
  assert.ok(deep.endMin <= workStartMin - commuteMin,
    'deep work must finish with time to leave for work');
  assert.deepEqual(deep.keys.sort(), ['money', 'study']);
});

test('the office gym window is two and a half hours', async () => {
  const { blocksFor } = await import(RULES_URL);
  const gym = blocksFor(schedule, 'office').find(b => b.id === 'gym');
  assert.equal(gym.endMin - gym.startMin, 150);
});

test('conflicts are reported rather than thrown, with a reason each', async () => {
  const { scheduleConflicts } = await import(RULES_URL);
  for (const kind of KINDS) {
    const found = scheduleConflicts(schedule, kind);
    assert.ok(Array.isArray(found));
    for (const c of found) {
      assert.ok(c.kind && c.detail, 'every conflict names itself and explains');
      assert.ok(['overlaps-work', 'over-capacity', 'no-transition'].includes(c.kind));
    }
  }
});

test('a block scheduled across working hours is reported', async () => {
  const { scheduleConflicts } = await import(RULES_URL);
  const broken = JSON.parse(JSON.stringify(schedule));
  // Gym dragged into the working day: not a declared break, so it is reported.
  const gym = broken.tapPlan.blocks.office.find(b => b.id === 'gym');
  Object.assign(gym, { start: '10:00', end: '12:30' });
  broken.tapPlan.itemTimes.office.gym = '10:30';
  const found = scheduleConflicts(broken, 'office');
  assert.ok(found.some(c => c.kind === 'overlaps-work' && c.blockId === 'gym'),
    'a non-break block inside working hours must be reported');
  // ...while the declared lunch break is not noise.
  assert.ok(!scheduleConflicts(schedule, 'office').some(c => c.blockId === 'midday'));
});

test('the office day no longer reports a capacity conflict', async () => {
  const { scheduleConflicts } = await import(RULES_URL);
  assert.equal(scheduleConflicts(schedule, 'office').filter(c => c.kind === 'over-capacity').length, 0);
});
