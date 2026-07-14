# Notifications — one-time setup (your part)

The code is done. Push needs two keys that only you can generate, plus installing
the app on your phone. ~10 minutes total, in this order.

## 1. VAPID key → index.html

1. Open [Firebase console](https://console.firebase.google.com/) → project **newt** → ⚙️ **Project settings** → **Cloud Messaging** tab.
2. Under **Web configuration → Web Push certificates**, click **Generate key pair**.
3. Copy the key (starts with `B...`, ~87 characters).
4. In `index.html`, find `const VAPID_KEY = '';` and paste it between the quotes.
5. Commit + push. Until this is done, the app hides all notification UI.

## 2. Service account → GitHub secret

1. Same settings page → **Service accounts** tab → **Generate new private key** → a JSON file downloads.
2. GitHub → `satyagaurav7/phone-dashboard` → **Settings → Secrets and variables → Actions → New repository secret**.
3. Name: `FIREBASE_SERVICE_ACCOUNT` · Value: the **entire contents** of that JSON file.
4. Delete the downloaded JSON afterwards — it's a master key to the Firebase project.

## 3. Install the app + enable notifications (phone)

1. Open https://satyagaurav7.github.io/phone-dashboard/ in Chrome on your phone.
2. Chrome menu (⋮) → **Add to Home screen** → it should now say **Install app** (that's the PWA working).
3. Open the installed app, sign in, and on the Today tab tap **🔔 Enable notifications → Allow**.
4. You should see "Notifications on" and the card disappears. The device is now registered.

## 4. Send a test push

1. GitHub → repo → **Actions** tab → **Notifications** workflow → **Run workflow**.
2. Mode: `brief`, force: ✅ → **Run**.
3. Within ~1 minute the morning brief should hit your phone's lock screen. Tap it — it opens the dashboard.
4. Optionally run again with mode `streak` (it stays silent if today's 5 core habits are already stamped — that's correct behavior).

## After that, it runs itself

- **7:00 AM** — morning brief (schedule + any money/PR deadline within 3 days).
- **9:00 PM** — streak saver, only on days you haven't checked in.
- GitHub cron can run up to ~15 min late; that's normal.
- New phone or reinstalled Chrome? Just open the app and tap Enable notifications again.

## If pushes stop arriving

1. Open the app once (it silently refreshes the device token on every open).
2. Check Actions tab for red runs — the log says exactly what failed.
3. Android Settings → Apps → Chrome → Battery → set to **Unrestricted** (some phones deep-sleep Chrome).
