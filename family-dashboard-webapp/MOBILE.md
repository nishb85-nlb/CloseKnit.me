# Close Knit — native Android app (Capacitor)

The same Vite web app also builds into a real Android app via
[Capacitor](https://capacitorjs.com) — it wraps the built `dist/` output in a
native WebView shell, so there's no separate codebase to maintain. The native
project lives in `android/`, already committed with the Capacitor plugins
wired in (`@capacitor/core`, `@capacitor/android`, plus `@capacitor/browser`
and `@capacitor/app`, used for native sign-in below). Android-only for now —
say the word if you want iOS added back later.

`capacitor.config.json` sets the app id (`com.closeknit.app`), display name
("Close Knit"), and web build dir (`dist`).

## One-time setup this needs from you

**Google sign-in needs one manual step, or it won't work in the native app.**
The web app signs in via a full-page redirect back to itself, which doesn't
exist inside a native app — so on native, it instead opens Google sign-in in
the system browser and catches the redirect via a custom URL scheme
(`closeknit://auth/callback`, already registered in
`android/app/src/main/AndroidManifest.xml`). For Supabase to allow redirecting
there, add it once:

**Supabase dashboard → Authentication → URL Configuration → Redirect URLs**
→ add `closeknit://auth/callback` → save.

Nothing else needs registering — Google's OAuth consent screen still only
knows about Supabase's own fixed callback URL, which you already set up per
`MIGRATION.md`.

## Weather widget location permission

The header's weather chip uses the browser's `navigator.geolocation` API,
which works out of the box on the web. `ACCESS_COARSE_LOCATION` /
`ACCESS_FINE_LOCATION` are declared in `AndroidManifest.xml` so the WebView
*can* request device location too — but this is untested on an actual device
(no Android Studio/emulator available in this environment to verify the
runtime permission prompt actually surfaces). If it doesn't work first time
on-device, the fix is normally adding the official
[`@capacitor/geolocation`](https://capacitorjs.com/docs/apis/geolocation)
plugin, which bridges the native permission dialog properly instead of
relying on the WebView's default handling.

## Building and running

You'll need [Android Studio](https://developer.android.com/studio) (includes the SDK).

```bash
npm run cap:sync       # builds the web app and copies it into android/
npm run android:open   # opens the project in Android Studio — run from there
npm run android:run    # sync + launch onto a connected device/emulator in one step
```

Re-run `npm run cap:sync` any time the web code (`src/`, `index.html`)
changes — it's the only step that copies your latest build into the native
project. Editing native files directly (icon, permissions, splash screen) is
done in `android/` as normal for that platform.

## App icon and splash screen

The app currently ships Capacitor's default placeholder icon. Swapping in the
family's own branding is a native-assets step
([`@capacitor/assets`](https://capacitorjs.com/docs/guides/splash-screens-and-icons)
can generate every required size from one source image) — say the word and
I'll set that up once you have a logo image to use.

## What's gitignored vs. committed

`android/` is committed in full (that's the normal Capacitor convention —
it's real native project source, not build output). It has its own
`.gitignore` for the things that genuinely are build artifacts:
`android/**/build/`, `.gradle/`, `local.properties`, etc.
