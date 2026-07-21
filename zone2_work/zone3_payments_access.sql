-- MYBASKET — ZONE 3 : paiements, abonnements et permissions
-- À exécuter dans Supabase > SQL Editor.

alter table if exists public.orders
  add column if not exists subtotal_cents integer,
  add column if not exists tax_cents integer,
  add column if not exists total_cents integer,
  add column if not exists provider_session_id text,
  add column if not exists stripe_session_id text,
  add column if not exists paid_at timestamptz;

alter table if exists public.order_items
  add column if not exists price_cents integer,
  add column if not exists unit_price_cents integer;

alter table if exists public.subscription_plans
  add column if not exists price_tax_mode text not null default 'TTC',
  add column if not exists image_url text,
  add column if not exists max_teams integer,
  add column if not exists max_playbooks integer,
  add column if not exists max_documents integer,
  add column if not exists max_favorites integer,
  add column if not exists storage_gb numeric;

update public.subscription_plans
set price_tax_mode = 'TTC'
where price_tax_mode is null or price_tax_mode not in ('TTC', 'HT');

alter table if exists public.subscription_access
  add column if not exists enabled boolean not null default false;

create unique index if not exists subscription_access_plan_section_uidx
  on public.subscription_access(plan_id, section_key);
create index if not exists subscriptions_user_status_idx
  on public.subscriptions(user_id, status);
create index if not exists orders_user_status_idx
  on public.orders(user_id, status);
create index if not exists order_items_order_idx
  on public.order_items(order_id);
