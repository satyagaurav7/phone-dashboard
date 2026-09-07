import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateDay } from '../rules.mjs';

const TZ = 'America/Toronto';

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reportableDates(today, count = 7) {
  return Array.from({ length: count }, (_, index) => addDays(today, index - count));
}

export function makeDatapoint(dateStr, result) {
  const failed = result.blocks.filter(block => block.state === 'failed').map(block => block.title);
  const success = result.verdict === 'passed' || result.verdict === 'off';
  return {
    daystamp: dateStr.replaceAll('-', ''),
    value: success ? 1 : 0,
    comment: success ? 'FLOWSTATE: passed' : `FLOWSTATE: failed - ${failed.join(', ')}`,
    requestid: `flowstate-${dateStr}`,
  };
}

function torontoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayKind(schedule, dateStr) {
  return schedule.dayKinds[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

async function beeminderRequest({ user, goal, token, path = '', method = 'GET', body }) {
  const url = new URL(`https://www.beeminder.com/api/v1/users/${encodeURIComponent(user)}/goals/${encodeURIComponent(goal)}${path}.json`);
  const options = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]));
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Beeminder ${method} failed (${response.status})`);
  return response.json();
}

export async function runReporter({ schedule, state, today = torontoToday(), live = false, token, post = beeminderRequest }) {
  const config = schedule.stakes || {};
  const dates = reportableDates(today).filter(date => !state.config?.windowsStart || date >= state.config.windowsStart);
  const points = dates.map(date => {
    const result = evaluateDay({ sched: schedule, dayKind: dayKind(schedule, date), day: state.days?.[date] || {}, dateStr: date, nowMin: null, isDayOff: Boolean(state.dayOff?.[date]) });
    return { date, result, payload: makeDatapoint(date, result) };
  });
  if (!live) return { dryRun: true, points };
  if (config.enabled !== true) throw new Error('schedule.json stakes.enabled must be true for --live');
  if (!token) throw new Error('BEEMINDER_TOKEN is required for --live');
  if (!config.user || !config.goal) throw new Error('schedule.json stakes.user and stakes.goal are required for --live');
  for (const point of points) {
    await post({ ...config, token, path: '/datapoints', method: 'POST', body: point.payload });
  }
  const goal = await post({ ...config, token });
  return { dryRun: false, points, goal };
}

async function main() {
  const live = process.argv.includes('--live');
  const root = new URL('..', import.meta.url);
  const schedule = JSON.parse(await readFile(new URL('schedule.json', root), 'utf8'));
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is required');
  const [{ initializeApp, cert }, { getFirestore }] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);
  initializeApp({ credential: cert(JSON.parse(raw)) });
  const ref = getFirestore().doc('dashboard/satya');
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Firestore doc dashboard/satya not found');
  const result = await runReporter({ schedule, state: snapshot.data(), live, token: process.env.BEEMINDER_TOKEN });
  for (const point of result.points) console.log(`${result.dryRun ? 'DRY RUN' : 'POSTED'} ${JSON.stringify(point.payload)}`);
  if (!result.dryRun) {
    const last = result.points.at(-1)?.date || null;
    await ref.update({ stakes: {
      goal: schedule.stakes.goal,
      pledge: result.goal.pledge,
      safebuf: result.goal.safebuf,
      losedate: result.goal.losedate,
      lastPostedDate: last,
      lastPostOk: true,
      fetchedAt: Date.now(),
    } });
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exit(1); });
