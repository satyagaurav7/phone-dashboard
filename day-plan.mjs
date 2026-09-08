import { evaluateDay, scheduleConflicts, dayCapacity, dayShape, blocksFor, TRANSITION_MIN } from './rules.mjs';
import { upkeepBoard, stagePlan, STATUS } from './chores.mjs';

const parseClock = value => {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const routineEntry = (block, today) => ({
  id: `routine:${today}:${block.id}`,
  occurrence: today,
  source: 'routine',
  blockId: block.id,
  title: block.title,
  startMin: block.startMin,
  endMin: block.endMin,
  activeMin: Math.max(0, block.endMin - block.startMin),
  state: block.state,
  remainingKeys: block.items.filter(item => !['inWindow', 'late'].includes(item.state)).map(item => item.key),
});

const choreEntry = (row, today, nowMin) => {
  const startMin = parseClock(row.window);
  return {
    id: `chore:${row.id}@${row.dueDate || today}`,
    occurrence: row.dueDate || today,
    source: 'chore',
    choreId: row.id,
    title: row.title,
    startMin: startMin ?? nowMin,
    endMin: (startMin ?? nowMin) + (row.activeMin || 0),
    activeMin: row.activeMin || 0,
    state: row.status,
  };
};

const outcomeEntry = (state, today, nowMin) => {
  const checkIn = state.checkIns?.[today] || {};
  const title = String(checkIn.firstStep || '').trim();
  if (!title || checkIn.focusDone === true) return null;
  const activeMin = Number(checkIn.focusMinutes || 25);
  return {
    id: `outcome:${today}`,
    occurrence: today,
    source: 'outcome',
    title,
    startMin: nowMin,
    endMin: nowMin + activeMin,
    activeMin,
    state: checkIn.focusStartedAt ? 'started' : 'ready',
    startedAt: checkIn.focusStartedAt || null,
  };
};

const byStart = (a, b) => a.startMin - b.startMin || a.title.localeCompare(b.title);

function protectedTime(sched, dayKind) {
  const shape = dayShape(sched, dayKind);
  if (!shape) return [];
  const intervals = [];
  const add = (title, startMin, endMin) => {
    if (endMin > startMin) intervals.push({id:`protected:${title}:${startMin}`,title,startMin,endMin});
  };
  add('Sleep', 0, shape.wakeMin);
  add('Sleep', shape.sleepMin, 1440);
  if (shape.workStartMin != null) {
    let cursor = shape.workStartMin;
    for (const block of blocksFor(sched, dayKind).filter(b=>b.duringWork).sort(byStart)) {
      const start = Math.max(shape.workStartMin, block.startMin);
      const end = Math.min(shape.workEndMin, block.endMin);
      if (end <= start) continue;
      add('Work', cursor, start);
      cursor = Math.max(cursor, end);
    }
    add('Work', cursor, shape.workEndMin);
    add('Commute', shape.workStartMin-shape.commuteMin, shape.workStartMin);
    add('Commute', shape.workEndMin, shape.workEndMin+shape.commuteMin);
  }
  return intervals;
}

const collides = (start, end, block, buffer = TRANSITION_MIN) =>
  start < block.endMin + buffer && end + buffer > block.startMin;

export function previewAdjustment({
  nowMin, endMin, fixed = [], flexible = [], background = [], transitionMin = 10,
}) {
  // Background resources are intentionally not placed in occupied: a washer
  // may run while the user reads. Its handoff is represented separately as a
  // fixed action by the caller when it needs active attention.
  void background;
  const occupied = fixed.map(item => ({ ...item })).sort(byStart);
  const scheduled = [];
  const unscheduled = [];

  for (const task of flexible) {
    const duration = Math.max(0, Number(task.activeMin || 0));
    let start = Math.max(nowMin, Number(task.preferredStart ?? nowMin));
    let moved = true;
    while (moved) {
      moved = false;
      for (const block of occupied.sort(byStart)) {
        const tooClose = start < block.endMin + transitionMin
          && start + duration + transitionMin > block.startMin;
        if (tooClose) {
          start = block.endMin + transitionMin;
          moved = true;
          break;
        }
      }
    }
    const end = start + duration;
    if (end > endMin) {
      unscheduled.push({
        id: task.id,
        title: task.title,
        reason: `No ${duration}-minute opening before ${clock(endMin)}`,
      });
      continue;
    }
    const placed = { ...task, startMin: start, endMin: end };
    scheduled.push(placed);
    occupied.push(placed);
  }
  return { fixed: fixed.map(item => ({ ...item })), scheduled: scheduled.sort(byStart), unscheduled };
}

const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function buildDayPlan({ sched, state = {}, today, dayKind, nowMin, nowTs = Date.now() }) {
  const day = state.days?.[today] || {};
  const evaluated = evaluateDay({
    sched, dayKind, day, dateStr: today, nowMin,
    isDayOff: Boolean(state.dayOff?.[today]),
  });
  const routines = evaluated.blocks.map(block => routineEntry(block, today));
  const protectedIntervals = protectedTime(sched, dayKind);
  const fixed = [...protectedIntervals, ...routines];
  const fitsNow = row => !fixed.some(block=>collides(nowMin, nowMin+row.activeMin, block));
  const availableNow = !protectedIntervals.some(block=>collides(nowMin, nowMin+1, block, 0));
  const currentRoutines = routines.filter(row => row.state === 'open' && row.remainingKeys.length);
  const futureRoutines = routines.filter(row => row.startMin > nowMin && row.remainingKeys.length).sort(byStart);

  const upkeep = upkeepBoard({ sched, state, today });
  const dueRows = upkeep.rows.filter(row => row.status === STATUS.DUE || row.status === STATUS.OVERDUE);
  const dueChores = dueRows.map(row => choreEntry(row, today, nowMin));

  const background = [];
  const handoffs = [];
  for (const row of dueRows) {
    if (!row.stages?.length) continue;
    const stage = stagePlan({
      chore: row,
      record: state.chores?.[row.id] || {},
      occurrence: row.dueDate || today,
      nowTs,
    });
    if (!stage.current || !stage.readyAt) continue;
    background.push({
      id: `background:${row.id}@${row.dueDate || today}:${stage.current.id}`,
      source: 'background',
      choreId: row.id,
      title: stage.current.label,
      activeMin: 0,
      readyAt: stage.readyAt,
      autoCompletes: false,
    });
    handoffs.push({
      id: `handoff:${row.id}@${row.dueDate || today}:${stage.current.id}`,
      source: 'handoff',
      choreId: row.id,
      title: `Check ${stage.current.label}`,
      activeMin: 5,
      startMin: nowMin + Math.max(0, Math.ceil((stage.readyAt - nowTs) / 60000)),
      readyAt: stage.readyAt,
      ready: stage.overdueEstimate,
    });
  }

  const outcome = outcomeEntry(state, today, nowMin);
  const readyHandoff = handoffs.find(row => row.ready);
  let now = availableNow ? readyHandoff || currentRoutines[0] || null : null;

  if (!now && outcome && fitsNow(outcome)) now = outcome;

  if (!now) {
    const readyChore = dueChores
      .filter(row => row.startMin <= nowMin && fitsNow(row))
      .sort((a, b) => (a.state === STATUS.OVERDUE ? -1 : 0) - (b.state === STATUS.OVERDUE ? -1 : 0) || byStart(a, b))[0];
    if (readyChore) now = readyChore;
  }

  const upcoming = [
    ...futureRoutines,
    ...dueChores.filter(row => row.startMin > nowMin),
    ...handoffs.filter(row => !row.ready),
  ].sort(byStart);
  const next = upcoming.find(row => row.id !== now?.id) || null;
  const shape = dayShape(sched, dayKind);
  const adjustment = shape ? previewAdjustment({
    nowMin,
    endMin: shape.sleepMin,
    fixed,
    flexible: [outcome, ...dueChores].filter(Boolean).map(row => ({
      ...row,
      preferredStart: row.startMin,
    })),
    background,
  }) : { fixed: [], scheduled: [], unscheduled: [] };

  return {
    now,
    next,
    background,
    routines,
    dueChores,
    outcome,
    remainingActiveMin: dueChores.reduce((sum, row) => sum + row.activeMin, 0),
    capacity: dayCapacity(sched, dayKind),
    conflicts: scheduleConflicts(sched, dayKind),
    adjustment,
  };
}
