# Live Sync Setup (your one-time ~10 min)

Goal: your dashboard's data lives privately in the cloud, so phone + PC + anywhere show the **same live data**. You do the account setup below, paste me the config, and I build the synced dashboard.

**It's free** (Firebase free tier is way more than you'll use). The `apiKey` you'll copy is *safe to be public* — Firebase security is enforced by login + rules, not by hiding the key.

---

## Step 1 — Create the project
1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project** → name it `satya-mission-control` → Continue.
3. Turn **off** Google Analytics (not needed) → **Create project** → wait → Continue.

## Step 2 — Add a web app + copy the config
4. On the project home, click the **`</>` (Web)** icon ("Add app").
5. Nickname it `dashboard` → **Register app**.
6. It shows a code block with `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }`.
   👉 **Copy that whole `firebaseConfig` block and paste it to me in chat.**

## Step 3 — Turn on Login
7. Left menu → **Build → Authentication** → **Get started**.
8. Open the **Sign-in method** tab → click **Email/Password** → toggle **Enable** → **Save**.

## Step 4 — Turn on the database
9. Left menu → **Build → Firestore Database** → **Create database**.
10. Choose **Start in production mode** → Next.
11. Location: pick **`northamerica-northeast1` (Montreal)** (closest to you) → **Enable**.

## Step 5 — Paste the security rules
12. In Firestore, open the **Rules** tab, delete what's there, paste this, click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

This locks your data so only *you* (logged in) can read or write it.

---

## Step 6 — Send me the config
Paste the `firebaseConfig` block from Step 2 into chat. Then I'll:
- Rebuild the dashboard with a simple login + real-time cloud sync,
- You redeploy the new file to Netlify,
- Log in on your phone and PC with the same email/password → **same live data everywhere.**

(You'll create your login email + password the first time you open the rebuilt dashboard.)
