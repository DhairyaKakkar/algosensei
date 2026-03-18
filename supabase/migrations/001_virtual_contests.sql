-- Virtual Contests table
-- Run this in the Supabase SQL editor or via `supabase db push`.

create table if not exists virtual_contests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  problems         jsonb not null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_minutes int not null default 90,
  results          jsonb,
  score            int,
  created_at       timestamptz not null default now()
);

-- Index for looking up a user's contest history quickly
create index if not exists virtual_contests_user_id_idx
  on virtual_contests (user_id, started_at desc);

-- Row Level Security
alter table virtual_contests enable row level security;

-- Users can read their own contests
create policy "users can read own contests"
  on virtual_contests for select
  using (auth.uid() = user_id);

-- Users can insert contests for themselves
create policy "users can insert own contests"
  on virtual_contests for insert
  with check (auth.uid() = user_id or user_id is null);

-- Users can update their own contests (e.g. submit results)
create policy "users can update own contests"
  on virtual_contests for update
  using (auth.uid() = user_id or user_id is null);
