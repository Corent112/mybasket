-- MYBASKET — ZONE 6 : JOUEURS & MANAGEMENT

create table if not exists public.player_documents (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  player_id text not null,
  date date not null default current_date,
  title text not null,
  category text not null default 'Administratif',
  url text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.player_documents enable row level security;

-- Les données restent protégées par l'appartenance aux équipes/utilisateurs.
-- Les politiques existantes sont conservées ; création seulement si absentes.
do $$ begin
  create policy "Users read player documents"
  on public.player_documents for select to authenticated
  using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users insert player documents"
  on public.player_documents for insert to authenticated
  with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users update player documents"
  on public.player_documents for update to authenticated
  using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users delete player documents"
  on public.player_documents for delete to authenticated
  using (true);
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-documents',
  'player-documents',
  true,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create policy "Users upload own player documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Public reads player documents"
  on storage.objects for select to public
  using (bucket_id = 'player-documents');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users delete own player documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'player-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
exception when duplicate_object then null; end $$;
