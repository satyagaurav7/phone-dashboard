/*
 * Phase A of the task-sync plan: a READ-ONLY audit of Google Tasks and a
 * mapping preview against the FLOWSTATE chore catalogue.
 *
 *   node scripts/tasks-audit.mjs              summary to the terminal
 *   node scripts/tasks-audit.mjs --json out   also write the full report
 *
 * Needs GOOGLE_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN. Get the
 * refresh token once with scripts/oauth-setup.mjs. Nothing here writes to
 * Google: there is exactly one request helper and it only ever issues GET.
 *
 * LOCAL ONLY, AND DELIBERATELY SO. This repository is public, which makes its
 * GitHub Actions logs public too. Printing real task titles into a workflow run
 * would publish a private task list to the internet, so the script refuses to
 * start in CI. Do not "fix" that by adding a workflow — the fix would be to
 * make the repository private first, and that is Satya's decision, not ours.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://tasks.googleapis.com/tasks/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/* ---------------- pure helpers (unit tested) ---------------- */

/* Titles are matched on a normalised form, but a match is only ever a
 * CANDIDATE. Plan section 10: "Titles alone are not identity." Nothing here
 * decides a link; it proposes one for a human to confirm. */
export const normalizeTitle = value =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();

export function buildMapping(chores, tasks) {
  const byTitle = new Map();
  for (const task of tasks) {
    const key = normalizeTitle(task.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(task);
  }

  const matched = [];
  const ambiguous = [];
  const missing = [];

  for (const chore of chores) {
    const hits = byTitle.get(normalizeTitle(chore.title)) || [];
    if (hits.length === 1) matched.push({ choreId: chore.id, taskId: hits[0].id, title: chore.title });
    else if (hits.length > 1) {
      // Two Google tasks with the same title are not the same task. A human
      // decides which one, or neither.
      ambiguous.push({ choreId: chore.id, title: chore.title, candidates: hits.map(h => h.id) });
    } else missing.push({ choreId: chore.id, title: chore.title });
  }

  const claimed = new Set(matched.map(m => m.taskId));
  const unmatchedTasks = tasks.filter(t => !claimed.has(t.id)).map(t => t.id);

  return { matched, ambiguous, missing, unmatchedTasks };
}

/* Google returns tasks a page at a time and omits completed and hidden ones by
 * default. An audit that misses them would report a task as absent when it is
 * merely finished, so both are requested explicitly. */
export async function paginate(get, path, params = {}) {
  const out = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ maxResults: '100', ...params });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await get(`${path}?${query}`);
    out.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

export function summarise(lists) {
  return lists.map(list => ({
    id: list.id,
    title: list.title,
    total: list.tasks.length,
    open: list.tasks.filter(t => t.status !== 'completed').length,
    completed: list.tasks.filter(t => t.status === 'completed').length,
    dated: list.tasks.filter(t => t.due).length,
    // The API stores `due` as a date and discards any time of day. Recording
    // this so nobody later promises timed reminders it cannot deliver.
    withTimeOfDay: list.tasks.filter(t => t.due && !/T00:00:00/.test(t.due)).length,
  }));
}

/* ---------------- runner ---------------- */

/* Credentials come from the environment, or from the local file written by
 * `oauth-setup.mjs --save`. The file exists so the refresh token never has to
 * be copied through a terminal transcript or a chat window. */
export function loadCredentials(env = process.env, credPath = new URL('../.google-oauth.json', import.meta.url)) {
  const fromEnv = {
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
  };
  if (fromEnv.client_id && fromEnv.client_secret && fromEnv.refresh_token) return { ...fromEnv, source: 'env' };
  if (existsSync(credPath)) {
    const file = JSON.parse(readFileSync(credPath, 'utf8'));
    if (file.client_id && file.client_secret && file.refresh_token) return { ...file, source: '.google-oauth.json' };
  }
  return null;
}

async function accessToken(creds) {
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function main() {
  if (process.env.GITHUB_ACTIONS || process.env.CI) {
    console.error('Refusing to run in CI: this repository is public, so the run log would be public too.');
    console.error('Run it locally instead: node scripts/tasks-audit.mjs');
    process.exit(2);
  }

  const creds = loadCredentials();
  if (!creds) {
    console.error('Not configured — no credentials in the environment or .google-oauth.json.');
    console.error('Run this once:');
    console.error('  GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy node scripts/oauth-setup.mjs --readonly --save');
    process.exit(78);
  }
  console.log(`Credentials from ${creds.source}. Scope: ${creds.scope || 'unknown'}`);

  const token = await accessToken(creds);
  const get = async path => {
    const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  };

  const lists = await paginate(get, 'users/@me/lists');
  const detailed = [];
  for (const list of lists) {
    const tasks = await paginate(get, `lists/${list.id}/tasks`, { showCompleted: 'true', showHidden: 'true' });
    detailed.push({ ...list, tasks });
  }

  const sched = JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url), 'utf8'));
  const chores = sched.chores || [];

  console.log('\nRead-only. Nothing was written to Google.\n');
  console.table(summarise(detailed));

  for (const list of detailed) {
    const map = buildMapping(chores, list.tasks);
    console.log(`\n${list.title}: ${map.matched.length} candidate matches, ` +
      `${map.ambiguous.length} ambiguous, ${map.missing.length} chores with no task, ` +
      `${map.unmatchedTasks.length} tasks not in the catalogue`);
    for (const row of map.ambiguous) console.log(`  ambiguous, needs review: ${row.title}`);
  }

  console.log('\nCandidate matches are proposals, not links. Titles alone are not identity.');
  console.log('No write has been enabled. Phase B needs explicit approval.\n');

  const jsonFlag = process.argv.indexOf('--json');
  if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
    const path = process.argv[jsonFlag + 1];
    writeFileSync(path, JSON.stringify({
      generatedAt: new Date().toISOString(),
      lists: detailed.map(list => ({ ...list, mapping: buildMapping(chores, list.tasks) })),
    }, null, 2));
    console.log(`Full report written to ${path}.`);
    console.log('It contains real task titles. Keep it out of the repository.\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tasks-audit.mjs')) {
  main().catch(err => { console.error(String(err.message || err)); process.exit(1); });
}
