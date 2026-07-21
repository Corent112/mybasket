-- ZONE 1 — Séances et calendrier
alter table public.practice_sessions
  add column if not exists category text,
  add column if not exists level text,
  add column if not exists duration integer,
  add column if not exists players_count integer,
  add column if not exists material text,
  add column if not exists description text,
  add column if not exists status text default 'published',
  add column if not exists review_status text default 'published',
  add column if not exists updated_at timestamptz default now(),
  add column if not exists pdf_generated boolean default false,
  add column if not exists pdf_generated_at timestamptz;

alter table public.calendar_events
  add column if not exists match_id uuid,
  add column if not exists team_id uuid,
  add column if not exists game_plan_id uuid,
  add column if not exists attachment_url text,
  add column if not exists visibility text default 'private';

create index if not exists calendar_events_user_date_idx
  on public.calendar_events(user_id, event_date);
create index if not exists calendar_events_session_idx
  on public.calendar_events(session_id);
create index if not exists calendar_events_match_idx
  on public.calendar_events(match_id);
