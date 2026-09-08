export const POINTS = Object.freeze({ inWindow: 2, late: 1, blockClean: 5, blockFail: -8, dayClean: 20 });
export const DEBT_FLOOR = 0;
export const BLACKOUT_FLOOR = -50;
export const DAY_OFF_LIMIT = 4;
export const DAY_OFF_WINDOW_DAYS = 28;
export const MOMENTUM_SMALL_KEYS = Object.freeze(['water', 'walk', 'read5', 'cookmeal', 'meditate', 'phonedown']);
export const MOMENTUM_BIG_KEYS = Object.freeze(['gym', 'language', 'study', 'cooked', 'smokefree', 'money']);

export function momentumDayGains(day) {
  if (!day) return 0;
  let total = day.anchor === true || day.completed === true ? 10 : 0;
  total += Math.min(4, MOMENTUM_SMALL_KEYS.filter(key => day[key] === true).length) * 3;
  total += MOMENTUM_BIG_KEYS.filter(key => day[key] === true).length * 8;
  return total;
}

function parseMin(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) throw new Error(`invalid block time: ${value}`);
  const [hour, minute] = value.split(':').map(Number);
  const total = hour * 60 + minute;
  if (hour > 23 || minute > 59) throw new Error(`invalid block time: ${value}`);
  return total;
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/* The schedule's own clock. Exported because the board used to read the
   browser's zone while scoring read this one: a phone whose clock is set
   elsewhere would show a day and a minute the scorer disagreed with. One
   clock, one answer. */
export function zonedNow(timestamp, timeZone) {
  return wallParts(timestamp, timeZone || 'America/Toronto');
}

function wallParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function blocksFor(sched, dayKind) {
  return (sched?.tapPlan?.blocks?.[dayKind] || []).map(block => ({
    id: block.id,
    title: block.title,
    startMin: parseMin(block.start),
    endMin: parseMin(block.end),
    keys: [...block.keys],
    duringWork: block.duringWork === true,
  }));
}

export function assertSchedule(sched) {
  const itemTimes = sched?.tapPlan?.itemTimes || {};
  for (const [kind, times] of Object.entries(itemTimes)) {
    const blocks = blocksFor(sched, kind);
    const counts = new Map();
    for (const block of blocks) {
      if (!block.id || !block.title) throw new Error(`block in ${kind} needs an id and title`);
      if (block.endMin <= block.startMin || block.endMin > 24 * 60) {
        throw new Error(`invalid window for ${block.id} in ${kind}`);
      }
      for (const key of block.keys) counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const key of Object.keys(times)) {
      const count = counts.get(key) || 0;
      if (count !== 1) throw new Error(`${key} appears ${count} times in blocks for ${kind}`);
    }
    for (const [key, count] of counts) {
      if (!(key in times)) throw new Error(`${key} in blocks for ${kind} has no item time`);
      if (count !== 1) throw new Error(`${key} appears ${count} times in blocks for ${kind}`);
    }
    // A block running past the sleep target is the defect that shipped: the
    // office evening ended at 23:15 against a 23:00 target, every day, by
    // design. This one throws.
    const shape = sched?.dayShape?.[kind];
    if (shape?.sleep) {
      const sleepMin = parseMin(shape.sleep);
      for (const block of blocks) {
        if (block.endMin > sleepMin) {
          throw new Error(`${kind}: ${block.id} ends after the sleep target ${shape.sleep}`);
        }
      }
    }
    // The suggested tap time must fall inside the window that scores it.
    // Without this the app can display "cook a meal at 19:40" and then fail the
    // block because Evening does not open until 20:30 — punishing the user for
    // following the app's own instructions. Seven office items drifted this way
    // when the gym window was widened to three hours and the evening blocks
    // moved but their item times did not.
    for (const block of blocks) {
      for (const key of block.keys) {
        const at = parseMin(times[key]);
        if (at < block.startMin || at > block.endMin) {
          throw new Error(
            `${kind}: ${key} is suggested at ${times[key]} but ${block.id} scores ` +
            `only ${Math.floor(block.startMin / 60)}:${String(block.startMin % 60).padStart(2, '0')}` +
            `-${Math.floor(block.endMin / 60)}:${String(block.endMin % 60).padStart(2, '0')}`);
        }
      }
    }
  }
  return true;
}

