-- Fix infinite recursion on tenant_members RLS policies.

create or replace function public.has_tenant_admin_access(p_tenant_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = p_user_id
      and tm.enabled = true
      and tm.deleted_at is null
      and tm.role in ('Admin', 'Superadmin')
  );
$$;

drop policy if exists "tenant_members: read own memberships" on public.tenant_members;
create policy "tenant_members: read own memberships"
  on public.tenant_members
  for select
  using (
    user_id = auth.uid()
    and deleted_at is null
  );

drop policy if exists "tenant_members: workspace admin manage memberships" on public.tenant_members;
create policy "tenant_members: workspace admin manage memberships"
  on public.tenant_members
  for all
  using (
    public.is_global_superadmin()
    or public.has_tenant_admin_access(tenant_members.tenant_id, auth.uid())
  )
  with check (
    public.is_global_superadmin()
    or public.has_tenant_admin_access(tenant_members.tenant_id, auth.uid())
  );

-- Keep tenant_invites policy aligned and non-recursive.
drop policy if exists "tenant_invites: workspace admin manage invites" on public.tenant_invites;
create policy "tenant_invites: workspace admin manage invites"
  on public.tenant_invites
  for all
  using (
    deleted_at is null
    and (
      public.is_global_superadmin()
      or public.has_tenant_admin_access(tenant_invites.tenant_id, auth.uid())
    )
  )
  with check (
    public.is_global_superadmin()
    or public.has_tenant_admin_access(tenant_invites.tenant_id, auth.uid())
  );