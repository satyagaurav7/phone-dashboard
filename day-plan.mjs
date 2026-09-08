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

/* A staged chore is not one block of work. Laundry is 10 minutes of sorting,
   an hour of the machine running, 5 minutes of transfer, another hour, then 25
   minutes of folding — 40 minutes of attention spread over two and a half
   hours. Planning it as one 40-minute chunk asked for an opening that does not
   exist, and once the wash was already running it reported the load as
   impossible to finish today while the machine was spinning.

   Split the remaining stages into the runs of active work between waits. Times
   past the current stage are estimates built from each stage's own waitMin —
   the same estimate the handoff prompt already shows — and never a claim that
   a stage has finished. */
function stageChunks(stages, fromIndex, startMin) {
  const chunks = [];
  let cursor = startMin;
  let run = null;
  for (let i = fromIndex; i < stages.length; i++) {
    const stage = stages[i];
    const activeMin = stage.activeMin || 0;
    if (activeMin > 0) {
      if (!run) run = { startMin: cursor, activeMin: 0, stageIds: [], labels: [] };
      run.activeMin += activeMin;
      run.stageIds.push(stage.id);
      run.labels.push(stage.label || stage.id);
      cursor += activeMin;
    }
    if (stage.waitMin) {
      if (run) { chunks.push(run); run = null; }
      cursor += stage.waitMin;      // the machine's time, never the user's
    }
  }
  if (run) chunks.push(run);
  return chunks;
}

/* One entry per run of active work, so each can be placed on its own. */
const stageEntries = (row, occurrence, chunks) => chunks.map(chunk => ({
  id: `chore:${row.id}@${occurrence}:${chunk.stageIds[0]}`,
  occurrence,
  source: 'chore',
  choreId: row.id,
  stageIds: chunk.stageIds,
  title: `${row.title} — ${chunk.labels.join(' + ')}`,
  startMin: chunk.startMin,
  endMin: chunk.startMin + chunk.activeMin,
  activeMin: chunk.activeMin,
  state: row.status,
}));

const outcomeEntry = (state, today, nowMin) => {
  const checkIn = state.checkIns?.[today] || {};
  const title = String(checkIn.firstStep || '').trim();
  if (!title || checkIn.focusDone === true) return null;
  const activeMin = Number(checkIn.focusMinutes || 25);
  return {
    id: `outcome:${today}:${checkIn.focusVersion || 0}`,
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

  const dueChores = [];
  const background = [];
  const handoffs = [];
  for (const row of dueRows) {
    const occurrence = row.dueDate || today;
    if (!row.stages?.length) { dueChores.push(choreEntry(row, today, nowMin)); continue; }

    const stage = stagePlan({
      chore: row,
      record: state.chores?.[row.id] || {},
      occurrence,
      nowTs,
    });
    const index = stage.current ? stage.stages.findIndex(s => s.id === stage.current.id) : -1;

    // Nothing running: the whole chore is still ahead, starting at its window.
    // Running: only what comes after the current stage, and not before the
    // machine is estimated to be done with it.
    const readyAtMin = stage.readyAt == null
      ? null
      : nowMin + Math.ceil((stage.readyAt - nowTs) / 60000);
    const chunks = index === -1
      ? stageChunks(stage.stages, 0, Math.max(parseClock(row.window) ?? nowMin, nowMin))
      : stageChunks(stage.stages, index + 1, Math.max(nowMin, (readyAtMin ?? nowMin) + (stage.current.activeMin || 0)));

    if (!stage.current || !stage.readyAt) {
      dueChores.push(...stageEntries(row, occurrence, chunks));
      continue;
    }

    background.push({
      id: `background:${row.id}@${occurrence}:${stage.current.id}`,
      source: 'background',
      choreId: row.id,
      title: stage.current.label,
      activeMin: 0,
      readyAt: stage.readyAt,
      autoCompletes: false,
    });

    /* Going back to the machine and doing the next run of work are one trip,
       not two. Emitting a generic five-minute "check" AND the same stages as a
       separate flexible task booked the time twice, and the flexible copy was
       then free to slide: a transfer that has to happen when the wash ends was
       being placed eight hours later, with the clothes sitting wet. The
       handoff carries the next run's real duration; only what comes after the
       following wait stays flexible. The wording stays conditional because an
       elapsed estimate is a prompt to look, not proof the machine finished. */
    const atMachine = chunks[0];
    const start = Math.max(nowMin, readyAtMin ?? nowMin);
    const activeMin = atMachine?.activeMin ?? 5;
    handoffs.push({
      id: `handoff:${row.id}@${occurrence}:${stage.current.id}`,
      source: 'handoff',
      choreId: row.id,
      stageIds: atMachine?.stageIds || [],
      title: atMachine
        ? `Check ${stage.current.label}, then ${atMachine.labels.join(' + ').toLowerCase()}`
        : `Check ${stage.current.label}`,
      activeMin,
      startMin: start,
      endMin: start + activeMin,
      readyAt: stage.readyAt,
      ready: stage.overdueEstimate,
    });
    dueChores.push(...stageEntries(row, occurrence, chunks.slice(1)));
  }

  /* previewAdjustment deliberately ignores `background` — a washer runs while
     you read, so it must not occupy the plan. But going to the machine when it
     finishes IS active time, and the comment there promised the caller would
     pass it as fixed. It never did, so the plan could put a 25-minute task
     straight over the moment the dryer needed emptying. */
  fixed.push(...handoffs);

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
