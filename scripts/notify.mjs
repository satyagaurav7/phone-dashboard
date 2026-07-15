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
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';

const MODE = (process.argv.find(a => a.startsWith('--mode=')) || '--mode=brief').split('=')[1];
const FORCE = process.argv.includes('--force');

// FLOWSTATE momentum model — keep in sync with the constants in index.html.
const SMALL_KEYS = ['water', 'walk', 'read5', 'cookmeal', 'meditate', 'phonedown'];
const BIG_KEYS = ['gym', 'language', 'study', 'cooked', 'smokefree', 'money'];
const clampM = m => Math.max(0, Math.min(100, m));
const dayGains = d => {
  if (!d) return 0;
  let g = (d.anchor === true || d.completed === true) ? 10 : 0;
  g += Math.min(4, SMALL_KEYS.filter(k => d[k] === true).length) * 3;
  g += BIG_KEYS.filter(k => d[k] === true).length * 8;
  return g;
};
const flowStateOf = m => m >= 75 ? 'Deep flow' : m >= 50 ? 'Flow' : m >= 25 ? 'In motion' : 'Cold start';
const momentumNow = (data, today) => clampM((data.flow?.m ?? 20) + dayGains((data.days || {})[today]));

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
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10) % 24, // Intl can emit "24" at midnight
    dow,
    weekdayLong: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long' }).format(new Date())
  };
}

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

  const m = momentumNow(data, now.date);
  lines.push(`🌊 Momentum ${m} — ${flowStateOf(m)}. One small win keeps it climbing.`);

  const urgent = lines.some(l => l.includes('DUE TODAY'));
  return {
    title: `${urgent ? '⚠️' : '🌊'} ${sched.kindTitles[kind] || kind} — ${now.weekdayLong}`,
    body: lines.filter(Boolean).join('\n')
  };
}

// 9 PM anchor reminder (CLI mode is still called "streak" so the workflow
// doesn't change). Silent whenever the day is already anchored — silence is
// the reward. No death language, ever.
function composeStreak(data, now) {
  const d = (data.days || {})[now.date] || {};
  if (d.anchor === true || d.completed === true) {
    console.log('Day is anchored — staying silent.');
    return null;
  }
  const m = momentumNow(data, now.date);
  const g = dayGains(d);
  return {
    title: '⚓ 2 minutes — today isn\'t counted yet',
    body: g > 0
      ? `You already banked +${g} momentum today. Drop the anchor and the day counts.`
      : `Tap the anchor: CGM checked, insulin on track, you're here. Momentum ${m} is waiting.`
  };
}

async function main() {
  const now = localNow();
  // GitHub cron routinely runs 1-3 hours late at busy times, so a strict
  // hour match silently drops notifications. Accept a window instead;
  // the notifyLog dedupe below prevents the paired cron from double-sending.
  const [minHour, maxHour] = MODE === 'brief' ? [7, 9] : [21, 23];
  if (!FORCE && (now.hour < minHour || now.hour > maxHour)) {
    console.log(`Local time in ${TZ} is ${now.hour}:xx, outside the ${minHour}-${maxHour} send window for [${MODE}]. Exiting.`);
    return;
  }

  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null');
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing.');
  initializeApp({ credential: cert(sa) });

  const ref = getFirestore().doc('dashboard/satya');
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Firestore doc dashboard/satya not found.');
  const data = snap.data();

  // Dedupe: both UTC crons can land inside the send window on the same day.
  // The workflow's concurrency group serializes runs, so this check is safe.
  if (!FORCE && data.notifyLog?.[MODE] === now.date) {
    console.log(`[${MODE}] already sent today (${now.date}) — the other cron got there first. Exiting.`);
    return;
  }

  const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens.filter(Boolean) : [];
  if (tokens.length === 0) {
    console.log('No FCM tokens registered — open the app and tap "Enable notifications" first.');
    return;
  }

  const msg = MODE === 'streak' ? composeStreak(data, now) : composeBrief(data, now);
  if (!msg) return;

  console.log(`Sending [${MODE}] to ${tokens.length} device(s):\n${msg.title}\n${msg.body}`);
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: msg.title, body: msg.body },
    webpush: {
      notification: { icon: ICON, badge: ICON, tag: `mission-${MODE}` },
      fcmOptions: { link: APP_URL }
    }
  });
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
    await ref.update({ fcmTokens: tokens.filter(t => !dead.includes(t)) });
    console.log(`Pruned ${dead.length} dead token(s).`);
  }

  if (res.successCount > 0) {
    await ref.update({ [`notifyLog.${MODE}`]: now.date });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
