import { signInWithGoogle, signInWithEmail, signOutUser, watchAuthState } from "../auth/authService.js";
import { startSync, stopSync } from "../supabase/sync.js";
import { resetState } from "../state/store.js";
import { session } from "../state/session.js";
import { ALLOWED_EMAILS, FINANCE_EMAILS } from "../config/env.js";
import { goToTab } from "./tabs.js";
import { renderWeather } from "./weather.js";

export function initAuthUI() {
  const authOverlay = document.getElementById('authOverlay');
  const appRoot = document.getElementById('appRoot');
  const authError = document.getElementById('authError');

  document.getElementById('googleSignInBtn').addEventListener('click', async () => {
    authError.classList.remove('show');
    const { error } = await signInWithGoogle();
    if (error) {
      authError.textContent = 'Sign-in failed: ' + error.message;
      authError.classList.add('show');
    }
    // On success the browser is redirected to Google and back — nothing
    // further to do here, watchAuthState() below picks up the new session.
  });

  document.getElementById('emailToggleBtn').addEventListener('click', () => {
    document.getElementById('emailSignInForm').classList.toggle('show');
  });

  document.getElementById('emailSignInForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.remove('show');
    const email = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value;
    const { error } = await signInWithEmail(email, password);
    if (error) {
      authError.textContent = 'Sign-in failed: ' + error.message;
      authError.classList.add('show');
    }
  });

  document.getElementById('signOutBtn').addEventListener('click', () => {
    signOutUser();
  });

  watchAuthState(async (user) => {
    if (user && ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(user.email)) {
      authError.textContent = `${user.email} isn't on the family list for this dashboard. Ask whoever set this up to add you.`;
      authError.classList.add('show');
      await signOutUser();
      return;
    }
    if (user) {
      authOverlay.style.display = 'none';
      appRoot.style.display = 'block';
      const meta = user.user_metadata || {};
      document.getElementById('userPhoto').src = meta.avatar_url || meta.picture || '';
      document.getElementById('userName').textContent = meta.full_name || meta.name || user.email;
      session.canSeeFinance = FINANCE_EMAILS.includes(user.email);
      const financeTabBtn = document.querySelector('nav.tabs button[data-view="finance"]');
      if (financeTabBtn) financeTabBtn.style.display = session.canSeeFinance ? '' : 'none';
      if (!session.canSeeFinance) {
        // In case it was left open from a previous (finance-enabled) session on a shared device.
        const financeView = document.getElementById('view-finance');
        if (financeView && financeView.classList.contains('active')) goToTab('overview');
      }
      startSync();
      renderWeather();
    } else {
      authOverlay.style.display = 'flex';
      appRoot.style.display = 'none';
      stopSync();
      session.canSeeFinance = false;
      resetState();
    }
  });
}
