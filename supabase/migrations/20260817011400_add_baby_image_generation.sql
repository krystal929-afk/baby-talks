create table if not exists public.baby_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.baby_conversations(id) on delete cascade,
  message_id uuid references public.baby_messages(id) on delete set null,
  prompt text not null,
  storage_path text not null unique,
  mime_type text not null default 'image/png',
  model text not null,
  aspect_ratio text not null default '1:1',
  created_at timestamptz not null default now()
);

create index if not exists baby_images_owner_created_idx on public.baby_images(owner_id, created_at desc);
create index if not exists baby_images_conversation_idx on public.baby_images(conversation_id, created_at);
create index if not exists baby_images_message_idx on public.baby_images(message_id) where message_id is not null;

alter table public.baby_images enable row level security;

drop policy if exists "Own images only" on public.baby_images;
create policy "Own images only" on public.baby_images
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'baby-images',
  'baby-images',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
