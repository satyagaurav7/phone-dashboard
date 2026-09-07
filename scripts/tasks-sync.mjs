/*
 * Phases B and C of the task-sync plan: reconcile FLOWSTATE chores with a
 * Google Tasks list.
 *
 *   node scripts/tasks-sync.mjs                 dry run — prints the plan
 *   node scripts/tasks-sync.mjs --live          apply it (three gates, below)
 *
 * DRY RUN IS THE DEFAULT AND STAYS THE DEFAULT. Applying needs all of:
 *   1. --live on the command line,
 *   2. schedule.json  tasksSync.enabled === true,
 *   3. a credential whose scope is writable (a --readonly token cannot, and
 *      the script refuses rather than failing halfway through).
 * This mirrors the Beeminder reporter and the paused Calendar publisher: the
 * repository's habit is that writes to someone's real account are opt-in three
 * times over, not once.
 *
 * Local only, like the audit: this repository is public, so a CI log would be
 * public, and these plans name real tasks.
 *
 * IDENTITY IS A MARKER, NEVER A TITLE. Every task this creates carries
 * `flowstate:<choreId>@<occurrenceDate>` in its notes, and reconciliation reads
 * that. Two tasks called "Reset room" are not the same task, and renaming one
 * in the Google app must not orphan it. Plan section 10.
 */
import { readFileSync } from 'node:fs';
import { loadCredentials } from './tasks-audit.mjs';
import { choreCatalogue, choreState, STATUS } from '../chores.mjs';

const API = 'https://tasks.googleapis.com/tasks/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const MARKER = 'flowstate';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/tasks';

/* ---------------- pure planning (unit tested) ---------------- */

export const markerFor = (choreId, occurrenceDate) => `${MARKER}:${choreId}@${occurrenceDate}`;

export function parseMarker(notes) {
  const match = String(notes ?? '').match(/flowstate:([A-Za-z0-9_-]+)@(\d{4}-\d{2}-\d{2})/);
  return match ? { choreId: match[1], occurrence: match[2] } : null;
}

/* Google's `due` is a date; it discards time of day. Sending an RFC3339 instant
 * at UTC midnight is the documented way to express "this calendar day" and is
 * what the API echoes back. Do not encode a preferred local time here — it
 * would be silently dropped and then misread as a promise of a timed alert. */
export const dueFor = date => `${date}T00:00:00.000Z`;

/*
 * Decide what should change. Pure: takes the current Google tasks and returns
 * an intent, touching nothing.
 *
 * Rules it enforces, each from the plan:
 *  - one open occurrence per template (8.7): if a marked, incomplete task
 *    already exists for a chore, never create a second one, whatever its date;
 *  - a task completed in Google is authoritative (10): it comes back as an
 *    inbound completion for FLOWSTATE rather than being recreated;
 *  - anything without a marker is the user's own and is never touched (10:
 *    "Never bulk-delete historical or pre-existing user tasks");
 *  - nothing is ever deleted. Not once, not for tidiness.
 */
export function planSync({ sched, state = {}, today, tasks = [] }) {
  const since = state.config?.choresStart || null;
  const records = state.chores || {};
  const enabled = new Set(sched.tasksSync?.chores || choreCatalogue(sched).map(c => c.id));

  const marked = [];
  const foreign = [];
  for (const task of tasks) {
    const marker = parseMarker(task.notes);
    if (marker) marked.push({ task, ...marker });
    else foreign.push(task);
  }

  const create = [];
  const keep = [];
  const inboundCompletions = [];

  for (const chore of choreCatalogue(sched)) {
    if (!enabled.has(chore.id)) continue;
    const record = records[chore.id] || {};
    const computed = choreState({ chore, record, today, since });
    const mine = marked.filter(m => m.choreId === chore.id);

    // Completed in Google, but FLOWSTATE has no record of it: the external
    // system wins. Report it so the caller can write it back.
    for (const m of mine) {
      if (m.task.status === 'completed' && record.done?.[m.occurrence] !== true) {
        inboundCompletions.push({ choreId: chore.id, occurrence: m.occurrence, taskId: m.task.id });
      }
    }

    if (computed.status === STATUS.DONE || computed.status === STATUS.ANYTIME) continue;
    if (computed.status === STATUS.UPCOMING) continue;

    const open = mine.find(m => m.task.status !== 'completed');
    if (open) { keep.push({ choreId: chore.id, taskId: open.task.id, occurrence: open.occurrence }); continue; }

    const occurrence = computed.dueDate || today;
    // Already created and completed for this exact occurrence: do not recreate.
    if (mine.some(m => m.occurrence === occurrence && m.task.status === 'completed')) continue;

    create.push({
      choreId: chore.id,
      occurrence,
      title: chore.title,
      due: dueFor(occurrence),
      notes: markerFor(chore.id, occurrence),
    });
  }

  return { create, keep, inboundCompletions, foreign: foreign.map(t => t.id), deletes: [] };
}

