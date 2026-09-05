/*
 * Read-only audit of one day on the target calendar. Separates events this
 * project owns (tagged source=flowstate-rhythm) from everything already there,
 * so an overlap between the dashboard's rhythm and any pre-existing schedule
 * is visible before it gets cleaned up.
 *
 *   node audit-calendar.mjs                 today
 *   node audit-calendar.mjs --date=2026-09-07
 */
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';

const arg = n => {
  const h = process.argv.find(a => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : null;
};
const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
const TZ = sched.timezone || 'America/Toronto';
const CAL = arg('calendar') || process.env.CALENDAR_ID || sched.calendarId;
const TAG = 'flowstate-rhythm';

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const DATE = arg('date') || today();

const sa = JSON.parse(process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT || 'null');
if (!sa) { console.error('GOOGLE_CALENDAR_SERVICE_ACCOUNT is missing.'); process.exit(1); }

const auth = new JWT({
  email: sa.client_email, key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/calendar.events.readonly']
});
const { token } = await auth.getAccessToken();

const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL)}/events`);
url.searchParams.set('timeMin', `${DATE}T00:00:00-04:00`);
url.searchParams.set('timeMax', `${DATE}T23:59:59-04:00`);
url.searchParams.set('singleEvents', 'true');
url.searchParams.set('orderBy', 'startTime');
url.searchParams.set('maxResults', '250');

const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  const body = await res.text();
  console.error(`HTTP ${res.status}\n${body.slice(0, 600)}`);
  process.exit(1);
}
const { items = [] } = await res.json();

const mine = [], theirs = [];
for (const e of items) {
  (e.extendedProperties?.private?.source === TAG ? mine : theirs).push(e);
}
const t = e => (e.start?.dateTime || e.start?.date || '').slice(11, 16) || 'all-day';
const line = e => `  ${(t(e) || '').padEnd(8)} ${(e.summary || '(no title)').slice(0, 64)}`;

console.log(`${CAL} · ${DATE} · ${items.length} event(s)\n`);
console.log(`FLOWSTATE (mine, tagged ${TAG}) — ${mine.length}`);
mine.forEach(e => console.log(line(e)));
console.log(`\nPRE-EXISTING (not mine) — ${theirs.length}`);
theirs.forEach(e => console.log(line(e) + (e.recurringEventId ? '   [recurring]' : '')));
