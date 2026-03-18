-- Skill snapshots table — stores weekly skill scores per user for trend analysis.
-- Run this in the Supabase SQL editor.

create table if not exists skill_snapshots (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade,
  handle         text not null,
  topic_scores   jsonb not null,          -- { topicId: skillScore (0–100) }
  overall_score  int not null default 0,
  snapshot_date  date not null default current_date,
  created_at     timestamptz not null default now(),
  -- One snapshot per user per day (upsert-safe)
  unique (user_id, snapshot_date)
);

create index if not exists skill_snapshots_user_date_idx
  on skill_snapshots (user_id, snapshot_date desc);

alter table skill_snapshots enable row level security;

create policy "users can read own snapshots"
  on skill_snapshots for select
  using (auth.uid() = user_id);

create policy "users can insert own snapshots"
  on skill_snapshots for insert
  with check (auth.uid() = user_id);

create policy "users can update own snapshots"
  on skill_snapshots for update
  using (auth.uid() = user_id);
