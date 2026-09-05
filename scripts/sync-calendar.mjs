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

// Reminders on the moments that actually cost you the day if missed, and
// nowhere else. Every block would be ~20 popups a day, which is how you end up
// muting the calendar entirely. Value is minutes of warning.
const REMIND = {
  wake: 0,        // the anchor hangs off this
  bus1: 10,       // office days: miss it and the morning is gone
  gym: 10,        // needs a running start
  eatbfast: 0,    // bolus + supplements
  cooklunch: 5,   // the delivery-trigger hour
  lunch: 5,
  upskill: 5,     // CELPIP + money move
  prep: 0         // creatine + wind down
};

// What a hand edit changes. If the event on Google no longer hashes to what we
// last wrote, someone (you, or ChatGPT on your phone) moved it, and the sync
// leaves it alone from then on.
const hashOf = (summary, start, end) =>
  createHash('sha1').update(`${summary}|${start}|${end}`).digest('hex').slice(0, 16);

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
    const summary = `${emoji} ${title}`;
    const startAt = `${dateStr}T${start}:00`;
    const endAt = `${dateStr}T${finish}:00`;
    const mins = REMIND[key];
    events.push({
      id: eventId(dateStr, key),
      summary,
      description: `FLOWSTATE ${sched.kindTitles[kind] || kind}\n${APP_URL}`,
      start: { dateTime: startAt, timeZone: TZ },
      end: { dateTime: endAt, timeZone: TZ },
      // Free, not busy — the rhythm should never make you look booked.
      transparency: 'transparent',
      reminders: mins === undefined
        ? { useDefault: false, overrides: [] }
        : { useDefault: false, overrides: [{ method: 'popup', minutes: mins }] },
      extendedProperties: {
        private: {
          source: TAG, kind, key, date: dateStr,
          syncHash: hashOf(summary, startAt, endAt)
        }
      }
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

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Calendar answers 403 for two very different things: no access, and "you're
  // going too fast". Writing ~110 events back to back reliably trips the rate
  // limiter, so the reason field decides whether to back off or give up.
  const rateLimited = body => /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(body);

  // One write, retried through rate limits with widening backoff.
  async function writeEvent(ev) {
    for (let attempt = 0; ; attempt++) {
      let res = await fetch(`${API}/calendars/${cal}/events`, {
        method: 'POST', headers, body: JSON.stringify(ev)
      });
      if (res.ok) return 'created';
      if (res.status === 409) {
        res = await fetch(`${API}/calendars/${cal}/events/${ev.id}`, {
          method: 'PUT', headers, body: JSON.stringify(ev)
        });
        if (res.ok) return 'updated';
      }
      const body = await res.text().catch(() => '');
      if ((res.status === 403 || res.status === 429) && rateLimited(body) && attempt < 5) {
        const wait = 2000 * 2 ** attempt;
        console.log(`  … rate limited, retrying in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      // Access problems fail identically for every event, so bail on the first
      // one rather than emitting a hundred copies of the same error.
      if (res.status === 401 || res.status === 404 || (res.status === 403 && !rateLimited(body))) {
        throw new Error(
          `Calendar API returned ${res.status} and it isn't a rate limit. Check that ` +
          `"${CAL}" is shared with ${sa.client_email} with "Make changes to events".\n` +
          body.slice(0, 300)
        );
      }
      console.warn(`  ! ${ev.summary} → HTTP ${res.status} ${body.slice(0, 200)}`);
      return 'failed';
    }
  }

  // One listing for the whole window beats a GET per event, and the
  // privateExtendedProperty filter means only this project's events come back.
  const existing = new Map();
  {
    // Pad the window by a day either side. timeMin/timeMax are UTC and Toronto
    // runs 4-5 hours behind it, so a tight window drops the last day's
    // late-evening blocks — they'd then miss the edit check below and get
    // overwritten even after you'd moved them by hand.
    const u = new URL(`${API}/calendars/${cal}/events`);
    u.searchParams.set('timeMin', `${iso(addDays(start, -1))}T00:00:00Z`);
    u.searchParams.set('timeMax', `${iso(addDays(start, DAYS + 1))}T00:00:00Z`);
    u.searchParams.set('privateExtendedProperty', `source=${TAG}`);
    u.searchParams.set('showDeleted', 'false');
    u.searchParams.set('maxResults', '2500');
    const res = await fetch(u, { headers });
    if (res.ok) {
      const { items = [] } = await res.json();
      for (const e of items) existing.set(e.id, e);
    }
  }

  let created = 0, updated = 0, skipped = 0, failed = 0;
  for (const day of days) {
    for (const ev of day.events) {
      const prev = existing.get(ev.id);
      if (prev) {
        // Google echoes dateTime back with the zone offset appended
        // ("...T06:45:00-04:00") while we send bare local wall time. Compare the
        // first 19 chars so a round-trip doesn't read as somebody's edit —
        // otherwise every event looks touched and the sync silently stops
        // propagating schedule.json forever.
        const wall = s => String(s || '').slice(0, 19);
        const live = hashOf(prev.summary || '', wall(prev.start?.dateTime), wall(prev.end?.dateTime));
        const ours = prev.extendedProperties?.private?.syncHash;
        if (ours && live !== ours) {
          // Edited by hand since the last sync — leave it be.
          skipped++;
          continue;
        }
        if (ours === ev.extendedProperties.private.syncHash) {
          // Already correct. Nothing to write.
          skipped++;
          continue;
        }
      }
      const r = await writeEvent(ev);
      if (r === 'created') created++; else if (r === 'updated') updated++; else failed++;
      // Cheap insurance against tripping the limiter in the first place.
      await sleep(120);
    }
  }
  console.log(`Created ${created}, updated ${updated}, left alone ${skipped}, failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
