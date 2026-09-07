/* Home upkeep engine.
 *
 * Deliberately separate from rules.mjs. Plan section 8.10: chores stay out of
 * evaluateDay, the signed balance, blackout and the Beeminder reporter. Nothing
 * here returns a score, and nothing here is imported by the scoring path — a
 * missed chore must never be able to cost money. Keep it that way.
 *
 * The other rule this file enforces is section 8.7: one outstanding occurrence
 * per template. A weekly chore skipped for a month is one overdue job, not four.
 * That falls out of the design rather than being cleaned up afterwards, because
 * the current occurrence is *computed* from the cadence and the last completion
 * instead of being generated and accumulated.
 *
 * Date strings are YYYY-MM-DD local calendar days. They are compared and
 * stepped as calendar days on purpose: adding 24 hours breaks across a
 * daylight-saving boundary, which Toronto has twice a year.
 */

export const STATUS = Object.freeze({
  OVERDUE: 'overdue',   // was due before today and is still not done
  DUE: 'due',           // due today
  UPCOMING: 'upcoming', // scheduled, not yet due
  ANYTIME: 'anytime',   // no cadence — available, never late
  DONE: 'done',         // satisfied for its current occurrence
});

const DAY_MS = 86400000;

function toUTC(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) throw new Error(`bad date: ${dateStr}`);
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
const fromUTC = ms => new Date(ms).toISOString().slice(0, 10);
export const addDays = (dateStr, n) => fromUTC(toUTC(dateStr) + n * DAY_MS);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
export const dayOfWeek = dateStr => new Date(toUTC(dateStr)).getUTCDay(); // 0 = Sunday

export function choreCatalogue(sched) {
  return (sched?.chores || []).map(chore => ({
    ...chore,
    steps: [...(chore.steps || [])],
    stages: (chore.stages || []).map(stage => ({ ...stage })),
    // Total effort. A stage's waitMin is a machine running, not you working, so
    // it is excluded here — the whole point of separating them (section 3).
    activeMin: chore.activeMin ?? (chore.stages || []).reduce((n, s) => n + (s.activeMin || 0), 0),
    waitMin: (chore.stages || []).reduce((n, s) => n + (s.waitMin || 0), 0),
  }));
}

/* The date this chore's current occurrence became (or becomes) due, looking
 * only at the cadence. `from` is today. Returns null for `asneeded`. */
export function occurrenceDue(chore, from) {
  const cadence = chore.cadence || { mode: 'asneeded' };
  if (cadence.mode === 'daily') return from;
  if (cadence.mode === 'weekly') {
    const target = Number(cadence.dow);
    if (!Number.isInteger(target) || target < 0 || target > 6) throw new Error(`bad dow on ${chore.id}`);
    // Most recent occurrence of that weekday on or before today.
    return addDays(from, -((dayOfWeek(from) - target + 7) % 7));
  }
  if (cadence.mode === 'monthly') return from; // judged by elapsed days, below
  return null;
}

export function choreState({ chore, record = {}, today, since = null }) {
  const cadence = chore.cadence || { mode: 'asneeded' };
  const last = record.last || null;
  const moved = record.moved || null;

  // A deferred chore is genuinely not due yet. Section 8.6: moving changes the
  // preferred slot only, so this can never reach an external hard deadline.
  if (moved && moved > today) {
    return { status: STATUS.UPCOMING, dueDate: moved, overdueDays: 0, last };
  }

  if (cadence.mode === 'asneeded') {
    return { status: STATUS.ANYTIME, dueDate: null, overdueDays: 0, last };
  }

  if (cadence.mode === 'monthly') {
    const elapsed = last ? daysBetween(last, today) : Infinity;
    if (elapsed < 30) {
      return { status: STATUS.DONE, dueDate: addDays(last, 30), overdueDays: 0, last };
    }
    return {
      status: elapsed === Infinity || elapsed === 30 ? STATUS.DUE : STATUS.OVERDUE,
      dueDate: last ? addDays(last, 30) : today,
      overdueDays: Number.isFinite(elapsed) ? Math.max(0, elapsed - 30) : 0,
      last,
    };
  }

  const due = occurrenceDue(chore, today);
  // Completed on or after the day this occurrence came due => this one is done.
  if (last && last >= due) return { status: STATUS.DONE, dueDate: due, overdueDays: 0, last };
  // Nothing is "late" for a period the app was not watching. Without this, a
  // fresh install opens claiming you are four days behind on a room clean it
  // has never once observed — a confident assertion about the past built from
  // no evidence at all. Mirrors config.windowsStart in the scoring engine.
  if (since && due < since) return { status: STATUS.DUE, dueDate: today, overdueDays: 0, last };
  const overdueDays = daysBetween(due, today);
  return {
    status: overdueDays > 0 ? STATUS.OVERDUE : STATUS.DUE,
    dueDate: due,
    overdueDays,
    last,
  };
}

/* Every chore with its computed state, ordered the way the board should read:
 * overdue first, then due, then anytime, then upcoming, then done. Within a
 * group, earlier preferred window first. */
const ORDER = [STATUS.OVERDUE, STATUS.DUE, STATUS.ANYTIME, STATUS.UPCOMING, STATUS.DONE];

