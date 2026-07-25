alter table public.workflow_template_versions
  add column if not exists is_active_version boolean not null default false,
  add column if not exists version_comment text not null default '';

update public.workflow_template_versions
set
  is_active_version = case
    when lower(coalesce(template_snapshot->>'isActiveVersion', 'false')) = 'true'
      then true
    else false
  end,
  version_comment = coalesce(template_snapshot->>'versionComment', version_comment, '')
where
  template_snapshot ? 'isActiveVersion'
  or template_snapshot ? 'versionComment';

create index if not exists workflow_template_versions_active_version_idx
on public.workflow_template_versions(template_key, is_active_version)
where is_active = true;
