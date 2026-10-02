-- Personal shooting-grid templates for Mon Compte > Mes Documents
create table if not exists public.personal_shooting_grids (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null default 'Nouvelle grille de tir', description text not null default '',
 input_mode text not null default 'fixed_attempts' check (input_mode in ('fixed_attempts','fixed_makes')),
 fixed_value integer not null default 10 check (fixed_value > 0), court_schema_url text, court_schema_data jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.personal_shooting_grid_rows (
 id uuid primary key default gen_random_uuid(), grid_id uuid not null references public.personal_shooting_grids(id) on delete cascade,
 name text not null, sort_order integer not null default 0, target_attempts integer
);
create table if not exists public.personal_shooting_grid_sessions (
 id uuid primary key default gen_random_uuid(), grid_id uuid not null references public.personal_shooting_grids(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, session_date date not null default current_date, notes text, created_at timestamptz not null default now()
);
create table if not exists public.personal_shooting_grid_session_players (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.personal_shooting_grid_sessions(id) on delete cascade, player_id uuid not null
);
create table if not exists public.personal_shooting_grid_player_results (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.personal_shooting_grid_sessions(id) on delete cascade,
 row_id uuid not null references public.personal_shooting_grid_rows(id) on delete cascade, player_id uuid not null, made integer not null default 0, attempted integer not null default 0
);
alter table public.personal_shooting_grids enable row level security;
alter table public.personal_shooting_grid_rows enable row level security;
alter table public.personal_shooting_grid_sessions enable row level security;
alter table public.personal_shooting_grid_session_players enable row level security;
alter table public.personal_shooting_grid_player_results enable row level security;
create policy "personal shooting grids owner" on public.personal_shooting_grids for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "personal shooting rows owner" on public.personal_shooting_grid_rows for all using (exists(select 1 from public.personal_shooting_grids g where g.id=grid_id and g.owner_id=auth.uid())) with check (exists(select 1 from public.personal_shooting_grids g where g.id=grid_id and g.owner_id=auth.uid()));
create policy "personal shooting sessions owner" on public.personal_shooting_grid_sessions for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "personal shooting session players owner" on public.personal_shooting_grid_session_players for all using (exists(select 1 from public.personal_shooting_grid_sessions s where s.id=session_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.personal_shooting_grid_sessions s where s.id=session_id and s.owner_id=auth.uid()));
create policy "personal shooting results owner" on public.personal_shooting_grid_player_results for all using (exists(select 1 from public.personal_shooting_grid_sessions s where s.id=session_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.personal_shooting_grid_sessions s where s.id=session_id and s.owner_id=auth.uid()));
create index if not exists personal_shooting_grids_owner_idx on public.personal_shooting_grids(owner_id);
create index if not exists personal_shooting_grid_rows_grid_idx on public.personal_shooting_grid_rows(grid_id);
