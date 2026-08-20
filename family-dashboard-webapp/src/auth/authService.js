import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { supabase } from "../supabase/client.js";

// Deep-link scheme the native shells register (see android/.../AndroidManifest.xml
// and ios/App/App/Info.plist) — must also be added to Supabase's Auth ->
// URL Configuration -> Redirect URLs, or the provider will reject it.
const NATIVE_AUTH_CALLBACK = 'closeknit://auth/callback';

// In the native app there's no page for Google to redirect back to, so the
// web redirect flow (options.redirectTo: window.location.origin) can't work.
// Instead: open the OAuth URL in the system browser, and catch the redirect
// back to our custom URL scheme via the App plugin's deep-link listener.
export async function signInWithGoogle() {
  if (!Capacitor.isNativePlatform()) {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true }
  });
  if (error) return { error };
  await Browser.open({ url: data.url });
  return { error: null };
}

// Registers the deep-link handler once at app startup so a completed native
// sign-in (or sign-in cancelled by the user) always closes the system
// browser and hands the session back to Supabase.
export function initNativeAuthListener() {
  if (!Capacitor.isNativePlatform()) return;
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    await Browser.close();
    const code = new URL(url).searchParams.get('code');
    if (code) await supabase.auth.exchangeCodeForSession(code);
  });
}

export function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOutUser() {
  return supabase.auth.signOut();
}

export function watchAuthState(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
  return () => subscription.unsubscribe();
}
