# Close Knit — web app setup

This turns the dashboard into a real multi-user web app: everyone signs in with
their Google account, and changes sync live to everyone else. It runs on
Firebase (Google's free hosting/database/auth platform), so there's no ongoing
cost at family scale. The app itself is a Node/Vite project — plain
JavaScript, no framework — split into small modules under `src/`.

You'll need about 15 minutes, a Google account, and [Node.js](https://nodejs.org) installed.

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
4. You'll see a code block with a `firebaseConfig` object. Copy `.env.example`
   to `.env` in this project's root, and fill in the `VITE_FIREBASE_*` values
   from that config block.

## 5. Set who's allowed in

In `.env`, check `VITE_ALLOWED_EMAILS` has everyone who should have access —
it currently defaults to:

- nishb85@gmail.com
- sannish16@gmail.com
- 16marinaclose@gmail.com
- hazeldia7@gmail.com
- leescu.paul@gmail.com
- leescu.paul@googlemail.com

Add or remove addresses as needed (comma-separated, no spaces needed).
**Then copy the exact same list** into `firestore.rules` (the
`isFamilyMember()` function) — the two lists must match, since `.env`
controls what the app shows and `firestore.rules` controls what the database
actually allows. If they don't match, someone could see the sign-in screen but
get errors loading data (or vice versa). `VITE_FINANCE_EMAILS` and
`isFinanceMember()` work the same way, for the Finance tab.

## 6. Install dependencies

```bash
npm install
```

## 7. Run it locally (optional)

```bash
npm run dev
```

This starts a local dev server (with hot reload) so you can try changes
before deploying.

## 8. Install the Firebase CLI and deploy

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick the project you created in step 1
npm run build              # builds the app into dist/
firebase deploy
```

`firebase deploy` publishes both the Firestore security rules and the built
web app in `dist/`. At the end it prints a **Hosting URL** — that's the link
your family uses (looks like `https://your-project.web.app`). Bookmark it, or
add it to each phone's home screen.

## 9. First sign-in

The first person to sign in seeds the starter data (Nish, Sangi, Hazel, Rolo
as members, plus the calendar events imported from 16marinaclose@gmail.com on
14 Aug 2026). After that, everyone signed in sees the same live data —
ticking off a task on one phone updates it everywhere immediately.

## Making changes later

If you (via Claude) update the app's code, run `npm run build && firebase
deploy` from this folder to push the update — the family's data in Firestore
is untouched by a redeploy.

## Project structure

```
src/
  main.js            entry point — wires up every feature module
  config/env.js       reads .env into typed config (Firebase config, allow-lists)
  firebase/           Firestore/Auth client + a thin data-access layer + live sync
  state/               in-memory app state and a small pub-sub store
  auth/                 sign-in/sign-out wrappers around Firebase Auth
  utils/                date/text/money formatting helpers
  features/            one file per tab (tasks, calendar, grocery, finance, …),
                        each owning its own render + event wiring
  styles/main.css      all styling (extracted from the old inline <style> block)
```

## Costs

Firebase's free "Spark" tier covers this comfortably: Hosting (10GB storage,
360MB/day transfer), Firestore (1GB storage, 50k reads/20k writes per day),
and unlimited Google Sign-Ins. A household to-do list won't come close to
those limits.
