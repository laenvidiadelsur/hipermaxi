-- IAM normalization cutover
-- Source of truth for tenant authorization: public.tenant_members

-- helper: global superadmin only from users profile
create or replace function public.is_global_superadmin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.deleted_at is null
      and u.enabled = true
      and u.role = 'Superadmin'
  );
$$;

-- helper: current tenant (compatibility). Uses preferred users.tenant_id if member, else first enabled membership.
create or replace function public.current_user_tenant()
returns uuid
language sql
stable
security definer
as $$
  with preferred as (
    select u.tenant_id
    from public.users u
    where u.id = auth.uid()
      and u.deleted_at is null
      and u.tenant_id is not null
    limit 1
  )
  select tm.tenant_id
  from public.tenant_members tm
  left join preferred p on p.tenant_id = tm.tenant_id
  where tm.user_id = auth.uid()
    and tm.deleted_at is null
    and tm.enabled = true
  order by case when p.tenant_id is not null then 0 else 1 end, tm.created_at asc
  limit 1;
$$;

-- helper: current role for compatibility checks
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
as $$
  select case
    when public.is_global_superadmin() then 'Superadmin'
    else coalesce((
      select tm.role
      from public.tenant_members tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = public.current_user_tenant()
        and tm.deleted_at is null
        and tm.enabled = true
      limit 1
    ), 'Agente')
  end;
$$;

create or replace function public.current_user_has_tenant_access(target_tenant_id uuid, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
as $$
  select
    public.is_global_superadmin()
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = target_tenant_id
        and tm.user_id = auth.uid()
        and tm.deleted_at is null
        and tm.enabled = true
        and (
          allowed_roles is null
          or tm.role = any(allowed_roles)
        )
    );
$$;

-- USERS policies
drop policy if exists "users: admin read tenant" on public.users;
create policy "users: admin read tenant"
  on public.users for select
  using (
    public.is_global_superadmin()
    or exists (
      select 1
      from public.tenant_members my_tm
      join public.tenant_members other_tm on other_tm.tenant_id = my_tm.tenant_id
      where my_tm.user_id = auth.uid()
        and my_tm.deleted_at is null
        and my_tm.enabled = true
        and my_tm.role in ('Admin', 'Superadmin')
        and other_tm.user_id = users.id
        and other_tm.deleted_at is null
    )
  );

drop policy if exists "users: admin update tenant" on public.users;
create policy "users: admin update tenant"
  on public.users for update
  using (
    public.is_global_superadmin()
    or exists (
      select 1
      from public.tenant_members my_tm
      join public.tenant_members other_tm on other_tm.tenant_id = my_tm.tenant_id
      where my_tm.user_id = auth.uid()
        and my_tm.deleted_at is null
        and my_tm.enabled = true
        and my_tm.role in ('Admin', 'Superadmin')
        and other_tm.user_id = users.id
        and other_tm.deleted_at is null
    )
  );

drop policy if exists "users: superadmin read all" on public.users;
create policy "users: superadmin read all"
  on public.users for select
  using (public.is_global_superadmin());

drop policy if exists "users: superadmin insert" on public.users;
create policy "users: superadmin insert"
  on public.users for insert
  with check (public.is_global_superadmin());

drop policy if exists "users: superadmin update all" on public.users;
create policy "users: superadmin update all"
  on public.users for update
  using (public.is_global_superadmin());

drop policy if exists "users: superadmin delete all" on public.users;
create policy "users: superadmin delete all"
  on public.users for delete
  using (public.is_global_superadmin());

-- TENANTS
 drop policy if exists "tenants: read own tenant" on public.tenants;
create policy "tenants: read own tenant"
  on public.tenants for select
  using (public.current_user_has_tenant_access(id));

drop policy if exists "tenants: superadmin read all" on public.tenants;
create policy "tenants: superadmin read all"
  on public.tenants for select
  using (public.is_global_superadmin());

drop policy if exists "tenants: superadmin write" on public.tenants;
create policy "tenants: superadmin write"
  on public.tenants for all
  using (public.is_global_superadmin());

-- Core tenant-scoped entities
 drop policy if exists "contacts: tenant isolation select" on public.contacts;
