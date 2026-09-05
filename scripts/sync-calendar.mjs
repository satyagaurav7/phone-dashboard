/*
 * FLOWSTATE → Google Calendar one-way sync.
 *
 * Mirrors schedule.json's timed blocks into the Google Calendar that the
 * Google Home Max reads, so "Hey Google, what's on my calendar" speaks the
 * day's rhythm. Read-only from Google's side: nothing here ever reads
 * completion state back, and nothing writes to Firestore. Taps and momentum
 * stay in the dashboard, which remains the only tracker.
 *
 * Calendar events pass silently when missed — they never go overdue the way a
 * Task does. That's the whole reason the rhythm goes here and not into Google
 * Tasks: no punishment surface, reward-only rule intact.
 *
 *   node sync-calendar.mjs                 sync today + next 6 days
 *   node sync-calendar.mjs --days=14       longer horizon
 *   node sync-calendar.mjs --dry-run       print the plan, touch nothing
 *   node sync-calendar.mjs --calendar=ID   target a specific calendar
 *
 * Requires env GOOGLE_CALENDAR_SERVICE_ACCOUNT = service-account JSON, and the
 * target calendar shared with that account's client_email with
 * "Make changes to events". CALENDAR_ID env overrides the default (primary).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JWT } from 'google-auth-library';

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const DRY = process.argv.includes('--dry-run');
const DAYS = Math.max(1, Math.min(60, parseInt(arg('days') || '7', 10)));

const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));

// "primary" resolves against whoever is authenticated — and that's the service
// account, which owns a calendar nobody ever looks at. Writing there succeeds,
// reports 110 created, and shows nothing on the phone or the speaker. The
// target has to be named explicitly.
const CAL = arg('calendar') || process.env.CALENDAR_ID || sched.calendarId;
if (!CAL || CAL === 'primary') {
  console.error(
    'No target calendar. A service account\'s "primary" is its own empty calendar,\n' +
    'not yours — writes would succeed and show up nowhere. Set calendarId in\n' +
    'schedule.json (or the CALENDAR_ID env var) to the account whose calendar was\n' +
    'shared with the service account, e.g. booms.satya@gmail.com.'
  );
  process.exit(1);
}
const TZ = sched.timezone || 'America/Toronto';
const APP_URL = sched.appUrl || 'https://satyagaurav7.github.io/phone-dashboard/';
const API = 'https://www.googleapis.com/calendar/v3';

// Marks every event this script owns, so a stale block can be found and
// cleaned up without touching anything you created by hand.
const TAG = 'flowstate-rhythm';

// Today's date in Toronto, regardless of where the runner sits.
function torontoToday() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = t => p.find(x => x.type === t).value;
  return [+get('year'), +get('month'), +get('day')];
}

// Walk forward in calendar days. UTC arithmetic on bare date parts is safe
// here because we only ever use the result to pick a weekday and to stamp
// wall-clock times that the API resolves against timeZone.
function addDays([y, m, d], n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}
const iso = ([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dowOf = ([y, m, d]) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// Calendar event ids accept base32hex only (0-9, a-v), so a hex digest is the
// safe way to get a stable id from an arbitrary schedule key.
const eventId = (date, key) =>
  'fs' + createHash('sha1').update(`${date}|${key}`).digest('hex').slice(0, 26);

function buildDay(date) {
  const kind = sched.dayKinds[dowOf(date)] || 'sun';
  const rows = sched.schedules[kind] || [];
  const dateStr = iso(date);
  const events = [];
  for (const [key, start, end, emoji, title] of rows) {
    if (!start) continue;
    // The last row of the day ("Lights out") carries no end time.
    const finish = end || '23:59';
    events.push({
      id: eventId(dateStr, key),
      summary: `${emoji} ${title}`,
      description: `FLOWSTATE ${sched.kindTitles[kind] || kind}\n${APP_URL}`,
      start: { dateTime: `${dateStr}T${start}:00`, timeZone: TZ },
      end: { dateTime: `${dateStr}T${finish}:00`, timeZone: TZ },
      // Free, not busy — the rhythm should never make you look booked.
      transparency: 'transparent',
      // Silent: the dashboard's own push notifications do the nudging.
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: { source: TAG, kind, key, date: dateStr } }
    });
  }
  return { kind, dateStr, events };
}

async function main() {
  const start = torontoToday();
  const days = Array.from({ length: DAYS }, (_, i) => buildDay(addDays(start, i)));
  const total = days.reduce((n, d) => n + d.events.length, 0);

  console.log(`FLOWSTATE → Calendar "${CAL}" · ${DAYS} day(s) from ${iso(start)} · ${total} block(s)`);
  for (const d of days) console.log(`  ${d.dateStr}  ${d.kind.padEnd(6)} ${d.events.length} block(s)`);

  if (DRY) {
    console.log('\n--dry-run: nothing was written. Sample event:');
    console.log(JSON.stringify(days[0].events[0], null, 2));
    return;
  }

  const sa = JSON.parse(process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT || 'null');
  if (!sa) throw new Error('GOOGLE_CALENDAR_SERVICE_ACCOUNT env var is missing.');
  const auth = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.events']
  });
  const { token } = await auth.getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const cal = encodeURIComponent(CAL);

  let created = 0, updated = 0, failed = 0;
  for (const day of days) {
    for (const ev of day.events) {
      // No upsert in the Calendar API: insert with our own id, and fall back to
      // update when the id is already there from a previous run.
      let res = await fetch(`${API}/calendars/${cal}/events`, {
        method: 'POST', headers, body: JSON.stringify(ev)
      });
      if (res.status === 409) {
        res = await fetch(`${API}/calendars/${cal}/events/${ev.id}`, {
          method: 'PUT', headers, body: JSON.stringify(ev)
        });
        if (res.ok) { updated++; continue; }
      } else if (res.ok) {
        created++; continue;
      }
      failed++;
      const body = await res.text().catch(() => '');
      console.warn(`  ! ${day.dateStr} ${ev.summary} → HTTP ${res.status} ${body.slice(0, 300)}`);
      // A bad calendar id or a missing share fails identically for every event.
      // Bail rather than emit hundreds of copies of the same error.
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(
          `Calendar API returned ${res.status}. Check that "${CAL}" is shared with ` +
          `${sa.client_email} with "Make changes to events".`
        );
      }
    }
  }
  console.log(`Created ${created}, updated ${updated}, failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
