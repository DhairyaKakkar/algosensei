-- User preferences table — stores per-user settings synced across devices.
-- Run this in the Supabase SQL editor.

create table if not exists user_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  cf_handle          text,
  lc_username        text,
  display_name       text,
  target_rating      int check (target_rating between 800 and 4000),
  preferred_language text not null default 'cpp',
  daily_goal         int not null default 3 check (daily_goal between 1 and 20),
  notify_daily       boolean not null default false,
  notify_weekly      boolean not null default true,
  theme              text not null default 'dark' check (theme in ('dark', 'light')),
  updated_at         timestamptz not null default now()
);

alter table user_preferences enable row level security;

create policy "users can read own preferences"
  on user_preferences for select
  using (auth.uid() = user_id);

create policy "users can insert own preferences"
  on user_preferences for insert
  with check (auth.uid() = user_id);

create policy "users can update own preferences"
  on user_preferences for update
  using (auth.uid() = user_id);

create policy "users can delete own preferences"
  on user_preferences for delete
  using (auth.uid() = user_id);
