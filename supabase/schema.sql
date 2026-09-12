-- ENT R1 Mock — Supabase sync schema.
-- One row per (user, set) in each table, so adding Set 03/04/... later is a
-- new set_id value, not a new table or a migration. Every policy is scoped
-- to auth.uid(), which is what makes the anon key safe to ship client-side.

create table if not exists public.attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

create table if not exists public.summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

alter table public.attempts enable row level security;
alter table public.summaries enable row level security;

-- Dropped first so the whole file can be re-run after an edit; create policy
-- has no if-not-exists form and would otherwise abort the script.
-- Restrictive by construction: each policy only matches rows the caller owns,
-- for exactly one operation, so a user can never read or write another
-- user's attempt or summary rows.
drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own" on public.attempts for select using (auth.uid() = user_id);
drop policy if exists "attempts_insert_own" on public.attempts;
create policy "attempts_insert_own" on public.attempts for insert with check (auth.uid() = user_id);
drop policy if exists "attempts_update_own" on public.attempts;
create policy "attempts_update_own" on public.attempts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "attempts_delete_own" on public.attempts;
create policy "attempts_delete_own" on public.attempts for delete using (auth.uid() = user_id);

drop policy if exists "summaries_select_own" on public.summaries;
create policy "summaries_select_own" on public.summaries for select using (auth.uid() = user_id);
drop policy if exists "summaries_insert_own" on public.summaries;
create policy "summaries_insert_own" on public.summaries for insert with check (auth.uid() = user_id);
drop policy if exists "summaries_update_own" on public.summaries;
create policy "summaries_update_own" on public.summaries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "summaries_delete_own" on public.summaries;
create policy "summaries_delete_own" on public.summaries for delete using (auth.uid() = user_id);
