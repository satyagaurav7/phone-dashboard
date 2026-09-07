/*
 * One-time Google OAuth consent, run locally, to get a refresh token for Tasks.
 *
 * Google Tasks has no sharing model, so the service-account trick that works
 * for Calendar is not available: a consumer account's task list can only be
 * reached by a token the account holder personally consented to. This script
 * does that once and prints a refresh token that GitHub Actions can reuse
 * forever after.
 *
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node oauth-setup.mjs
 *
 * It opens a consent URL, catches the redirect on localhost, and prints the
 * refresh token. Nothing is written to disk — you paste it into GitHub
 * yourself, the same as every other credential in this project.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync, chmodSync, readFileSync } from 'node:fs';

/* Environment first, but fall back to asking. Putting a client secret on a
 * command line writes it into shell history, where it outlives its usefulness;
 * typing it at a prompt does not. */
async function ask(question) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

/* Third source: a local file the account holder writes themselves. It exists so
 * the client secret can reach this script without being typed onto a command
 * line, pasted into a chat, or read by anyone else — including whoever is
 * driving this repository. Gitignored, and never printed back. */
const CLIENT_FILE = new URL('../.google-client.json', import.meta.url);

let CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
let CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  try {
    const file = JSON.parse(readFileSync(CLIENT_FILE, 'utf8'));
    CLIENT_ID = CLIENT_ID || file.client_id;
    CLIENT_SECRET = CLIENT_SECRET || file.client_secret;
    if (CLIENT_ID && CLIENT_SECRET) console.log('Using client details from .google-client.json');
  } catch { /* absent or unreadable: fall through to the prompt */ }
}

if ((!CLIENT_ID || !CLIENT_SECRET) && process.stdin.isTTY) {
  console.log('\nFrom console.cloud.google.com → APIs & Services → Credentials.');
  console.log('Nothing typed here is written to the repository or printed back.\n');
  CLIENT_ID = CLIENT_ID || await ask('Client ID: ');
  CLIENT_SECRET = CLIENT_SECRET || await ask('Client secret: ');
}
const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
/* Scope is chosen per run. The Phase A audit only reads, so mint it with
 * --readonly and the resulting token physically cannot modify a task, however
 * it is later misused. Plan section 10: minimum necessary scope. Ask for the
 * writable scope only when a write has actually been approved. */
const READONLY = process.argv.includes('--readonly');
const SCOPE = READONLY
  ? 'https://www.googleapis.com/auth/tasks.readonly'
  : 'https://www.googleapis.com/auth/tasks';
const SAVE = process.argv.includes('--save');
const CRED_PATH = new URL('../.google-oauth.json', import.meta.url);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'No client details found. Any one of these works:\n' +
    '  - write .google-client.json in the project root:\n' +
    '      {"client_id": "...", "client_secret": "..."}\n' +
    '  - run this in an interactive terminal and be prompted\n' +
    '  - set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET\n\n' +
    'Create them at console.cloud.google.com → APIs & Services → Credentials →\n' +
    'Create credentials → OAuth client ID → Web application, with redirect URI\n' +
    `exactly: ${REDIRECT}`
  );
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
// Without both of these Google returns only an access token on repeat runs,
// and the whole point here is the long-lived refresh token.
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('state', state);

console.log('\nOpen this in the browser where you are signed in as booms.satya@gmail.com:\n');
console.log(authUrl.toString());
console.log(`\nScope: ${SCOPE}`);
console.log(READONLY ? 'Read-only: this token cannot modify anything.' : 'WRITABLE token — only do this once a write is actually approved.');
console.log('\nWaiting for the redirect on localhost…\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }

  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`Consent failed: ${err}`);
    console.error(`Consent failed: ${err}`);
    server.close();
    process.exitCode = 1;
    return;
  }
  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('State mismatch.');
    console.error('State mismatch — ignoring this redirect.');
    return;
  }

  const code = url.searchParams.get('code');
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT, grant_type: 'authorization_code'
    })
  });
  const data = await tok.json();

  if (!data.refresh_token) {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('No refresh token returned. Check the terminal.');
    console.error('No refresh token came back:', JSON.stringify(data, null, 2));
    console.error('\nIf this account already granted consent, revoke it at');
    console.error('myaccount.google.com/permissions and run this again.');
    server.close();
    process.exitCode = 1;
    return;
  }

  if (SAVE) {
    // Written locally so the refresh token never has to travel through a
    // terminal transcript, a chat window or a clipboard. Gitignored, and
    // tasks-audit.mjs reads it directly. It is still a real credential sitting
    // on disk: delete it when you are done, and revoke the grant at
    // myaccount.google.com/permissions.
    writeFileSync(CRED_PATH, JSON.stringify({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: data.refresh_token, scope: SCOPE,
      created: new Date().toISOString(),
    }, null, 2));
    try { chmodSync(CRED_PATH, 0o600); } catch {}
    console.log('\nSaved to .google-oauth.json (gitignored, owner-only).');
    console.log('The audit reads it directly; nothing needs copying anywhere.');
    console.log('Delete it when done; revoke at myaccount.google.com/permissions.\n');
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
    .end('<h2>Done.</h2><p>Refresh token is in your terminal. You can close this tab.</p>');

  console.log('='.repeat(70));
  console.log('REFRESH TOKEN (store as GitHub secret GOOGLE_OAUTH_REFRESH_TOKEN):\n');
  console.log(data.refresh_token);
  console.log('\n' + '='.repeat(70));
  console.log('Also store GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET as secrets.');
  console.log('Treat this token like a password: it grants ongoing access to your tasks.');
  server.close();
});

server.listen(PORT);
