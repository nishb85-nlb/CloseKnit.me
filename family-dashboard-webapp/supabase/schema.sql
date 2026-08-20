-- Close Knit — Supabase schema (replaces Firestore's families/main/* collections)
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

-- IDs are `text` (not `uuid`) on purpose: it lets you re-import your existing
-- Firestore export JSON later with the original document IDs intact, via the
-- app's own Import button, with zero conversion needed.

create table members (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  color text not null
);

create table tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  assignee text references members(id) on delete set null,
  due date,
  notes text,
  done boolean not null default false,
  completed_by text references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table events (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  end_date date,
  title text not null,
  time text,
  member_id text references members(id) on delete set null,
  repeat text not null default 'none',
  repeat_until date,
  created_at timestamptz not null default now()
);

create table grocery (
  id text primary key default gen_random_uuid()::text,
  text text not null,
  qty text,
  category text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table shopping (
  id text primary key default gen_random_uuid()::text,
  text text not null,
  assignee text references members(id) on delete set null,
  notes text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table debts (
  id text primary key default gen_random_uuid()::text,
  member_id text references members(id) on delete cascade,
  creditor text not null,
  balance numeric(10,2) not null,
  note text,
  created_at timestamptz not null default now()
);

create table payments (
  id text primary key default gen_random_uuid()::text,
  member_id text references members(id) on delete cascade,
  date date not null,
  amount numeric(10,2) not null,
  method text,
  comment text,
  created_at timestamptz not null default now()
);

create table holidays (
  id text primary key default gen_random_uuid()::text,
  start_date date not null,
  end_date date not null,
  destination text not null,
  airline text,
  booking_ref text,
  status text not null default 'Planning',
  member_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table wishlist (
  id text primary key default gen_random_uuid()::text,
  member_id text references members(id) on delete cascade,
  item text not null,
  link text,
  notes text,
  created_at timestamptz not null default now()
);
