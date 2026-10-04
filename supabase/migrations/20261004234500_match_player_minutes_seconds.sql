-- MyBasket — temps de jeu précis LiveStats
alter table if exists public.match_player_stats
  add column if not exists minutes_seconds integer not null default 0;

comment on column public.match_player_stats.minutes_seconds is
  'Temps de jeu officiel du joueur pour le match, en secondes.';
