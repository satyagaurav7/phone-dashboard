# Google Tasks — setup (your part)

Makes *"Hey Google, what are my tasks today?"* answer, and gives ChatGPT on
your phone a real to-do list to write into.

**Why this is more work than Calendar was.** Calendar works because a calendar
can be *shared* with a service account. Google Tasks has no sharing model at
all — a consumer account's tasks are reachable only by a token you personally
consented to. So this needs an OAuth client and a one-time consent, and there
is no way around that.

## What lands in Tasks

A dedicated list called **FLOWSTATE**, holding the anchor plus the day's big
wins — 7 items on a WFH day:

```
Anchor ⚓
Gym — 07:10
CELPIP 20 min — 17:15
Upskill hour — 17:45
Money move — 17:45
Full cooked day — 19:45
Smoke-free stamp — 21:45
```

Not all 21 tap items. Read aloud, twenty-one is noise you stop listening to;
seven is a list you can answer to. Small wins stay in the dashboard where
tapping them is one thumb press.

**Yesterday's unfinished items get deleted, not carried over.** Overdue badges
are a punishment mechanic and this project removed those deliberately — a
missed day should cost momentum, not pile up debt. Completions you tick during
the day survive the next sync.

Your **default** task list is untouched, so anything you or ChatGPT adds by
hand stays put and is never cleaned up by this.

## 1. Enable the API

[Enable Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com?project=data-collection-399923)
on project `data-collection-399923`.

## 2. Create an OAuth client

1. [Credentials](https://console.cloud.google.com/apis/credentials?project=data-collection-399923)
   → **Create credentials → OAuth client ID**.
2. If it asks you to configure the consent screen first: **External**, app name
   `FLOWSTATE`, your email for both support fields, **Save and continue**
   through the rest. Under **Audience**, add `booms.satya@gmail.com` as a test
   user — otherwise consent expires in 7 days.
3. Application type **Web application**, name `flowstate-tasks`.
4. Authorised redirect URI, exactly:
   ```
   http://localhost:8765/callback
   ```
5. Create. Keep the client ID and client secret on screen for the next step.

## 3. Mint the refresh token

From `scripts/`, signed into Chrome as **booms.satya@gmail.com**:

```bash
GOOGLE_OAUTH_CLIENT_ID='<id>' GOOGLE_OAUTH_CLIENT_SECRET='<secret>' node oauth-setup.mjs
```

It prints a consent URL, catches the redirect on localhost, and prints a
refresh token. Google shows an "unverified app" warning — that's expected for a
personal client; continue past it.

## 4. Three GitHub secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | from step 2 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from step 2 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | from step 3 |

The refresh token is a password to your task list. It doesn't expire on a
timer, but it dies if you revoke access at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) —
re-run step 3 if that happens.

## 5. Test

```bash
node sync-tasks.mjs --dry-run
```

prints the list without writing. Drop `--dry-run` to write it for real, then
ask the speaker:

> *"Hey Google, what are my tasks today?"*

If it says you have none, check the Home app → Settings → Services → Tasks and
confirm it's on `booms.satya@gmail.com`.

## After that

The **Calendar sync** workflow runs both steps daily at ~7 AM. Tasks runs even
if the calendar step fails — separate credentials, separate failure modes, and
one breaking shouldn't quietly take the other down.
