create table if not exists public.baby_contact_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  last_heard_at timestamptz not null default now(),
  last_inactivity_push_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.baby_contact_state enable row level security;

create policy "baby_contact_state_select_own"
on public.baby_contact_state
for select
to authenticated
using (auth.uid() = owner_id);

create policy "baby_contact_state_insert_own"
on public.baby_contact_state
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "baby_contact_state_update_own"
on public.baby_contact_state
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists baby_contact_state_inactivity_idx
on public.baby_contact_state (last_heard_at)
where last_inactivity_push_at is null;

insert into public.baby_contact_state (owner_id, last_heard_at)
select c.owner_id, max(m.created_at)
from public.baby_conversations c
join public.baby_messages m on m.conversation_id = c.id
where m.role = 'user'
group by c.owner_id
on conflict (owner_id) do update
set last_heard_at = greatest(public.baby_contact_state.last_heard_at, excluded.last_heard_at),
    updated_at = now();