export function evaluateDay({ sched, dayKind, day = {}, dateStr, nowMin, isDayOff }) {
  const blocks = blocksFor(sched, dayKind);
  if (isDayOff) return { off: true, blocks: [], verdict: 'off', delta: 0 };

  let delta = 0;
  const results = blocks.map(block => {
    const phase = nowMin === null || nowMin >= block.endMin
      ? 'closed'
      : nowMin < block.startMin ? 'upcoming' : 'open';
    const items = block.keys.map(key => {
      const timestamp = day.log?.[key];
      let state;
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        const wall = wallParts(timestamp, sched.timezone || 'America/Toronto');
        state = wall.date === dateStr && wall.minute >= block.startMin && wall.minute <= block.endMin
          ? 'inWindow' : 'late';
      } else if (day[key] === true) {
        state = 'late';
      } else {
        state = phase === 'closed' ? 'missed' : 'pending';
      }
      if (state === 'inWindow') delta += POINTS.inWindow;
      if (state === 'late') delta += POINTS.late;
      return { key, state };
    });

    let state = phase;
    if (phase === 'closed') {
      state = items.every(item => item.state === 'inWindow') ? 'passed' : 'failed';
      delta += state === 'passed' ? POINTS.blockClean : POINTS.blockFail;
    }
    return {
      ...block,
      state,
      items,
      closesInMin: state === 'open' ? block.endMin - nowMin : null,
    };
  });

  const anyFailed = results.some(block => block.state === 'failed');
  const allPassed = results.length > 0 && results.every(block => block.state === 'passed');
  const verdict = anyFailed ? 'failed' : allPassed ? 'passed' : 'pending';
  if (allPassed) delta += POINTS.dayClean;
  return { off: false, blocks: results, verdict, delta };
}

export function tierForBalance(total) {
  if (total < BLACKOUT_FLOOR) return 'blackout';
  if (total < DEBT_FLOOR) return 'debt';
  return 'normal';
}

export function balance({ sched, state, today }) {
  const start = state?.config?.windowsStart;
  if (!start || start > today) return { total: 0, states: {}, tier: 'normal' };
  const states = {};
  let total = 0;
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const noon = new Date(`${date}T12:00:00Z`);
    const dayKind = sched.dayKinds[noon.getUTCDay()];
    const nowMin = date === today ? wallParts(Date.now(), sched.timezone || 'America/Toronto').minute : null;
    const result = evaluateDay({
      sched, dayKind, day: state.days?.[date] || {}, dateStr: date, nowMin,
      isDayOff: Boolean(state.dayOff?.[date]),
    });
    states[date] = result;
    total += result.delta;
  }
  return { total, states, tier: tierForBalance(total) };
}

export function dueEdges({ sched, dayKind, day = {}, dateStr, prevMin, nowMin, isDayOff }) {
  if (isDayOff) return [];
  const dayResult = evaluateDay({ sched, dayKind, day, dateStr, nowMin, isDayOff: false });
  const edges = [];
  const add = (minute, kind, block) => {
    if (minute > prevMin && minute <= nowMin) {
      edges.push({
        minute,
        kind, blockId: block.id, title: block.title,
        remaining: block.items.filter(item => kind === 'close' ? item.state !== 'inWindow' : !['inWindow', 'late'].includes(item.state)).map(item => item.key),
        state: block.state,
      });
    }
  };
  for (const block of dayResult.blocks) {
    add(block.startMin, 'open', block);
    add(block.endMin - 15, 'warn', block);
    add(block.endMin, 'close', block);
  }
  return edges.sort((a, b) => {
    const order = { close: 0, open: 1, warn: 2 };
    return a.minute - b.minute || order[a.kind] - order[b.kind];
  }).map(({ minute, ...edge }) => edge);
}

export function canDeclareDayOff({ dayOff = {}, dateStr }) {
  const start = addDays(dateStr, -(DAY_OFF_WINDOW_DAYS - 1));
  const used = Object.keys(dayOff).filter(date => date >= start && date <= dateStr).sort();
  if (used.length < DAY_OFF_LIMIT) return { allowed: true, nextAvailableDate: null };
  return { allowed: false, nextAvailableDate: addDays(used[used.length - DAY_OFF_LIMIT], DAY_OFF_WINDOW_DAYS) };
}

