-- MyBasket — Bloc 8 : Game Plan lié au calendrier
alter table public.calendar_events add column if not exists attachment_url text;
alter table public.calendar_events add column if not exists opponent text;
alter table public.calendar_events add column if not exists team_id text;
alter table public.calendar_events add column if not exists game_plan_id uuid;
create index if not exists calendar_events_game_plan_idx on public.calendar_events(game_plan_id);
