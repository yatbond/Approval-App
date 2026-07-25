drop policy if exists "admins read all business units" on public.business_units;
create policy "admins read all business units"
on public.business_units for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin
      and p.is_active
  )
);

drop policy if exists "admins read all business departments" on public.business_departments;
create policy "admins read all business departments"
on public.business_departments for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin
      and p.is_active
  )
);
