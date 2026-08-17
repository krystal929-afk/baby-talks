create table public.baby_skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  instructions text not null check (char_length(trim(instructions)) between 1 and 4000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index baby_skills_owner_name_idx on public.baby_skills(owner_id, name);

create trigger baby_skills_set_updated_at
before update on public.baby_skills
for each row execute function public.set_updated_at();

alter table public.baby_skills enable row level security;

create policy "Own skills only" on public.baby_skills
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
