-- MyBasket — extension additive Wellness + calendrier joueur
-- Aucun champ existant n'est supprimé ou renommé.

alter table if exists public.player_wellness_responses
  add column if not exists pain_zones jsonb not null default '[]'::jsonb,
  add column if not exists pain_details jsonb not null default '{}'::jsonb;

alter table if exists public.calendar_events
  add column if not exists event_category text,
  add column if not exists notification_recipients jsonb not null default '[]'::jsonb;

comment on column public.player_wellness_responses.pain_zones is
  'Zones corporelles sélectionnées dans le questionnaire wellness (face/dos).';
comment on column public.player_wellness_responses.pain_details is
  'Détails par zone: intensité, type, ancienneté, commentaire.';
comment on column public.calendar_events.event_category is
  'Catégorie complémentaire: health, school, training, game, other.';
comment on column public.calendar_events.notification_recipients is
  'Destinataires choisis lors de la création de l’événement.';
