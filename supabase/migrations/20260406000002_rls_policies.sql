-- ============================================================
-- RLS POLICIES — Aicobranzas
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Helper function: get current user's role ─────────────────
-- Avoids N+1 by caching the role lookup within one request
create or replace function public.current_user_role()
returns text language sql stable security definer as $$
  select role from public.users where id = auth.uid() and deleted_at is null limit 1;
$$;

create or replace function public.current_user_tenant()
returns uuid language sql stable security definer as $$
  select tenant_id from public.users where id = auth.uid() and deleted_at is null limit 1;
$$;

-- ============================================================
-- USERS TABLE
-- ============================================================
-- Own profile: every authenticated user can read their own row
create policy "users: read own profile"
  on public.users for select
  using (id = auth.uid());

-- Superadmin reads all users
create policy "users: superadmin read all"
  on public.users for select
  using (public.current_user_role() = 'Superadmin');

-- Admin reads users in same tenant
create policy "users: admin read tenant"
  on public.users for select
  using (
    public.current_user_role() = 'Admin'
    and tenant_id = public.current_user_tenant()
  );

-- Admin can update users in same tenant
create policy "users: admin update tenant"
  on public.users for update
  using (
    public.current_user_role() in ('Admin', 'Superadmin')
    and tenant_id = public.current_user_tenant()
  );

-- Superadmin full write access
create policy "users: superadmin insert"
  on public.users for insert
  with check (public.current_user_role() = 'Superadmin');

create policy "users: superadmin update all"
  on public.users for update
  using (public.current_user_role() = 'Superadmin');

create policy "users: superadmin delete all"
  on public.users for delete
  using (public.current_user_role() = 'Superadmin');

-- ============================================================
-- TENANTS TABLE
-- ============================================================
create policy "tenants: read own tenant"
  on public.tenants for select
  using (id = public.current_user_tenant());

create policy "tenants: superadmin read all"
  on public.tenants for select
  using (public.current_user_role() = 'Superadmin');

create policy "tenants: superadmin write"
  on public.tenants for all
  using (public.current_user_role() = 'Superadmin');

-- ============================================================
-- CONTACTS TABLE
-- ============================================================
create policy "contacts: tenant isolation select"
  on public.contacts for select
  using (tenant_id = public.current_user_tenant());

create policy "contacts: tenant isolation insert"
  on public.contacts for insert
  with check (tenant_id = public.current_user_tenant());

create policy "contacts: tenant isolation update"
  on public.contacts for update
  using (tenant_id = public.current_user_tenant());

create policy "contacts: admin delete"
  on public.contacts for delete
  using (
    tenant_id = public.current_user_tenant()
    and public.current_user_role() in ('Admin', 'Superadmin')
  );

-- ============================================================
-- DEBTS / DEBT_DETAILS
-- ============================================================
create policy "debts: tenant select"
  on public.debts for select
  using (tenant_id = public.current_user_tenant());

create policy "debts: tenant insert"
  on public.debts for insert
  with check (tenant_id = public.current_user_tenant());

create policy "debts: tenant update"
  on public.debts for update
  using (tenant_id = public.current_user_tenant());

-- Debt details — inherit via debt's tenant
create policy "debt_details: select via debt tenant"
  on public.debt_details for select
  using (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and d.tenant_id = public.current_user_tenant()
    )
  );

create policy "debt_details: insert"
  on public.debt_details for insert
  with check (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and d.tenant_id = public.current_user_tenant()
    )
  );

create policy "debt_details: update"
  on public.debt_details for update
  using (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and d.tenant_id = public.current_user_tenant()
    )
  );

-- ============================================================
-- WHATSAPP (configurations, templates, threads, messages)
-- ============================================================
create policy "whatsapp_configurations: tenant"
  on public.whatsapp_configurations for all
  using (tenant_id = public.current_user_tenant())
  with check (tenant_id = public.current_user_tenant());

create policy "whatsapp_templates: tenant via config"
  on public.whatsapp_templates for all
  using (
    exists (
      select 1 from public.whatsapp_configurations wc
      where wc.id = whatsapp_configuration_id
        and wc.tenant_id = public.current_user_tenant()
    )
  );

create policy "whatsapp_threads: tenant"
  on public.whatsapp_threads for all
  using (tenant_id = public.current_user_tenant())
  with check (tenant_id = public.current_user_tenant());

create policy "whatsapp_messages: thread tenant"
  on public.whatsapp_messages for select
  using (
    exists (
      select 1 from public.whatsapp_threads t
      where t.id = whatsapp_thread_id
        and t.tenant_id = public.current_user_tenant()
    )
  );

create policy "whatsapp_messages: thread tenant insert"
  on public.whatsapp_messages for insert
  with check (
    exists (
      select 1 from public.whatsapp_threads t
      where t.id = whatsapp_thread_id
        and t.tenant_id = public.current_user_tenant()
    )
  );

create policy "whatsapp_messages: thread tenant update"
  on public.whatsapp_messages for update
  using (
    exists (
      select 1 from public.whatsapp_threads t
      where t.id = whatsapp_thread_id
        and t.tenant_id = public.current_user_tenant()
    )
  );

-- ============================================================
-- SUBSCRIPTIONS & PLANS
-- ============================================================
create policy "subscription_plans: all authenticated can read"
  on public.subscription_plans for select
  using (auth.uid() is not null and deleted_at is null);

create policy "subscription_plans: superadmin write"
  on public.subscription_plans for all
  using (public.current_user_role() = 'Superadmin');

create policy "subscriptions: tenant select"
  on public.subscriptions for select
  using (
    tenant_id = public.current_user_tenant()
    or public.current_user_role() = 'Superadmin'
  );

create policy "subscriptions: superadmin write"
  on public.subscriptions for all
  using (public.current_user_role() = 'Superadmin');

-- ============================================================
-- REMINDERS / LOGS (tenant scoped via debt)
-- ============================================================
create policy "reminders: tenant via debt"
  on public.reminders for all
  using (
    exists (
      select 1 from public.debts d
      where d.id = debt_id
        and d.tenant_id = public.current_user_tenant()
    )
  );

create policy "reminder_programs: tenant via reminder"
  on public.reminder_programs for all
  using (
    exists (
      select 1 from public.reminders r
      join public.debts d on d.id = r.debt_id
      where r.id = reminder_id
        and d.tenant_id = public.current_user_tenant()
    )
  );

create policy "reminder_logs: tenant via program"
  on public.reminder_logs for all
  using (
    exists (
      select 1 from public.reminder_programs rp
      join public.reminders r on r.id = rp.reminder_id
      join public.debts d on d.id = r.debt_id
      where rp.id = reminder_program_id
        and d.tenant_id = public.current_user_tenant()
    )
  );

-- ============================================================
-- QRS
-- ============================================================
create policy "qrs: authenticated select"
  on public.qrs for select
  using (auth.uid() is not null);

create policy "qrs: admin write"
  on public.qrs for all
  using (public.current_user_role() in ('Admin', 'Superadmin'));

create policy "subscription_qrs: tenant"
  on public.subscription_qrs for all
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and (s.tenant_id = public.current_user_tenant() or public.current_user_role() = 'Superadmin')
    )
  );

create policy "debt_detail_qrs: tenant"
  on public.debt_detail_qrs for all
  using (
    exists (
      select 1 from public.debt_details dd
      join public.debts d on d.id = dd.debt_id
      where dd.id = debt_detail_id
        and d.tenant_id = public.current_user_tenant()
    )
  );
