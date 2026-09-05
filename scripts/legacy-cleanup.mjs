/*
 * Retires the pre-existing recurring schedule from the target calendar so the
 * FLOWSTATE rhythm is the only thing on it.
 *
 *   node legacy-cleanup.mjs --backup           write every recurring series to a file
 *   node legacy-cleanup.mjs --list             show what --delete would remove
 *   node legacy-cleanup.mjs --delete           remove them (refuses without a backup)
 *
 * Only touches recurring series that this project did NOT create: anything
 * tagged source=flowstate-rhythm is skipped, and so is any one-off event, so a
 * real appointment someone added by hand is never in scope.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { JWT } from 'google-auth-library';

const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
const CAL = process.env.CALENDAR_ID || sched.calendarId;
const TAG = 'flowstate-rhythm';
const BACKUP = new URL('../legacy-calendar-backup.json', import.meta.url);
const API = 'https://www.googleapis.com/calendar/v3';

const MODE = process.argv.includes('--delete') ? 'delete'
  : process.argv.includes('--backup') ? 'backup' : 'list';

const sa = JSON.parse(process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT || 'null');
if (!sa) { console.error('GOOGLE_CALENDAR_SERVICE_ACCOUNT is missing.'); process.exit(1); }
const auth = new JWT({
  email: sa.client_email, key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/calendar.events']
});
const { token } = await auth.getAccessToken();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const cal = encodeURIComponent(CAL);

// singleEvents=false returns the recurring series itself rather than each
// expanded occurrence, which is what has to be deleted to stop it repeating.
const u = new URL(`${API}/calendars/${cal}/events`);
u.searchParams.set('singleEvents', 'false');
u.searchParams.set('showDeleted', 'false');
u.searchParams.set('maxResults', '2500');
const res = await fetch(u, { headers: H });
if (!res.ok) { console.error(`HTTP ${res.status}\n${(await res.text()).slice(0, 400)}`); process.exit(1); }
const { items = [] } = await res.json();

const legacy = items.filter(e =>
  Array.isArray(e.recurrence) &&
  e.extendedProperties?.private?.source !== TAG &&
  e.status !== 'cancelled'
);

const when = e => (e.start?.dateTime || e.start?.date || '').slice(11, 16) || 'all-day';
console.log(`${CAL} · ${items.length} event(s) total · ${legacy.length} recurring series not created by FLOWSTATE\n`);
for (const e of legacy) {
  console.log(`  ${when(e).padEnd(6)} ${(e.summary || '(no title)').slice(0, 56)}`);
  for (const r of e.recurrence) console.log(`         ${r}`);
}

if (MODE === 'backup') {
  writeFileSync(BACKUP, JSON.stringify({
    calendar: CAL, savedAt: new Date().toISOString(), count: legacy.length, events: legacy
  }, null, 2));
  console.log(`\nBacked up ${legacy.length} series to ${BACKUP.pathname.slice(1)}`);
  console.log('Recreate one later by POSTing its object back to the events endpoint.');
}

if (MODE === 'list') {
  console.log('\nThis was a dry run. --backup saves them, --delete removes them.');
}

if (MODE === 'delete') {
  // Deleting a recurring series is not recoverable through the UI, so refuse
  // unless the backup file is actually sitting there.
  if (!existsSync(BACKUP)) {
    console.error('\nNo legacy-calendar-backup.json found. Run --backup first.');
    process.exit(1);
  }
  let gone = 0, failed = 0;
  for (const e of legacy) {
    const r = await fetch(`${API}/calendars/${cal}/events/${e.id}`, { method: 'DELETE', headers: H });
    if (r.ok || r.status === 410) { gone++; } else { failed++; console.warn(`  ! ${e.summary} → HTTP ${r.status}`); }
    await new Promise(s => setTimeout(s, 150));
  }
  console.log(`\nDeleted ${gone}, failed ${failed}.`);
}
