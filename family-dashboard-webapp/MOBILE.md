# Close Knit — native mobile apps (Capacitor)

The same Vite web app now also builds into real iOS and Android apps via
[Capacitor](https://capacitorjs.com) — it wraps the built `dist/` output in a
native WebView shell, so there's no separate codebase to maintain. The native
projects live in `android/` and `ios/`, already committed with the Capacitor
plugins wired in (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`,
plus `@capacitor/browser` and `@capacitor/app`, used for native sign-in below).

`capacitor.config.json` sets the app id (`com.closeknit.app`), display name
("Close Knit"), and web build dir (`dist`).

## One-time setup this needs from you

**Google sign-in needs one manual step, or it won't work in the native apps.**
The web app signs in via a full-page redirect back to itself, which doesn't
exist inside a native app — so on native, it instead opens Google sign-in in
the system browser and catches the redirect via a custom URL scheme
(`closeknit://auth/callback`, already registered in both
`android/app/src/main/AndroidManifest.xml` and `ios/App/App/Info.plist`).
For Supabase to allow redirecting there, add it once:

**Supabase dashboard → Authentication → URL Configuration → Redirect URLs**
→ add `closeknit://auth/callback` → save.

Nothing else needs registering — Google's OAuth consent screen still only
knows about Supabase's own fixed callback URL, which you already set up per
`MIGRATION.md`.

## Building and running

You'll need:
- **Android**: [Android Studio](https://developer.android.com/studio) (includes the SDK).
- **iOS**: a Mac with Xcode + [CocoaPods](https://cocoapods.org) — not possible from Windows/Linux.

```bash
npm run cap:sync       # builds the web app and copies it into android/ and ios/
npm run android:open   # opens the project in Android Studio — run from there
npm run ios:open       # opens the project in Xcode (macOS only) — run from there
```

`android:run` / `ios:run` do a sync-and-launch onto a connected device or
running emulator/simulator in one step, once you've set one up in the
respective IDE.

Re-run `npm run cap:sync` any time the web code (`src/`, `index.html`) changes
— it's the only step that copies your latest build into the native projects.
Editing native files directly (icons, permissions, splash screen) is done in
`android/` and `ios/` as normal for those platforms.

## App icon and splash screen

Both platforms currently ship Capacitor's default placeholder icon. Swapping
in the family's own branding is a native-assets step
([`@capacitor/assets`](https://capacitorjs.com/docs/guides/splash-screens-and-icons)
can generate every required size from one source image) — say the word and
I'll set that up once you have a logo image to use.

## What's gitignored vs. committed

`android/` and `ios/` are committed in full (that's the normal Capacitor
convention — they're real native project sources, not build output). Each
platform folder has its own `.gitignore` for the things that genuinely are
build artifacts: `android/**/build/`, `.gradle/`, `local.properties`;
`ios/**/Pods/`, `DerivedData/`, `xcuserdata/`, etc.
