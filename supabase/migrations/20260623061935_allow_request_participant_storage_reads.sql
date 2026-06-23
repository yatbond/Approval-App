drop policy if exists "approval document owners read" on storage.objects;

create policy "approval document owners and request participants read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'approval-documents'
  and (
    owner_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.approval_request_attachments a
      join public.approval_requests r
        on r.id = a.approval_request_id
      where a.storage_path = storage.objects.name
      and (
        r.requester_id = (select auth.uid())
        or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
        or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(r.participants)
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
          and p.is_admin
        )
      )
    )
  )
);
