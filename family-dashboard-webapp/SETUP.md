# Close Knit — web app setup

This turns the dashboard into a real multi-user web app: everyone signs in with
their Google account, and changes sync live to everyone else. It runs on
Firebase (Google's free hosting/database/auth platform), so there's no ongoing
cost at family scale.

You'll need about 15 minutes and a Google account.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com and sign in.
2. Click **Add project**, give it a name (e.g. "family-dashboard"), and finish
   the wizard (you can turn off Google Analytics — not needed here).

## 2. Turn on Google Sign-In

1. In the Firebase console, left sidebar → **Build → Authentication**.
2. Click **Get started**, then under **Sign-in method** enable **Google**.
3. Pick a support email (your own) and save.

## 3. Create the database

1. Left sidebar → **Build → Firestore Database** → **Create database**.
2. Choose a location close to the UK (e.g. `europe-west2`).
3. Start in **production mode** (the security rules in this project handle
   access control — you don't need test mode).

## 4. Register a web app and get your config

1. In the Firebase console, click the gear icon → **Project settings**.
2. Under **Your apps**, click the **</>** (web) icon to add a web app.
3. Give it any nickname, click **Register app** — you don't need Firebase
   Hosting set up at this step, just click through.
4. You'll see a code block with a `firebaseConfig` object. Copy the values
   into `public/firebase-config.js` in this project, replacing the
   `YOUR_...` placeholders.

## 5. Set who's allowed in

Open `public/firebase-config.js` and check the `ALLOWED_EMAILS` list has
everyone who should have access — it currently has:

- nishb85@gmail.com
- sannish16@gmail.com
- 16marinaclose@gmail.com

Add or remove addresses as needed. **Then copy the exact same list** into
`firestore.rules` (the `isFamilyMember()` function) — the two lists must
match, since `firebase-config.js` controls what the app shows and
`firestore.rules` controls what the database actually allows. If they don't
match, someone could see the sign-in screen but get errors loading data (or
vice versa).

## 6. Install the Firebase CLI and deploy

In a terminal, from this project's folder:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick the project you created in step 1
firebase deploy
```

`firebase deploy` publishes both the Firestore security rules and the web
app. At the end it prints a **Hosting URL** — that's the link your family
uses (looks like `https://your-project.web.app`). Bookmark it, or add it to
each phone's home screen.

## 7. First sign-in

The first person to sign in seeds the starter data (Nish, Sangi, Hazel, Rolo
as members, plus the calendar events imported from 16marinaclose@gmail.com on
14 Aug 2026). After that, everyone signed in sees the same live data —
ticking off a task on one phone updates it everywhere immediately.

## Making changes later

If you (via Claude) update the app's code, you only need to re-run
`firebase deploy` from this folder to push the update — the family's data in
Firestore is untouched by a redeploy.

## Costs

Firebase's free "Spark" tier covers this comfortably: Hosting (10GB storage,
360MB/day transfer), Firestore (1GB storage, 50k reads/20k writes per day),
and unlimited Google Sign-Ins. A household to-do list won't come close to
those limits.
