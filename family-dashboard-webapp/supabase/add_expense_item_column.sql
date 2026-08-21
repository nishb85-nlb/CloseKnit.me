-- Close Knit — adds the "Item" column to an existing `expenses` table
-- (splits the old single Category field into Category, i.e. who it's for
-- — Household/Hazel/Rolo/Other — and Item, the type of purchase — Grocery/
-- Household Bill/Entertainment/Other). Run this once in the Supabase
-- dashboard (SQL Editor -> New query -> paste -> Run), same as
-- add_expenses.sql before it. schema.sql/add_expenses.sql are already
-- updated to include this column too, for a brand-new database.

alter table expenses add column if not exists item text;
