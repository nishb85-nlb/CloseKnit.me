export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function splitEmails(value) {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Must match is_family_member() in supabase/policies.sql.
export const ALLOWED_EMAILS = splitEmails(import.meta.env.VITE_ALLOWED_EMAILS);

// Must match is_finance_member() in supabase/policies.sql.
export const FINANCE_EMAILS = splitEmails(import.meta.env.VITE_FINANCE_EMAILS);

// Must match is_expense_member() in supabase/policies.sql.
export const EXPENSE_EMAILS = splitEmails(import.meta.env.VITE_EXPENSE_EMAILS);

export const PALETTE = ["#3a6ea5", "#e07a5f", "#2a9d8f", "#9c6644", "#6a4c93", "#e0b000", "#2b9348", "#c9184a"];
