create table if not exists public.upload_request_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  title text not null,
  selected_template_id text not null default '',
  draft_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upload_request_drafts_owner_user_id_idx
on public.upload_request_drafts(owner_user_id);

create index if not exists upload_request_drafts_updated_at_idx
on public.upload_request_drafts(updated_at desc);

alter table public.upload_request_drafts enable row level security;

grant select, insert, update, delete on public.upload_request_drafts to authenticated;

drop policy if exists "users read own upload request drafts"
on public.upload_request_drafts;

create policy "users read own upload request drafts"
on public.upload_request_drafts for select
to authenticated
using (
  owner_user_id = (select auth.uid())
);

drop policy if exists "users insert own upload request drafts"
on public.upload_request_drafts;

create policy "users insert own upload request drafts"
on public.upload_request_drafts for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
);

drop policy if exists "users update own upload request drafts"
on public.upload_request_drafts;

create policy "users update own upload request drafts"
on public.upload_request_drafts for update
to authenticated
using (
  owner_user_id = (select auth.uid())
)
with check (
  owner_user_id = (select auth.uid())
);

drop policy if exists "users delete own upload request drafts"
on public.upload_request_drafts;

create policy "users delete own upload request drafts"
on public.upload_request_drafts for delete
to authenticated
using (
  owner_user_id = (select auth.uid())
);
