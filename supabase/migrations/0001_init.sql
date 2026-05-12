-- ED Patient Assignment System — initial Supabase schema
-- Run this in the Supabase SQL editor for a fresh project.
--
-- Model notes
-- - One row per (site, date) in `days`, with the full DayState held in JSONB
--   columns. Realtime subscriptions on this table push updates to every open
--   browser. Last-write-wins is acceptable for v1 (two clerks editing the
--   same day in the same second is the only race, and the audit log makes
--   it recoverable).
-- - `audit_log` is append-only; one row per recorded mutation, including
--   who and when.
-- - RLS is enabled and currently lets any authenticated user read/write any
--   day. Lock this down once you have hospital/team scoping.

create extension if not exists "pgcrypto";

create table if not exists public.days (
  site_code     text        not null,
  date          date        not null,
  roster        jsonb       not null default '{}'::jsonb,
  assignments   jsonb       not null default '[]'::jsonb,
  choose_ins    jsonb       not null default '{}'::jsonb,
  nedocs        jsonb       not null default '{}'::jsonb,
  extra_slots   jsonb       not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    uuid        references auth.users(id),
  primary key (site_code, date)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists days_set_updated_at on public.days;
create trigger days_set_updated_at
  before update on public.days
  for each row execute function public.set_updated_at();

create table if not exists public.audit_log (
  id          bigserial primary key,
  site_code   text        not null,
  date        date        not null,
  user_id     uuid        references auth.users(id),
  ts          timestamptz not null default now(),
  description text        not null
);

create index if not exists audit_log_site_date_ts_idx
  on public.audit_log (site_code, date, ts desc);

-- Row-Level Security
alter table public.days       enable row level security;
alter table public.audit_log  enable row level security;

drop policy if exists "days_authenticated_all" on public.days;
create policy "days_authenticated_all"
  on public.days
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "audit_authenticated_select" on public.audit_log;
create policy "audit_authenticated_select"
  on public.audit_log
  for select
  to authenticated
  using (true);

drop policy if exists "audit_authenticated_insert" on public.audit_log;
create policy "audit_authenticated_insert"
  on public.audit_log
  for insert
  to authenticated
  with check (true);

-- Realtime: enable broadcasts for the days table so every open browser
-- receives updates within ~1s of any write.
alter publication supabase_realtime add table public.days;
