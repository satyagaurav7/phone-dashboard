# How this app is wired (current setup)

**Live app:** https://satyagaurav7.github.io/phone-dashboard/
Hosted on **GitHub Pages** from `satyagaurav7/phone-dashboard`, `main` branch. Every push rebuilds the site in ~40 seconds.

## Data & auth (Firebase project `newt`, id `newt-90ca4`)

- **Authentication:** Email/Password provider enabled. One account: `booms.satya@gmail.com` (created manually in the Firebase console → Authentication → Users). The app's password gate signs into this account — same password on every device.
- **Firestore:** all dashboard state lives in a single document, `dashboard/satya` (database `(default)`, location `nam5`, created in production mode).
- **Rules:** any signed-in user can read/write that one document:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /dashboard/satya {
      allow read, write: if request.auth != null;
    }
  }
}
```

- The `apiKey` in `index.html` is safe to be public — Firebase security is enforced by auth + rules, not by hiding the key.

## Editing flow

1. Local working copy: `C:\Users\Satya\Downloads\Projects\phone-dashboard`
2. Edit `index.html` (it's the whole app — UI + Firebase sync in one file)
3. `git add . && git commit -m "..." && git push` → live in ~40s
4. Data survives edits — it lives in Firestore, not in the file.

---

*Note: an earlier version of this file described a Netlify + `satya-mission-control` plan that was never built. The above is what actually exists.*