create policy "contacts: tenant isolation select"
  on public.contacts for select
  using (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "contacts: tenant isolation insert" on public.contacts;
create policy "contacts: tenant isolation insert"
  on public.contacts for insert
  with check (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "contacts: tenant isolation update" on public.contacts;
create policy "contacts: tenant isolation update"
  on public.contacts for update
  using (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "contacts: admin delete" on public.contacts;
create policy "contacts: admin delete"
  on public.contacts for delete
  using (public.current_user_has_tenant_access(tenant_id, array['Admin','Superadmin']));

drop policy if exists "debts: tenant select" on public.debts;
create policy "debts: tenant select"
  on public.debts for select
  using (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "debts: tenant insert" on public.debts;
create policy "debts: tenant insert"
  on public.debts for insert
  with check (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "debts: tenant update" on public.debts;
create policy "debts: tenant update"
  on public.debts for update
  using (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "debt_details: select via debt tenant" on public.debt_details;
create policy "debt_details: select via debt tenant"
  on public.debt_details for select
  using (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );

drop policy if exists "debt_details: insert" on public.debt_details;
create policy "debt_details: insert"
  on public.debt_details for insert
  with check (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );

drop policy if exists "debt_details: update" on public.debt_details;
create policy "debt_details: update"
  on public.debt_details for update
  using (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );

-- WhatsApp scope
 drop policy if exists "whatsapp_configurations: tenant" on public.whatsapp_configurations;
create policy "whatsapp_configurations: tenant"
  on public.whatsapp_configurations for all
  using (public.current_user_has_tenant_access(tenant_id))
  with check (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "whatsapp_templates: tenant via config" on public.whatsapp_templates;
create policy "whatsapp_templates: tenant via config"
  on public.whatsapp_templates for all
  using (
    exists (
      select 1 from public.whatsapp_configurations wc
      where wc.id = whatsapp_configuration_id
        and public.current_user_has_tenant_access(wc.tenant_id)
    )
  );

drop policy if exists "whatsapp_threads: tenant" on public.whatsapp_threads;
create policy "whatsapp_threads: tenant"
  on public.whatsapp_threads for all
  using (public.current_user_has_tenant_access(tenant_id))
  with check (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "whatsapp_messages: thread tenant" on public.whatsapp_messages;
create policy "whatsapp_messages: thread tenant"
  on public.whatsapp_messages for select
  using (
    exists (
      select 1 from public.whatsapp_threads t
      where t.id = whatsapp_thread_id
        and public.current_user_has_tenant_access(t.tenant_id)
    )
  );

drop policy if exists "whatsapp_messages: thread tenant insert" on public.whatsapp_messages;
create policy "whatsapp_messages: thread tenant insert"
  on public.whatsapp_messages for insert
  with check (
    exists (
      select 1 from public.whatsapp_threads t
      where t.id = whatsapp_thread_id
        and public.current_user_has_tenant_access(t.tenant_id)
    )
  );

drop policy if exists "whatsapp_messages: thread tenant update" on public.whatsapp_messages;
create policy "whatsapp_messages: thread tenant update"
  on public.whatsapp_messages for update
  using (
    exists (
      select 1 from public.whatsapp_threads t
      where t.id = whatsapp_thread_id
        and public.current_user_has_tenant_access(t.tenant_id)
    )
  );

drop policy if exists "subscriptions: tenant select" on public.subscriptions;
create policy "subscriptions: tenant select"
  on public.subscriptions for select
  using (public.current_user_has_tenant_access(tenant_id));

drop policy if exists "subscriptions: superadmin write" on public.subscriptions;
create policy "subscriptions: superadmin write"
  on public.subscriptions for all
  using (public.is_global_superadmin());

-- Debt-derived entities
 drop policy if exists "reminders: tenant via debt" on public.reminders;
create policy "reminders: tenant via debt"
  on public.reminders for all
  using (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );

drop policy if exists "reminder_programs: tenant via reminder" on public.reminder_programs;
create policy "reminder_programs: tenant via reminder"
  on public.reminder_programs for all
  using (
    exists (
      select 1 from public.reminders r
      join public.debts d on d.id = r.debt_id
      where r.id = reminder_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );

drop policy if exists "reminder_logs: tenant via program" on public.reminder_logs;
create policy "reminder_logs: tenant via program"
  on public.reminder_logs for all
  using (
    exists (
      select 1 from public.reminder_programs rp
      join public.reminders r on r.id = rp.reminder_id
      join public.debts d on d.id = r.debt_id
      where rp.id = reminder_program_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );

-- QR entities
 drop policy if exists "qrs: admin write" on public.qrs;
create policy "qrs: admin write"
  on public.qrs for all
  using (
    public.is_global_superadmin()
    or public.current_user_role() = 'Admin'
  );

drop policy if exists "subscription_qrs: tenant" on public.subscription_qrs;
create policy "subscription_qrs: tenant"
  on public.subscription_qrs for all
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and public.current_user_has_tenant_access(s.tenant_id)
    )
  );

drop policy if exists "debt_detail_qrs: tenant" on public.debt_detail_qrs;
create policy "debt_detail_qrs: tenant"
  on public.debt_detail_qrs for all
  using (
    exists (
      select 1 from public.debt_details dd
      join public.debts d on d.id = dd.debt_id
      where dd.id = debt_detail_id
        and public.current_user_has_tenant_access(d.tenant_id)
    )
  );
