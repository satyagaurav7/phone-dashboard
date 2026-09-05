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

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/tasks';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first.\n' +
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
