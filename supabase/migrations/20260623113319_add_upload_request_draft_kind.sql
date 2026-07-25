alter table public.upload_request_drafts
add column if not exists draft_kind text not null default 'named';

alter table public.upload_request_drafts
drop constraint if exists upload_request_drafts_draft_kind_check;

alter table public.upload_request_drafts
add constraint upload_request_drafts_draft_kind_check
check (draft_kind in ('current', 'named'));

create index if not exists upload_request_drafts_owner_kind_idx
on public.upload_request_drafts(owner_user_id, draft_kind, updated_at desc);
