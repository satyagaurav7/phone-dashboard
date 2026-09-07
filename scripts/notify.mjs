/*
 * Mission Control notification sender. Runs on GitHub Actions cron.
 *
 *   node notify.mjs --mode=brief    7 AM Toronto: morning brief (schedule + deadlines)
 *   node notify.mjs --mode=streak   9 PM Toronto: streak saver, only if not checked in
 *   --force                         skip the local-hour guard (manual testing)
 *
 * Requires env FIREBASE_SERVICE_ACCOUNT = service-account JSON for project newt-90ca4.
 * Reads dashboard/satya from Firestore and ../schedule.json for the timetable.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { balance, blocksFor, dueEdges, evaluateDay, momentumDayGains } from '../rules.mjs';

const MODE = (process.argv.find(a => a.startsWith('--mode=')) || '--mode=brief').split('=')[1];
const FORCE = process.argv.includes('--force');

// FLOWSTATE scoring model — keep in sync with the constants in index.html.
// Momentum itself is no longer read here: notifications report action days, a
// count of real days, rather than a score. P0.1.
// Mirrors actionDays() in index.html. The live "lately" signal is a count of
// real days, not a score — a quiet day isn't counted rather than penalised, and
// one action tomorrow moves it straight back up. P0.1.
const ACTION_WINDOW = 14;
const shiftDate = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const actionDays = (data, today, n = ACTION_WINDOW) => {
  let c = 0, d = today;
  for (let i = 0; i < n; i++) { if (momentumDayGains((data.days || {})[d]) > 0) c++; d = shiftDate(d, -1); }
  return c;
};

const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
const TZ = sched.timezone || 'America/Toronto';
const APP_URL = sched.appUrl || 'https://satyagaurav7.github.io/phone-dashboard/';
const ICON = APP_URL + 'icons/icon-192.png';

// Local wall-clock in Toronto, DST-proof. The workflow fires at both possible
// UTC hours; this guard makes exactly one of them act.
function localNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hour = parseInt(get('hour'), 10) % 24; // Intl can emit "24" at midnight
  const minute = parseInt(get('minute'), 10);
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour, minute, minutes: hour * 60 + minute, dow,
    weekdayLong: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long' }).format(new Date())
  };
}

const toM = t => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); };

// Days from `date` until the next occurrence of day-of-month `day` (rent/card due days).
function daysToDayOfMonth(dateStr, day) {
  day = parseInt(day, 10);
  if (!day || day < 1 || day > 31) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = Date.UTC(y, m - 1, d);
  let due = Date.UTC(y, m - 1, day);
  if (due < today) due = Date.UTC(y, m, day); // next month (Date.UTC handles rollover)
  return Math.round((due - today) / 864e5);
}

function daysUntil(dateStr, targetStr) {
  if (!targetStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [ty, tm, td] = String(targetStr).split('-').map(Number);
  if (!ty || !tm || !td) return null;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 864e5);
}

function fmtDue(label, n) {
  return n === 0 ? `${label} — DUE TODAY` : `${label} — in ${n} day${n === 1 ? '' : 's'}`;
}

function composeBrief(data, now) {
  const c = data.config || {};
  const kind = sched.dayKinds[now.dow] || 'sun';
  const lines = [sched.glance[kind] || ''];

  const rent = daysToDayOfMonth(now.date, c.rentDay);
  const cc = daysToDayOfMonth(now.date, c.ccDay);
  if (rent !== null && rent <= 3) lines.push(fmtDue('🏠 Rent', rent));
  if (cc !== null && cc <= 3) lines.push(fmtDue('💳 Card payment', cc));

  for (const [key, label] of [['permit', '🍁 Work permit expiry'], ['celpipExam', '📚 CELPIP retest'], ['cecDate', '🍁 CEC eligibility']]) {
    const n = daysUntil(now.date, c[key]);
    if (n !== null && n >= 0 && n <= 3) lines.push(fmtDue(label, n));
  }

  // A count of days, not a score to defend. Reads the same either way, but it
  // recovers by doing something rather than by not missing.
  const act = actionDays(data, now.date);
  lines.push(`🌊 ${act} action day${act === 1 ? '' : 's'} in the last ${ACTION_WINDOW}. One small win adds today.`);

  const urgent = lines.some(l => l.includes('DUE TODAY'));
  return {
    title: `${urgent ? '⚠️' : '🌊'} ${sched.kindTitles[kind] || kind} — ${now.weekdayLong}`,
    body: lines.filter(Boolean).join('\n')
  };
}

// Tap-time nudges: schedule.json tapPlan.slots defines up to 3 windows per day
// kind. A nudge fires only when its cron lands inside the slot window, it
// hasn't been sent today, AND at least one of its items is still untapped.
// Fully-done slots stay silent — doing the things is how you mute the app.
function composeNudge(data, now) {
  const kind = sched.dayKinds[now.dow] || 'sun';
  const slots = sched.tapPlan?.slots?.[kind] || [];
  const labels = sched.tapPlan?.labels || {};
  const d = (data.days || {})[now.date] || {};
  for (let i = 0; i < slots.length; i++) {
    const slotM = toM(slots[i].t);
    // Window tolerates GitHub cron landing up to ~25 min early or ~110 min late.
    if (now.minutes < slotM - 25 || now.minutes > slotM + 110) continue;
    if (data.notifyLog?.[`nudge${i}`] === now.date) continue;
    const pending = slots[i].keys.filter(k => d[k] !== true);
    if (pending.length === 0) continue;
    const names = pending.map(k => labels[k] || k).join(' · ');
    return {
      logField: `nudge${i}`,
      title: `${slots[i].title} — ${pending.length} tap${pending.length === 1 ? '' : 's'} open`,
      body: `${names}\n🌊 Any one of these counts the day.`
    };
  }
  return null;
}

// 9 PM anchor reminder (CLI mode is still called "streak" so the workflow
// doesn't change). Silent whenever the day is already anchored — silence is
// the reward. No death language, ever.
//
// This reads dashboard flags ONLY. Actions completed by voice, in Google Tasks,
// or anywhere off the dashboard are invisible here, so it must never claim the
// day is empty — it can only say what this app has recorded. Offer a review;
// don't deliver a verdict. See CHECKINS-IMPLEMENTATION-PLAN.md P0.3.
function composeStreak(data, now) {
  const d = (data.days || {})[now.date] || {};
  if (d.anchor === true || d.completed === true) {
    console.log('Day is anchored — staying silent.');
    return null;
  }
  const g = momentumDayGains(d);
  return {
    title: '⚓ Would a quick review help?',
    body: g > 0
      ? `You banked +${g} momentum here today. If the anchor still fits, it's two minutes — otherwise I'll stay quiet.`
      : `Nothing recorded in the app today — anything done by voice or elsewhere wouldn't show here. Two minutes if you want it.`
  };
}

function windowMessage(edge, data, now) {
  const labels = sched.tapPlan?.labels || {};
  const block = blocksFor(sched, sched.dayKinds[now.dow] || 'sun').find(item => item.id === edge.blockId);
  if (edge.kind === 'close' && edge.state === 'passed') return null;
  if (edge.kind === 'open') return { title: 'FLOWSTATE', body: `${edge.title} open until ${String(Math.floor(block.endMin / 60)).padStart(2, '0')}:${String(block.endMin % 60).padStart(2, '0')} · ${block.keys.length} items` };
  if (edge.kind === 'warn') return { title: 'FLOWSTATE', body: `${edge.title} closes in 15 min · ${edge.remaining.length} left` };
  const names = edge.remaining.map(key => labels[key] || key).join(', ');
  return { title: 'FLOWSTATE', body: `${edge.title} failed · ${names} not logged · -8` };
}

async function main() {
  const now = localNow();
  // GitHub cron routinely runs 1-3 hours late at busy times, so strict time
  // matches silently drop notifications. Explicit modes use wide hour windows;
  // auto mode decides from the wall clock + notifyLog dedupe after reading data.
  if (MODE !== 'auto') {
    const [minHour, maxHour] = MODE === 'brief' ? [7, 9] : [21, 23];
    if (!FORCE && (now.hour < minHour || now.hour > maxHour)) {
      console.log(`Local time in ${TZ} is ${now.hour}:xx, outside the ${minHour}-${maxHour} send window for [${MODE}]. Exiting.`);
      return;
    }
  }

  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null');
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing.');
  initializeApp({ credential: cert(sa) });

  const ref = getFirestore().doc('dashboard/satya');
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Firestore doc dashboard/satya not found.');
  const data = snap.data();

  const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens.filter(Boolean) : [];
  if (tokens.length === 0) {
    console.log('No FCM tokens registered — open the app and tap "Enable notifications" first.');
    return;
  }

  // Pick what's due. Dedupe via notifyLog: both DST crons can land in the same
  // window; the workflow's concurrency group serializes runs, so this is safe.
  // Discretionary-push preferences, set in the app (brief §4). These gate
  // FLOWSTATE's own pushes only — Google Tasks alerts, Home routines and
  // anything medical are separate systems this script cannot and must not
  // touch. Deadlines still reach him through the brief when it is enabled.
  const pf = data.prefs || {};
  const wants = k => pf[k] !== false;              // absent means on
  const snoozed = pf.snoozeUntil === now.date;
  if (snoozed) console.log(`Snoozed for ${now.date} — discretionary pushes suppressed.`);

  let messages = [], logFields = [];
  if (MODE === 'auto') {
    if (!snoozed && wants('notifyWindows')) {
      const kind = sched.dayKinds[now.dow] || 'sun';
      const first = Math.min(...blocksFor(sched, kind).map(block => block.startMin));
      const prevMin = data.notifyLog?.lastEdgeDate === now.date ? Number(data.notifyLog.lastEdgeMin) : first - 1;
      const edges = dueEdges({ sched, dayKind: kind, day: data.days?.[now.date] || {}, dateStr: now.date, prevMin, nowMin: now.minutes, isDayOff: Boolean(data.dayOff?.[now.date]) })
        .filter(edge => !data.notifyLog?.[`edge:${now.date}:${edge.blockId}:${edge.kind}`]);
      if (edges.length > 3) {
        messages.push({ title: 'FLOWSTATE', body: `${edges.length} window updates since the last check. Open FLOWSTATE for the current day.` });
        logFields.push(...edges.map(edge => `edge:${now.date}:${edge.blockId}:${edge.kind}`));
      } else {
        for (const edge of edges) {
          const msg = windowMessage(edge, data, now);
          if (msg) { messages.push(msg); logFields.push(`edge:${now.date}:${edge.blockId}:${edge.kind}`); }
        }
        const blocks = blocksFor(sched, kind);
        const last = blocks.reduce((a, b) => a.endMin > b.endMin ? a : b);
        if (edges.some(edge => edge.kind === 'close' && edge.blockId === last.id) && !data.notifyLog?.[`day:${now.date}`]) {
          const result = evaluateDay({ sched, dayKind: kind, day: data.days?.[now.date] || {}, dateStr: now.date, nowMin: null, isDayOff: false });
          const ledger = balance({ sched, state: data, today: now.date });
          const failed = result.blocks.filter(block => block.state === 'failed').length;
          messages.push({ title: 'FLOWSTATE', body: result.verdict === 'passed'
            ? `Day passed · +${result.delta} · balance ${ledger.total}`
            : `Day failed · ${failed} blocks · balance ${ledger.total}` });
          logFields.push(`day:${now.date}`);
        }
      }
      logFields.push('lastEdgeMin', 'lastEdgeDate');
    }
    if (!messages.length && !snoozed && wants('notifyBrief') && now.hour >= 7 && now.hour <= 9 && data.notifyLog?.brief !== now.date) {
      messages.push(composeBrief(data, now)); logFields.push('brief');
    }
    if (!messages.length && !snoozed && wants('notifyEvening') && now.hour >= 21 && now.hour <= 23 && data.notifyLog?.streak !== now.date) {
      const msg = composeStreak(data, now); if (msg) { messages.push(msg); logFields.push('streak'); }
    }
    if (!messages.length) {
      if (logFields.includes('lastEdgeMin')) await ref.update({ 'notifyLog.lastEdgeMin': now.minutes, 'notifyLog.lastEdgeDate': now.date });
      console.log(`auto: nothing due at ${now.hour}:${String(now.minute).padStart(2,'0')} ${TZ} — staying silent.`); return;
    }
  } else {
    if (!FORCE && data.notifyLog?.[MODE] === now.date) {
      console.log(`[${MODE}] already sent today (${now.date}) — the other cron got there first. Exiting.`);
      return;
    }
    const msg = MODE === 'streak' ? composeStreak(data, now) : composeBrief(data, now);
    if (!msg) return;
    messages.push(msg); logFields.push(MODE);
  }

  const responses = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i], logField = logFields[i] || 'windows';
    console.log(`Sending [${logField}] to ${tokens.length} device(s):\n${msg.title}\n${msg.body}`);
    responses.push(await getMessaging().sendEachForMulticast({
      tokens, notification: { title: msg.title, body: msg.body },
      webpush: { notification: { icon: ICON, badge: ICON, tag: `flowstate-${logField}` }, fcmOptions: { link: APP_URL } }
    }));
  }
  const res = { successCount: responses.reduce((n, item) => n + item.successCount, 0), failureCount: responses.reduce((n, item) => n + item.failureCount, 0), responses: responses.flatMap(item => item.responses) };
  console.log(`Success: ${res.successCount}, failed: ${res.failureCount}`);

  // Prune tokens FCM says are dead so the list never rots.
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      console.warn(`Token ${i}: ${code}`);
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) dead.push(tokens[i]);
    }
  });
  if (dead.length) {
    // arrayRemove, not a rewritten array. Rewriting from `tokens` — read before
    // the send — would erase any token registered while this run was in flight,
    // silently unsubscribing a device that had just been set up.
    await ref.update({ fcmTokens: FieldValue.arrayRemove(...dead) });
    console.log(`Pruned ${dead.length} dead token(s).`);
  }

  if (res.successCount > 0) {
    const patch = {};
    for (const field of logFields) {
      if (field === 'lastEdgeMin') patch['notifyLog.lastEdgeMin'] = now.minutes;
      else if (field === 'lastEdgeDate') patch['notifyLog.lastEdgeDate'] = now.date;
      else patch[`notifyLog.${field}`] = now.date;
    }
    await ref.update(patch);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
