import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDatapoint, reportableDates } from '../scripts/stakes.mjs';

test('passed and day-off verdicts post one with a deterministic request id', () => {
  assert.deepEqual(makeDatapoint('2026-09-07', { verdict: 'passed', blocks: [] }), {
    daystamp: '20260907', value: 1, comment: 'FLOWSTATE: passed', requestid: 'flowstate-2026-09-07',
  });
  assert.equal(makeDatapoint('2026-09-07', { verdict: 'off', blocks: [] }).value, 1);
});

test('a failed verdict posts zero and names failed blocks', () => {
  const point=makeDatapoint('2026-09-07', { verdict: 'failed', blocks: [{ title: 'Gym', state: 'failed' }, { title: 'Deep work', state: 'failed' }] });
  assert.equal(point.value, 0);
  assert.equal(point.comment, 'FLOWSTATE: failed - Gym, Deep work');
});

test('backfill covers the seven complete days before today', () => {
  assert.deepEqual(reportableDates('2026-09-07', 7), ['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06']);
});
