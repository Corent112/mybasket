-- MyBasket — calendrier central : séries récurrentes + statut des convocations
-- Migration additive uniquement.

alter table if exists public.calendar_events
  add column if not exists series_id text,
  add column if not exists recurrence_rule text,
  add column if not exists participant_statuses jsonb not null default '{}'::jsonb;

create index if not exists calendar_events_series_id_idx
  on public.calendar_events(series_id)
  where series_id is not null;

comment on column public.calendar_events.series_id is
  'Identifiant commun aux occurrences d’une même série récurrente.';
comment on column public.calendar_events.recurrence_rule is
  'Règle MyBasket de la série: weekly, biweekly, monthly.';
comment on column public.calendar_events.participant_statuses is
  'Statut par joueur: invited, present, absent, uncertain.';
