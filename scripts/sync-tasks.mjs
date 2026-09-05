/*
 * FLOWSTATE → Google Tasks, so "Hey Google, what are my tasks today" answers
 * with something short and actionable, and ChatGPT on the phone has a real
 * list to write into.
 *
 *   node sync-tasks.mjs              write today's tasks
 *   node sync-tasks.mjs --dry-run    print the plan, touch nothing
 *
 * Requires GOOGLE_OAUTH_CLIENT_ID / _SECRET / GOOGLE_OAUTH_REFRESH_TOKEN.
 * Get the refresh token once with oauth-setup.mjs — Google Tasks can't be
 * reached by a service account on a consumer account.
 *
 * Deliberately NOT the full 21 tap items. Spoken aloud, twenty-one items is
 * noise nobody listens to twice; the anchor plus the day's big wins is a list
 * you can actually answer to. Small wins stay in the dashboard where tapping
 * them is one thumb press.
 *
 * Yesterday's unfinished items are deleted rather than left to pile up as
 * overdue. Overdue badges are a punishment mechanic, and this project removed
 * those on purpose — a missed day should cost momentum, not accumulate debt.
 */
import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
const TZ = sched.timezone || 'America/Toronto';
const APP_URL = sched.appUrl || 'https://satyagaurav7.github.io/phone-dashboard/';
const API = 'https://tasks.googleapis.com/tasks/v1';
const LIST_TITLE = 'FLOWSTATE';
const MARK = 'FLOWSTATE';

// Mirrors BIG_KEYS in notify.mjs and index.html. Kept in step by hand; the
// momentum model is duplicated across all three already.
const BIG_KEYS = ['gym', 'language', 'study', 'cooked', 'smokefree', 'money'];

function localToday() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const get = t => p.find(x => x.type === t).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  };
}

const now = localToday();
const kind = sched.dayKinds[now.dow] || 'sun';
const labels = sched.tapPlan?.labels || {};
const times = sched.tapPlan?.itemTimes?.[kind] || {};

// Anchor first, then the day's big wins in the order they're meant to happen.
const planned = [
  // labels.anchor already carries its own ⚓, so don't add a second one.
  { key: 'anchor', title: labels.anchor || '⚓ Anchor' },
  ...BIG_KEYS
    .filter(k => times[k])
    .sort((a, b) => String(times[a]).localeCompare(String(times[b])))
    .map(k => ({ key: k, title: `${labels[k] || k}${times[k] ? ` — ${times[k]}` : ''}` }))
];

console.log(`FLOWSTATE → Google Tasks · ${now.date} · ${sched.kindTitles[kind] || kind}`);
for (const t of planned) console.log(`  ${t.title}`);

if (DRY) { console.log('\n--dry-run: nothing was written.'); process.exit(0); }

const { GOOGLE_OAUTH_CLIENT_ID: ID, GOOGLE_OAUTH_CLIENT_SECRET: SECRET,
        GOOGLE_OAUTH_REFRESH_TOKEN: REFRESH } = process.env;
if (!ID || !SECRET || !REFRESH) {
  console.error('\nMissing GOOGLE_OAUTH_CLIENT_ID / _SECRET / GOOGLE_OAUTH_REFRESH_TOKEN.');
  console.error('Run oauth-setup.mjs once to mint the refresh token. See TASKS-SETUP.md.');
  process.exit(1);
}

const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: ID, client_secret: SECRET, refresh_token: REFRESH, grant_type: 'refresh_token'
  })
});
const tok = await tokRes.json();
if (!tok.access_token) {
  console.error('Token refresh failed:', JSON.stringify(tok));
  console.error('A refresh token dies if consent is revoked — re-run oauth-setup.mjs.');
  process.exit(1);
}
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: H });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${(await res.text()).slice(0, 240)}`);
  return res.status === 204 ? null : res.json();
}

// A dedicated list is what makes ownership unambiguous: Tasks has no
// extended properties, so "ours" can only mean "in our list". It also leaves
// your default list free for whatever ChatGPT or you add by hand.
const { items: lists = [] } = await api('/users/@me/lists');
let list = lists.find(l => l.title === LIST_TITLE);
if (!list) {
  list = await api('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: LIST_TITLE }) });
  console.log(`Created task list "${LIST_TITLE}".`);
}

const { items: existing = [] } = await api(`/lists/${list.id}/tasks?showCompleted=true&showHidden=true&maxResults=100`);

// Clear anything from a previous day so nothing accrues as overdue.
let purged = 0;
for (const t of existing) {
  const tag = /FLOWSTATE · (\d{4}-\d{2}-\d{2})/.exec(t.notes || '');
  if (tag && tag[1] !== now.date) {
    await api(`/lists/${list.id}/tasks/${t.id}`, { method: 'DELETE' });
    purged++;
  }
}

// Leave today's alone if they're already there — that's how a completion tick
// survives the next sync.
const todayTitles = new Set(
  existing.filter(t => (t.notes || '').includes(`${MARK} · ${now.date}`)).map(t => t.title)
);
let added = 0;
for (const t of planned) {
  if (todayTitles.has(t.title)) continue;
  await api(`/lists/${list.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: t.title,
      notes: `${MARK} · ${now.date}\n${APP_URL}`,
      // Tasks honours only the date part; there's no timed overdue here.
      due: `${now.date}T00:00:00.000Z`
    })
  });
  added++;
}

console.log(`Added ${added}, already present ${planned.length - added}, cleared from earlier days ${purged}.`);
