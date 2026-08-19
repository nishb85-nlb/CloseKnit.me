export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function splitEmails(value) {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Must match isFamilyMember() in firestore.rules.
export const ALLOWED_EMAILS = splitEmails(import.meta.env.VITE_ALLOWED_EMAILS);

// Must match isFinanceMember() in firestore.rules.
export const FINANCE_EMAILS = splitEmails(import.meta.env.VITE_FINANCE_EMAILS);

export const PALETTE = ["#3a6ea5", "#e07a5f", "#2a9d8f", "#9c6644", "#6a4c93", "#e0b000", "#2b9348", "#c9184a"];

export const FAMILY_PATH = "families/main";
