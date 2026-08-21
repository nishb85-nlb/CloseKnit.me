-- Close Knit — adds the "repeats monthly" flag to an existing `expenses`
-- table. Run this once in the Supabase dashboard (SQL Editor -> New query
-- -> paste -> Run), same as the earlier add_expenses.sql /
-- add_expense_item_column.sql migrations. schema.sql/add_expenses.sql are
-- already updated to include this column too, for a brand-new database.

alter table expenses add column if not exists recurring boolean not null default false;
