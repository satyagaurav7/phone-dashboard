# Notifications & Usability Plan

*Written 2026-07-13. Goal: make the dashboard pull Satya back in, instead of waiting to be remembered.*

> **STATUS 2026-07-14: Phases 1–5 are built.** All code is in the repo; the sender
> logic, PWA shell, Right Now card, and timetable extraction are tested. What's left
> is the one-time manual setup only you can do (Firebase keys + installing on your
> phone) — follow **NOTIFICATIONS-SETUP.md**, top to bottom.

## The problem

The app works, but nothing brings you to it. "Out of sight, out of mind." The fix is
two high-signal notifications per day — never more — plus a first screen that makes
each visit worth it in under 5 seconds.

## What you'll get

1. **7:00 AM — Morning Brief** (push notification, every day)
   - Today's day type + first key blocks from the timetable ("Office day — bus 7:37, gym 6:25pm")
   - Any money deadline within 3 days or due today (rent, card due date)
   - Any PR date within 3 days or today (permit expiry, CELPIP retest, CEC eligibility)
   - Tap → opens the dashboard.

2. **9:00 PM — Streak Saver** (push notification, *only if* today isn't checked in)
   - "Streak dies at midnight — 3 hours left. Check in now."
   - If you already checked in, it never fires. Silence is the reward.

3. **"Right Now" card** — the first thing you see when the app opens:
   - Current or next timetable block with a one-tap DONE stamp
   - Streak status (safe / at risk)
   - Everything else stays a tab away.

Volume cap: max 2/day, usually 1. Money/PR alerts fold into the brief — no extra pings.

## Architecture

```
┌─ Phone (Android/Chrome) ─────────────┐
│ Dashboard installed as PWA           │
│ manifest.json + service worker       │
│ FCM token saved → Firestore          │
└──────────────▲───────────────────────┘
               │ push (FCM HTTP v1)
┌──────────────┴───────────────────────┐
│ GitHub Actions (this repo, free)     │
│ cron 7:00 & 21:00 America/Toronto    │
│ scripts/notify.mjs + firebase-admin  │
│ reads dashboard/satya + schedule.json│
└──────────────────────────────────────┘
```

- **No new services, no cost.** GitHub Actions (already used for Pages deploy) sends
  the pushes; Firebase Cloud Messaging delivers them. FCM sending via service account
  is free — no Blaze plan needed because we skip Cloud Functions entirely.
- **Data the sender needs** already lives in Firestore (`dashboard/satya`: rentDay,
  ccDay, permit, celpipExam, cecDate, today's habit state) — except the timetable,
  which is hardcoded in `index.html`. Phase 3 extracts it to `schedule.json` so both
  the app and the sender read one source of truth.

---

## Phase 1 — Make it a real PWA

*Prereq for push on Android; also gives a proper app icon and full-screen launch.*

- `manifest.json`: name, theme colors (passport navy), `display: standalone`, start URL.
- App icons (192px, 512px) — generate a passport-stamp style icon.
- `sw.js` service worker: minimal — cache-first for the shell, network-first for
  freshness (the app is one file; keep this simple, no offline heroics).
- Link manifest + register SW in `index.html`.
- **Done when:** Chrome on the phone offers "Add to Home screen" as an *install*
  (not a shortcut), and the app launches full-screen with its own icon.

## Phase 2 — Push plumbing (client side)

- Firebase console (one-time, manual):
  - Project settings → Cloud Messaging → generate a **Web Push (VAPID) key pair**.
  - Service accounts → generate a **service account JSON** key.
- `firebase-messaging-sw.js`: background message handler; tap opens/focuses the app.
- In `index.html`: a small "Enable notifications" card (shown once, on the Today tab)
  that requests permission, gets the FCM token, and writes it to
  `dashboard/satya.fcmTokens` (array — supports phone + laptop later).
- Token refresh: re-save the token on every app open (tokens rotate; this is the
  standard fix and costs one Firestore write).
- **Done when:** a test message sent from the Firebase console notifications composer
  lands on the phone's lock screen with the app closed.

## Phase 3 — Extract the timetable

- Move `SCHEDS` + the day-type mapping (which weekday uses which schedule) out of
  `index.html` into `schedule.json` in the repo.
- `index.html` fetches it at load (same-origin, cached by the SW).
- **Done when:** Plan tab renders identically to before, from the JSON.

## Phase 4 — The sender (GitHub Actions)

- Repo secret: `FIREBASE_SERVICE_ACCOUNT` (the JSON from Phase 2).
- `scripts/notify.mjs` (Node + `firebase-admin`):
  - `--mode=brief`: read Firestore config + `schedule.json`, compose the morning
    brief, send to all saved tokens. Deadline logic: include an item if it's due
    within 3 days; mark it **DUE TODAY** on the day.
  - `--mode=streak`: read today's habit entry; if all-clear, exit silently;
    otherwise send the streak-saver.
  - Prune tokens that FCM reports as dead (`messaging/registration-token-not-registered`).
- `.github/workflows/notify.yml`:
  - Brief: `cron: '0 11 * * *'` **and** `'0 12 * * *'` (UTC). Script checks the hour
    in America/Toronto and only proceeds at 7 AM local — this handles DST with zero
    maintenance. Same pattern for 9 PM (`'0 1 * * *'` and `'0 2 * * *'`).
- **Done when:** the brief arrives at ~7 AM with real schedule + deadline content,
  and the streak-saver fires only on an unchecked evening (test both states).

## Phase 5 — "Right Now" card

- New card pinned to the top of the Today tab (the app already opens there):
  - Looks up the current time against today's schedule → shows the active or next
    block ("Now: GYM until 7:25 PM") with a one-tap DONE stamp (same stamping logic
    the Plan tab already has).
  - Streak line: "Day 14 — safe ✓" or "NOT CHECKED IN — streak at risk."
  - If a money/PR item is due today, it appears here in red.
- **Done when:** opening the app answers "what should I do right now?" in one glance,
  with one tap to act.

## Phase 6 — Polish (optional, only if Phases 1–5 stick)

- Notification settings mini-panel in the app: toggle brief/streak, change times
  (writes to Firestore config; the sender script reads it).
- "Send test notification" button.
- App badge count for unchecked days (Badging API).

---

## Order & effort

| Phase | Depends on | Effort |
|-------|-----------|--------|
| 1 PWA | — | ~1 hour |
| 2 Push plumbing | 1 | ~2 hours + Firebase console steps |
| 3 Extract timetable | — | ~1 hour |
| 4 Sender | 2, 3 | ~3 hours |
| 5 Right Now card | 3 | ~2 hours |
| 6 Polish | 4, 5 | as desired |

Phases 1+2 ship first (test push proves the pipe works), then 3+4 (the real content),
then 5. Each phase is a separate commit and is independently verifiable.

## Risks & honest caveats

- **GitHub Actions cron drifts** — runs can start up to ~15 min late at busy times.
  For a 7 AM brief that's acceptable; if it ever bothers you, the fallback is
  Cloud Scheduler (still free tier) — noted here so future-us doesn't re-research it.
- **Android battery optimization** can delay FCM for aggressively-managed OEMs
  (Samsung/Xiaomi "deep sleep"). Fix if seen: exempt Chrome from battery optimization.
- **Token rot**: handled by re-saving on app open + pruning dead tokens in the sender.
- **The 9 PM check needs to know "checked in"** — defined as: all 5 core habits
  stamped (DONE or DENIED) for today. A DENIED day still counts as checked in —
  honest by design; the notification nags about silence, not failure.
