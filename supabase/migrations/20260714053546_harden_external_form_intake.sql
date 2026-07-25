alter table public.external_form_submissions
  add column if not exists workspace_owner_email text,
  add column if not exists form_version integer,
  add column if not exists schema_fingerprint text,
  add column if not exists approval_request_no text,
  add column if not exists form_modified_at timestamptz,
  add column if not exists result jsonb;

alter table public.external_form_submissions
  drop constraint if exists external_form_submissions_status_check;

alter table public.external_form_submissions
  add constraint external_form_submissions_status_check
  check (status in (
    'pending_mapping',
    'ready',
    'processed',
    'failed',
    'schema_changed'
  ));

create index if not exists external_form_submissions_owner_form_idx
on public.external_form_submissions (workspace_owner_email, form_key, form_version);

alter table public.approval_request_attachments
  add column if not exists public_url text;
