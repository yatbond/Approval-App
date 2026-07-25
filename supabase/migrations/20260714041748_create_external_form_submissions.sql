create table if not exists public.external_form_submissions (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('microsoft_forms')),
  form_key text not null,
  external_form_id text not null,
  external_response_id text not null,
  response_mode text not null check (response_mode in ('start_workflow', 'complete_node')),
  correlation_token text,
  respondent_name text,
  respondent_email text,
  answers jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'pending_mapping'
    check (status in ('pending_mapping', 'ready', 'processed', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_form_id, external_response_id)
);

alter table public.external_form_submissions enable row level security;

revoke all on public.external_form_submissions from anon, authenticated;
grant select, insert, update on public.external_form_submissions to service_role;

create index if not exists external_form_submissions_pending_idx
on public.external_form_submissions (status, received_at)
where status in ('pending_mapping', 'ready');
