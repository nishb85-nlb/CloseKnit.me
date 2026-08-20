# Close Knit — Firebase to Supabase migration

This replaces Firestore (database) and Firebase Auth (sign-in) with Supabase.
Everything else — the UI, the build tooling, the feature modules — is
untouched, because the app was already written with a thin data-access layer
(`src/firebase/collections.js`) that every feature imports through rather
than talking to Firestore directly. I've already written a Supabase version
of that same layer, so no feature file needed a rewrite — just an import path
change, which I've also already made.

**What I've already done for you** (files written straight into this folder):

- `supabase/schema.sql` — the Postgres tables, one per Firestore collection
- `supabase/policies.sql` — row-level security, replacing `firestore.rules`
- `src/supabase/client.js` — new Supabase client (replaces `src/firebase/client.js`)
- `src/supabase/collections.js` — new data-access layer (replaces `src/firebase/collections.js`)
- `src/supabase/sync.js` — moved as-is (replaces `src/firebase/sync.js`)
- `src/auth/authService.js` — rewritten for Supabase Auth
- `src/config/env.js` — rewritten for Supabase env vars
- `src/features/authUI.js` — rewritten for Supabase's user object shape
- `src/features/{tasks,grocery,shopping,finance,holidays,wishlist,members,calendar,importExport}.js` — one-line import path change each (`../firebase/collections.js` → `../supabase/collections.js`)
- `.env.example` — new Supabase variables

**What only you can do** (needs your Google/Supabase accounts): create the
Supabase project, turn on Google sign-in, and fill in `.env`. Steps below.

## 1. Create a Supabase project

1. Go to https://supabase.com, sign in (or create an account — free tier is
   plenty for this), and click **New project**.
2. Pick an organisation, name it (e.g. "close-knit"), set a database
   password (save it somewhere — you likely won't need it day-to-day, but
   it's your Postgres superuser password), and choose a region close to the
   UK (e.g. `eu-west-2` London).
3. Wait a minute or two for it to provision.

## 2. Create the database tables and security rules

1. In the Supabase dashboard, left sidebar → **SQL Editor** → **New query**.
2. Paste the contents of `supabase/schema.sql`, click **Run**.
3. New query again, paste the contents of `supabase/policies.sql`, click **Run**.

This creates all nine tables (members, tasks, events, grocery, shopping,
debts, payments, holidays, wishlist), turns on row-level security so only
signed-in family emails can read/write, restricts debts/payments to the
finance emails, and switches on realtime so the app gets live updates —
same behaviour as `firestore.rules` had, just as SQL.

## 3. Turn on Google sign-in

Unlike Firebase, Supabase doesn't manage a Google OAuth client for you — you
register one yourself in Google Cloud, then paste its details into Supabase.

1. Go to https://console.cloud.google.com, create or pick a project.
2. **APIs & Services → OAuth consent screen** — set it up (External, add
   your family's emails as test users if it stays in "Testing" mode, or
   publish it — either works fine for a private family app).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   application type **Web application**.
4. Under **Authorized redirect URIs**, add:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (find `<your-project-ref>` in the Supabase dashboard URL, or under
   Project Settings → General).
5. Copy the **Client ID** and **Client secret** it gives you.
6. In Supabase: **Authentication → Providers → Google**, toggle it on, paste
   in the Client ID and secret, save.
7. Still in **Authentication → URL Configuration**, set **Site URL** to
   wherever the app is hosted (e.g. `https://your-project.web.app` if you're
   keeping Firebase Hosting — see step 7), and add it under **Redirect URLs**
   too. While testing locally, also add `http://localhost:5173`.

## 4. Turn on email/password sign-in (for the fallback form)

**Authentication → Providers → Email** should already be on by default.
For each family member who uses the email/password fallback rather than
Google, add them under **Authentication → Users → Add user** with an email
and password.

## 5. Get your API credentials

**Project Settings → API** → copy the **Project URL** and the **anon
public** key.

## 6. Update your `.env`

Open your existing `.env` (or copy `.env.example` if you don't have one) and
set:

```
VITE_SUPABASE_URL=<your Project URL>
VITE_SUPABASE_ANON_KEY=<your anon public key>
```

Leave `VITE_ALLOWED_EMAILS` and `VITE_FINANCE_EMAILS` as they already are —
those didn't change. You can delete the old `VITE_FIREBASE_*` lines, they're
no longer read by anything.

## 7. Swap the dependency and clean up old files

```bash
cd "family-dashboard-webapp"
npm uninstall firebase
npm install @supabase/supabase-js
```

Then delete the now-unused `src/firebase/` folder (its replacement,
`src/supabase/`, is already in place).

`firestore.rules`, `firebase.json` and `.firebaserc` are only needed if
you're still using **Firebase Hosting** to serve the built site — that part
is unrelated to Firestore/Auth and doesn't need to move. If you'd rather
host somewhere else too (Netlify, Vercel, Cloudflare Pages are all
free-tier-friendly and a five-minute setup), say the word and I'll write
those steps out as well; otherwise keep deploying with
`npm run build && firebase deploy` exactly as before.

## 8. Bring your data across

The app already has an Export/Import feature built in (the buttons on the
dashboard) — that's your migration tool, no scripts needed:

1. **Before** changing anything else, open the app as it runs today (still
   on Firebase) and click **Export**. This downloads a JSON snapshot of
   every collection.
2. Do steps 1–7 above, then run `npm run dev` (or deploy) so the app is now
   pointed at Supabase.
3. Sign in (you'll be the first user, so the app will try to auto-seed
   starter data — that's harmless, the import below replaces it).
4. Click **Import**, pick the JSON file from step 1, confirm the prompt.

Because table IDs are `text` (not a strict UUID type), the original
Firestore document IDs import unchanged, so all the cross-references
(who's assigned to a task, whose debt a payment pays off) stay intact.

## 9. Test, then deploy

```bash
npm run dev
```

Check: Google sign-in, email sign-in, each tab loads and saves, and — with
two browser windows signed in as two different family members — that a
change in one shows up live in the other (that's the realtime piece from
step 2 doing its job).

Once you're happy, build and deploy as usual:

```bash
npm run build
firebase deploy   # or your new host, if you moved hosting too
```

## Rollback

Nothing in Firebase gets touched by any of this — Firestore and Firebase
Auth stay exactly as they are. If anything goes wrong, revert your `.env`
and the `src/` changes (or just don't deploy the build), and the old
Firebase-backed version keeps working.
