create table if not exists public.baby_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.baby_conversations(id) on delete cascade,
  title text not null,
  filename text not null,
  format text not null check (format in ('pdf','docx')),
  mime_type text not null,
  storage_path text not null unique,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists baby_documents_owner_created_idx
  on public.baby_documents(owner_id, created_at desc);
create index if not exists baby_documents_conversation_idx
  on public.baby_documents(conversation_id, created_at);

alter table public.baby_documents enable row level security;

drop policy if exists "Users can read own baby documents" on public.baby_documents;
create policy "Users can read own baby documents"
  on public.baby_documents for select
  using (auth.uid() = owner_id);

drop policy if exists "Users can insert own baby documents" on public.baby_documents;
create policy "Users can insert own baby documents"
  on public.baby_documents for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Users can update own baby documents" on public.baby_documents;
create policy "Users can update own baby documents"
  on public.baby_documents for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own baby documents" on public.baby_documents;
create policy "Users can delete own baby documents"
  on public.baby_documents for delete
  using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'baby-documents',
  'baby-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
