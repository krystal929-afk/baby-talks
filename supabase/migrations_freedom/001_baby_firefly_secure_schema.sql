-- Baby Firefly secure schema for a NEW empty Supabase project.
-- Every row belongs to the authenticated user who created it.

create or replace function public.set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transcript text not null,
  status text not null default 'parking_lot' check (status in ('grow','rethink','trash','parking_lot')),
  topic text not null default 'Other',
  dev_pack jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.baby_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  remind_at timestamptz,
  reminded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique(owner_id, endpoint)
);

create index ideas_owner_created_idx on public.ideas(owner_id, created_at desc);
create index memories_owner_created_idx on public.baby_memories(owner_id, created_at desc);
create index events_owner_starts_idx on public.calendar_events(owner_id, starts_at);
create index events_owner_remind_idx on public.calendar_events(owner_id, remind_at) where reminded = false and remind_at is not null;
create index push_owner_idx on public.push_subscriptions(owner_id);

create trigger ideas_set_updated_at before update on public.ideas for each row execute function public.set_updated_at();
create trigger memories_set_updated_at before update on public.baby_memories for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();

alter table public.ideas enable row level security;
alter table public.baby_memories enable row level security;
alter table public.calendar_events enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "Own ideas only" on public.ideas for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Own memories only" on public.baby_memories for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Own events only" on public.calendar_events for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Own push subscriptions only" on public.push_subscriptions for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

revoke execute on function public.set_updated_at() from public, anon, authenticated;
