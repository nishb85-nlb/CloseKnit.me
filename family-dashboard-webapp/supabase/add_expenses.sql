-- Close Knit — adds the Spending tab's `expenses` table to an existing
-- database. Run this once in the Supabase dashboard (SQL Editor -> New
-- query -> paste -> Run). schema.sql and policies.sql have already been
-- updated to include this table too, so a brand-new database only needs
-- those two files — this file is just for bringing an existing database
-- up to date without re-running (and erroring on) everything else.

create table expenses (
  id text primary key default gen_random_uuid()::text,
  category text not null,
  item text,
  amount numeric(10,2) not null,
  date date not null,
  member_id text references members(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- Spending tab is its own audience, separate from Finance's debts/payments —
-- keep identical to VITE_EXPENSE_EMAILS in .env.
create or replace function is_expense_member() returns boolean
language sql stable as $$
  select auth.email() in ('nishb85@gmail.com', 'sannish16@gmail.com', 'hazeldia7@gmail.com');
$$;

alter table expenses enable row level security;

create policy "expense members full access" on expenses for all using (is_expense_member()) with check (is_expense_member());

alter publication supabase_realtime add table expenses;