export function upkeepBoard({ sched, state = {}, today }) {
  const records = state.chores || {};
  const since = state.config?.choresStart || null;
  const rows = choreCatalogue(sched).map(chore => {
    const record = records[chore.id] || {};
    const computed = choreState({ chore, record, today, since });
    return {
      ...chore,
      ...computed,
      steps: chore.steps,
      stages: chore.stages,
      stepsDone: record.steps && computed.status !== STATUS.DONE ? { ...record.steps } : {},
      stage: record.stage || null,
    };
  });
  rows.sort((a, b) =>
    ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
    String(a.window || '99:99').localeCompare(String(b.window || '99:99')) ||
    a.title.localeCompare(b.title));
  return {
    rows,
    outstanding: rows.filter(r => r.status === STATUS.OVERDUE || r.status === STATUS.DUE).length,
    activeMinDue: rows
      .filter(r => r.status === STATUS.OVERDUE || r.status === STATUS.DUE)
      .reduce((n, r) => n + (r.activeMin || 0), 0),
  };
}

/* Staged chores (laundry). A started stage records when it started and when it
 * is *estimated* to be ready. Section 8.5 and section 6: a finished estimate is
 * never a finished stage — the machine is not the authority on whether the
 * clothes are dry, and nothing here auto-completes. */
export function stagePlan({ chore, record = {}, nowTs }) {
  const stages = (chore.stages || []).map(stage => ({ ...stage, state: 'pending' }));
  if (!stages.length) return { stages, current: null, readyAt: null, overdueEstimate: false };

  const started = record.stage || null;
  const index = started ? stages.findIndex(s => s.id === started.id) : -1;
  for (let i = 0; i < index; i++) stages[i].state = 'complete';

  if (index === -1) return { stages, current: null, readyAt: null, overdueEstimate: false };

  const current = stages[index];
  current.state = 'running';
  const waitMs = (current.waitMin || 0) * 60000;
  const readyAt = started.startedAt ? started.startedAt + waitMs : null;
  return {
    stages,
    current,
    readyAt,
    // The estimate has elapsed. That is a prompt to go and check, not a claim
    // that the stage is finished.
    overdueEstimate: !!(readyAt && nowTs && nowTs > readyAt),
  };
}

/* The record patch for completing a chore. Returned rather than written so the
 * caller owns persistence, and so this stays a pure function under test. */
export function completePatch(today, record = {}) {
  // `done` is a set of completion dates, not just the most recent one. The
  // ledger has to walk history to know which occurrences were met and which
  // were missed, and a single `last` field cannot answer that: it says a chore
  // was done on the 8th, but not whether the 6th and 7th were also done or
  // skipped. `last` is kept alongside it because the board reads it.
  return { last: today, done: { ...(record.done || {}), [today]: true }, steps: {}, stage: null, moved: null };
}

/* ---------------------------------------------------------------------------
 * Scoring. Chores now cost points (Satya, 2026-09-07, reversing plan 8.10).
 *
 * Two boundaries hold, and they are the reason this is safe to make harsh:
 *
 *   1. It moves the BALANCE only. evaluateDay is untouched, so the day verdict
 *      still depends solely on the seven routine blocks, and stakes.mjs — which
 *      reads verdict, never balance — cannot see chores. A missed bin degrades
 *      the app. It can never cost real money.
 *   2. Nothing is charged for a day still in progress. Today's exposure is
 *      reported separately as `pendingToday` so the cliff is visible before you
 *      fall off it, exactly as an open block scores nothing until it closes.
 *
 * The charge compounds: -5 per outstanding chore per day, every day it stays
 * undone. With this catalogue that is steep by design.
 */
export const CHORE_POINTS = Object.freeze({ onTime: 3, late: 1, outstandingPerDay: -5 });

/* Does a fresh occurrence open on `date`, given when it was last completed? */
function opensOn(chore, date, lastDone, since) {
  const mode = (chore.cadence || {}).mode;
  if (mode === 'daily') return true;
  if (mode === 'weekly') return dayOfWeek(date) === Number(chore.cadence.dow);
  if (mode === 'monthly') return lastDone === null ? date === since : daysBetween(lastDone, date) >= 30;
  return false; // asneeded never falls due, so it can never be missed
}

/* Walks each chore day by day from adoption to today. Returns the running
 * total, a per-date breakdown, and today's not-yet-charged exposure. */
export function choreLedger({ sched, state = {}, today }) {
  const since = state.config?.choresStart || null;
  const empty = { total: 0, byDate: {}, pendingToday: 0, outstandingToday: [] };
  if (!since || since > today) return empty;

  const records = state.chores || {};
  const byDate = {};
  const outstandingToday = [];
  let total = 0;
  let pendingToday = 0;

  const add = (date, points) => {
    if (!points) return;
    byDate[date] = (byDate[date] || 0) + points;
    total += points;
  };

  for (const chore of choreCatalogue(sched)) {
    const record = records[chore.id] || {};
    const done = record.done || {};
    const moved = record.moved || null;
    let lastDone = null;
    let openSince = null;

    for (let date = since; date <= today; date = addDays(date, 1)) {
      if (opensOn(chore, date, lastDone, since) && openSince === null) openSince = date;

      if (done[date] === true) {
        // On the day it fell due, or later. Late still earns something: the
        // record has to stay honest about what was actually done.
        add(date, openSince === date ? CHORE_POINTS.onTime : CHORE_POINTS.late);
        openSince = null;
        lastDone = date;
        continue;
      }

      if (openSince === null) continue;
      // A moved chore is not outstanding until the day it was moved to.
      if (moved && date < moved) continue;

      if (date < today) add(date, CHORE_POINTS.outstandingPerDay);
      else {
        // Today is not over. Report the exposure instead of charging it.
        pendingToday += CHORE_POINTS.outstandingPerDay;
        outstandingToday.push(chore.title);
      }
    }
  }

  return { total, byDate, pendingToday, outstandingToday };
}
