-- Cover foreign keys present in the hosted schema so relationship checks and
-- cascades remain indexed after the server-authoritative migrations.

create index if not exists approval_request_attachments_uploaded_by_idx
on public.approval_request_attachments (uploaded_by)
where uploaded_by is not null;

create index if not exists approval_request_events_actor_id_idx
on public.approval_request_events (actor_id)
where actor_id is not null;

create index if not exists approval_requests_requester_id_idx
on public.approval_requests (requester_id)
where requester_id is not null;

create index if not exists approval_requests_workflow_template_version_idx
on public.approval_requests (workflow_template_version_id)
where workflow_template_version_id is not null;

create index if not exists workflow_template_versions_business_unit_idx
on public.workflow_template_versions (business_unit_id)
where business_unit_id is not null;

create index if not exists workflow_template_versions_created_by_idx
on public.workflow_template_versions (created_by)
where created_by is not null;

create index if not exists workflow_template_versions_department_idx
on public.workflow_template_versions (department_id)
where department_id is not null;

create index if not exists workspace_snapshots_owner_user_idx
on public.workspace_snapshots (owner_user_id);