/* ---------------------------------------------------------------------------
 * Day shape and feasibility (phase 1).
 *
 * The office evening shipped arithmetically impossible: 345 minutes of blocks
 * against the 340 that existed between arriving home and a 23:00 sleep target,
 * with wind-down ending at 23:15. Nothing in the code could say so, because the
 * schedule had no notion of when the day starts, ends, or is spent at work.
 *
 * A declared shape makes that checkable. Overrunning bedtime throws — it is the
 * defect that shipped and must not reach the phone again. Everything else is
 * REPORTED rather than thrown: a conflict is information the planner and the
 * user act on, and silently refusing to load a schedule would be worse than
 * showing what is wrong with it.
 */
export function dayShape(sched, dayKind) {
  const raw = sched?.dayShape?.[dayKind];
  if (!raw) return null;
  return {
    wakeMin: parseMin(raw.wake),
    sleepMin: parseMin(raw.sleep),
    workStartMin: raw.workStart ? parseMin(raw.workStart) : null,
    workEndMin: raw.workEnd ? parseMin(raw.workEnd) : null,
    commuteMin: Number(raw.commuteMin || 0),
  };
}

const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const clampOut = (start, end, wStart, wEnd) => {
  // Minutes of [start,end) that fall OUTSIDE the work interval.
  if (wStart == null) return Math.max(0, end - start);
  const inside = Math.max(0, Math.min(end, wEnd) - Math.max(start, wStart));
  return Math.max(0, end - start) - inside;
};

/* Union of block minutes outside working hours, against the free time that
 * actually exists. Union keeps capacity reporting defensive if a proposed
 * schedule contains an overlap; scheduleConflicts reports that overlap. */
export function dayCapacity(sched, dayKind) {
  const shape = dayShape(sched, dayKind);
  if (!shape) return null;
  const work = shape.workStartMin != null ? shape.workEndMin - shape.workStartMin : 0;
  const availableMin = (shape.sleepMin - shape.wakeMin) - work - 2 * shape.commuteMin;

  const spans = blocksFor(sched, dayKind)
    .map(b => [b.startMin, b.endMin])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const scheduledMin = merged.reduce(
    (n, [s, e]) => n + clampOut(s, e, shape.workStartMin, shape.workEndMin), 0);

  return {
    availableMin, scheduledMin,
    slackMin: availableMin - scheduledMin,
    feasible: scheduledMin <= availableMin,
  };
}

export const TRANSITION_MIN = 10;

export function scheduleConflicts(sched, dayKind) {
  const shape = dayShape(sched, dayKind);
  if (!shape) return [];
  const blocks = blocksFor(sched, dayKind).slice().sort((a, b) => a.startMin - b.startMin);
  const found = [];

  for (const block of blocks) {
    if (shape.workStartMin != null
      && overlaps(block.startMin, block.endMin, shape.workStartMin, shape.workEndMin)
      && !block.duringWork) {
      // A block may declare duringWork when being inside the working day is
      // correct — lunch, for instance. Declared in the schedule rather than
      // matched by id here, so moving that block still gets checked.
      found.push({
        kind: 'overlaps-work', blockId: block.id,
        detail: `${block.title} runs into working hours`,
      });
    }
  }

  // The execution board needs one unambiguous current block. An overlap is a
  // schedule defect, not extra capacity, because both blocks would read NOW.
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1], cur = blocks[i];
    const gap = cur.startMin - prev.endMin;
    if (gap < 0) {
      found.push({
        kind: 'overlapping-blocks', blockId: cur.id,
        detail: `${cur.title} overlaps ${prev.title} by ${Math.abs(gap)} min`,
      });
    } else if (gap < TRANSITION_MIN) {
      found.push({
        kind: 'no-transition', blockId: cur.id,
        detail: `only ${gap} min between ${prev.title} and ${cur.title}`,
      });
    }
  }

  const cap = dayCapacity(sched, dayKind);
  if (cap && !cap.feasible) {
    found.push({
      kind: 'over-capacity', blockId: null,
      detail: `${cap.scheduledMin} min scheduled against ${cap.availableMin} available`,
    });
  }
  return found;
}