/* A creation that times out is ambiguous: the task may or may not exist. The
 * plan is explicit that the API must not be assumed to insert exactly once, so
 * reconcile before retrying rather than firing again. This decides that. */
export function retryDecision({ error, marker, tasksAfterRefetch }) {
  const exists = tasksAfterRefetch.some(t => parseMarker(t.notes)?.choreId === marker.choreId
    && parseMarker(t.notes)?.occurrence === marker.occurrence);
  if (exists) return { action: 'already-created', safe: true };
  if (error?.retryable) return { action: 'retry', safe: true };
  return { action: 'pause-for-review', safe: false };
}

export function canWrite(creds) {
  return typeof creds?.scope === 'string' && creds.scope.includes(WRITE_SCOPE)
    && !creds.scope.includes('tasks.readonly');
}

/* ---------------- runner ---------------- */

async function accessToken(creds) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: creds.client_id, client_secret: creds.client_secret,
      refresh_token: creds.refresh_token, grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function main() {
  const LIVE = process.argv.includes('--live');

  if (process.env.GITHUB_ACTIONS || process.env.CI) {
    console.error('Refusing to run in CI: this repository is public, so the log would be too.');
    process.exit(2);
  }

  const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
  const creds = loadCredentials();
  if (!creds) {
    console.error('Not configured. Run: node scripts/oauth-setup.mjs --readonly --save');
    process.exit(78);
  }

  const listId = sched.tasksSync?.listId;
  if (!listId) {
    console.error('schedule.json has no tasksSync.listId. Run tasks-audit.mjs first and pick a list.');
    process.exit(78);
  }

  const token = await accessToken(creds);
  const get = async path => {
    const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  };

  const { paginate } = await import('./tasks-audit.mjs');
  const tasks = await paginate(get, `lists/${listId}/tasks`, { showCompleted: 'true', showHidden: 'true' });

  // FLOWSTATE state is not readable from here without Firestore credentials, so
  // the plan is computed against an empty local record unless one is supplied.
  const today = new Date().toISOString().slice(0, 10);
  const plan = planSync({ sched, state: sched.tasksSync?.stateForPreview || {}, today, tasks });

  console.log(`\nList ${listId} · ${tasks.length} existing tasks (${plan.foreign.length} not ours, untouched)\n`);
  for (const row of plan.create) console.log(`  create  ${row.title}  due ${row.occurrence}`);
  for (const row of plan.keep) console.log(`  keep    ${row.choreId}  (already open for ${row.occurrence})`);
  for (const row of plan.inboundCompletions) console.log(`  inbound ${row.choreId} completed in Google on ${row.occurrence}`);
  if (!plan.create.length && !plan.inboundCompletions.length) console.log('  nothing to do');
  console.log(`\nNothing is ever deleted by this script. Deletes planned: ${plan.deletes.length}\n`);

  if (!LIVE) {
    console.log('DRY RUN. Nothing was written. Re-run with --live once the gates below are set.\n');
    return;
  }
  if (sched.tasksSync?.enabled !== true) {
    console.error('Refusing --live: schedule.json tasksSync.enabled is not true.');
    process.exit(3);
  }
  if (!canWrite(creds)) {
    console.error('Refusing --live: this credential is read-only.');
    console.error('Re-mint deliberately with: node scripts/oauth-setup.mjs --save   (no --readonly)');
    process.exit(3);
  }

  for (const row of plan.create) {
    const res = await fetch(`${API}/lists/${listId}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: row.title, notes: row.notes, due: row.due }),
    });
    if (!res.ok) {
      console.error(`Failed to create ${row.choreId}: ${res.status}. Stopping rather than retrying blind.`);
      process.exit(4);
    }
    console.log(`created ${row.title}`);
  }
  console.log('\nDone. Completions made in Google are reported as inbound above; apply them in the app.\n');
}

if (process.argv[1]?.endsWith('tasks-sync.mjs')) {
  main().catch(err => { console.error(String(err.message || err)); process.exit(1); });
}
