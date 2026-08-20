-- Close Knit — row-level security (replaces firestore.rules)
-- Run this AFTER schema.sql, in the same SQL Editor.
--
-- Keep the two email lists below identical to VITE_ALLOWED_EMAILS and
-- VITE_FINANCE_EMAILS in .env — same rule as before, just SQL instead of
-- Firestore rules syntax.

create or replace function is_family_member() returns boolean
language sql stable as $$
  select auth.email() in (
    'nishb85@gmail.com',
    'sannish16@gmail.com',
    '16marinaclose@gmail.com',
    'hazeldia7@gmail.com',
    'leescu.paul@gmail.com',
    'leescu.paul@googlemail.com'
  );
$$;

create or replace function is_finance_member() returns boolean
language sql stable as $$
  select auth.email() in ('nishb85@gmail.com', 'sannish16@gmail.com');
$$;

alter table members  enable row level security;
alter table tasks    enable row level security;
alter table events   enable row level security;
alter table grocery  enable row level security;
alter table shopping enable row level security;
alter table debts    enable row level security;
alter table payments enable row level security;
alter table holidays enable row level security;
alter table wishlist enable row level security;

create policy "family members full access" on members  for all using (is_family_member()) with check (is_family_member());
create policy "family members full access" on tasks    for all using (is_family_member()) with check (is_family_member());
create policy "family members full access" on events   for all using (is_family_member()) with check (is_family_member());
create policy "family members full access" on grocery  for all using (is_family_member()) with check (is_family_member());
create policy "family members full access" on shopping for all using (is_family_member()) with check (is_family_member());
create policy "family members full access" on holidays for all using (is_family_member()) with check (is_family_member());
create policy "family members full access" on wishlist for all using (is_family_member()) with check (is_family_member());

create policy "finance members full access" on debts    for all using (is_finance_member()) with check (is_finance_member());
create policy "finance members full access" on payments for all using (is_finance_member()) with check (is_finance_member());

-- Turn on realtime replication so watchCollection() gets live updates,
-- same as Firestore's onSnapshot did.
alter publication supabase_realtime add table
  members, tasks, events, grocery, shopping, debts, payments, holidays, wishlist;
