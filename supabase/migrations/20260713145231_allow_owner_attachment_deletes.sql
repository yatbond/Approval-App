drop policy if exists "approval document owners delete" on storage.objects;

create policy "approval document owners delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'approval-documents'
  and owner_id = (select auth.uid()::text)
);
