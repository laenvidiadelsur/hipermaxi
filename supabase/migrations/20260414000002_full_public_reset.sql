-- FULL RESET (public schema)
-- DANGER: Drops and recreates all objects in public schema.
-- Auth (auth.users) is NOT modified.

begin;

-- Drop everything in public
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Re-grant default privileges expected by Supabase
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

commit;

-- Rebuild schema objects

-- ===== Begin: supabase\\migrations\\20260406000001_initial_schema.sql =====
-- ============================================================
-- AICOBRANZAS - Initial Schema Migration
-- Generated: 2026-04-06
-- Based on: ERD + project source analysis (src/)
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- AUDIT HELPER: automatically set created/updated timestamps
-- ============================================================
create or replace function set_audit_fields()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    new.deleted_at := null;
  elsif TG_OP = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ============================================================
-- 1. TENANTS
-- Top-level grouping for multi-tenant SaaS
-- ============================================================
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(350) not null,
  nit           varchar(20),
  address       varchar(450),
  -- Audit fields (required in every table per design note)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid,
  updated_by    uuid,
  deleted_by    uuid
);

create trigger trg_tenants_audit
  before insert or update on public.tenants
  for each row execute function set_audit_fields();

-- ============================================================
-- 2. USERS
-- App users (Superadmin, Admin, Agente)
-- ============================================================
create table public.users (
  id                uuid primary key default gen_random_uuid(),
  name              varchar(200) not null,
  email             varchar(60) not null unique,
  role              varchar(20) not null check (role in ('Superadmin', 'Admin', 'Agente')),
  role_description  varchar(50),
  enabled           boolean not null default true,
  last_login        timestamptz,
  tenant_id         uuid references public.tenants(id) on delete restrict,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_users_audit
  before insert or update on public.users
  for each row execute function set_audit_fields();

create index idx_users_tenant on public.users(tenant_id);
create index idx_users_email on public.users(email) where deleted_at is null;

-- ============================================================
-- 3. SUBSCRIPTION PLANS
-- Tiered plans available in the SaaS
-- ============================================================
create table public.subscription_plans (
  id               uuid primary key default gen_random_uuid(),
  name             varchar(120) not null,
  description      varchar(500),
  price            decimal(13,2) not null,
  duration_in_days int not null default 30,
  renewable        boolean not null default true,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_subscription_plans_audit
  before insert or update on public.subscription_plans
  for each row execute function set_audit_fields();

-- ============================================================
-- 4. SUBSCRIPTIONS
-- Active subscription of a tenant to a plan
-- ============================================================
create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  subscription_plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  price               decimal(13,2) not null,
  expiration_date     date not null,
  enable              boolean not null default true,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_subscriptions_audit
  before insert or update on public.subscriptions
  for each row execute function set_audit_fields();

create index idx_subscriptions_tenant on public.subscriptions(tenant_id);

-- ============================================================
-- 5. CONTACTS
-- Clientes/deudores del tenant
-- ============================================================
create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  name              varchar(200) not null,
  phone_number      varchar(20),
  email             varchar(80),
  last_interaction  timestamptz,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_contacts_audit
  before insert or update on public.contacts
  for each row execute function set_audit_fields();

create index idx_contacts_tenant on public.contacts(tenant_id);
create index idx_contacts_phone on public.contacts(phone_number) where deleted_at is null;

-- ============================================================
-- 6. WHATSAPP CONFIGURATIONS
-- Meta / WhatsApp Business API credentials per tenant
-- Matches Configuracion.tsx fields: MetaId, WabaId, Token
-- ============================================================
create table public.whatsapp_configurations (
  id         uuid primary key default gen_random_uuid(),
  meta_id    varchar(300) not null,      -- Meta App ID
  waba_id    varchar(300) not null,      -- WhatsApp Business Account ID
  token      varchar(500) not null,      -- Access Token (store encrypted)
  tenant_id  uuid not null unique references public.tenants(id) on delete cascade,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_whatsapp_configurations_audit
  before insert or update on public.whatsapp_configurations
  for each row execute function set_audit_fields();

-- ============================================================
-- 7. WHATSAPP TEMPLATES
-- Meta-approved message templates (used for automated reminders)
-- Matches GestionDeudas.tsx metaTemplates + ERD
-- ============================================================
create type public.template_format_type as enum ('named', 'positional');

create table public.whatsapp_templates (
  id                         uuid primary key default gen_random_uuid(),
  whatsapp_configuration_id  uuid not null references public.whatsapp_configurations(id) on delete cascade,
  template_name              varchar(300) not null,
  format_type                public.template_format_type not null default 'named',
  -- Args stored as JSON array of strings
  args                       text[] default '{}',
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_whatsapp_templates_audit
  before insert or update on public.whatsapp_templates
  for each row execute function set_audit_fields();

create index idx_whatsapp_templates_config on public.whatsapp_templates(whatsapp_configuration_id);

-- ============================================================
-- 8. WHATSAPP THREADS
-- One thread per contact â€” the conversation channel
-- Matches Bandeja.tsx Conversation type
-- ============================================================
create table public.whatsapp_threads (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  last_message      varchar(300),
  last_interaction  timestamptz,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_whatsapp_threads_audit
  before insert or update on public.whatsapp_threads
  for each row execute function set_audit_fields();

create index idx_whatsapp_threads_contact on public.whatsapp_threads(contact_id);
create index idx_whatsapp_threads_tenant on public.whatsapp_threads(tenant_id);

-- ============================================================
-- 9. DEBTS
-- Aggregate debt info per contact
-- Maps to Debts entity in ERD + GestionDeudas.tsx stats
-- ============================================================
create type public.debt_status as enum ('Pending', 'Active', 'Paid', 'Expired');

create table public.debts (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references public.contacts(id) on delete cascade,
  debt_count          int not null default 0,
  debt_paid_count     int not null default 0,
  debt_pending_count  int not null default 0,
  total_debt          decimal(13,2) not null default 0,
  total_paid          decimal(13,2) not null default 0,
  total_pending       decimal(13,2) not null default 0,
  debt_status         public.debt_status not null default 'Pending',
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_debts_audit
  before insert or update on public.debts
  for each row execute function set_audit_fields();

create index idx_debts_contact on public.debts(contact_id);
create index idx_debts_tenant on public.debts(tenant_id);

-- ============================================================
-- 10. DEBT DETAILS
-- Individual invoices/line items per debt
-- Maps to DebtDetails + GestionDeudas.tsx Deuda type
-- ============================================================
create table public.debt_details (
  id                   uuid primary key default gen_random_uuid(),
  contact_id           uuid not null references public.contacts(id) on delete cascade,
  debt_id              uuid not null references public.debts(id) on delete cascade,
  debt_amount          decimal(13,2) not null,
  debt_description     varchar(300),
  penalty_amount       decimal(13,2) not null default 0,
  total                decimal(13,2) not null,
  expiration_date      date not null,
  -- Status: Pending = pendiente de vencer, Active = en gestiÃ³n,
  --         Paid = pagada, Expired = vencida
  debt_status          public.debt_status not null default 'Pending',
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_debt_details_audit
  before insert or update on public.debt_details
  for each row execute function set_audit_fields();

create index idx_debt_details_debt on public.debt_details(debt_id);
create index idx_debt_details_contact on public.debt_details(contact_id);
create index idx_debt_details_expiration on public.debt_details(expiration_date) where deleted_at is null;

-- ============================================================
-- 11. WHATSAPP MESSAGES
-- Individual messages within a thread
-- Matches Bandeja.tsx Message type + ERD
-- ============================================================
create table public.whatsapp_messages (
  id                  uuid primary key default gen_random_uuid(),
  whatsapp_thread_id  uuid not null references public.whatsapp_threads(id) on delete cascade,
  message_text        varchar(1000),
  media_url           varchar(500),
  incoming            boolean not null default false,   -- true = mensaje del cliente
  read                boolean not null default false,
  read_at             timestamptz,
  sent_at             timestamptz,
  reminder_log_id     uuid,   -- FK filled after reminder_logs table exists (see below)
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_whatsapp_messages_audit
  before insert or update on public.whatsapp_messages
  for each row execute function set_audit_fields();

create index idx_whatsapp_messages_thread on public.whatsapp_messages(whatsapp_thread_id);

-- ============================================================
-- 12. REMINDERS
-- Reminder campaigns linked to a debt
-- Maps to Reminders in ERD + GestionDeudas.tsx ReminderRule
-- ============================================================
create type public.reminder_action_type as enum ('manually', 'automatically');

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  debt_id      uuid not null references public.debts(id) on delete cascade,
  action_type  public.reminder_action_type not null default 'manually',
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_reminders_audit
  before insert or update on public.reminders
  for each row execute function set_audit_fields();

create index idx_reminders_debt on public.reminders(debt_id);

-- ============================================================
-- 13. REMINDER PROGRAMS
-- Automated schedule rules (X days before/after expiration)
-- Maps to ReminderPrograms in ERD + GestionDeudas.tsx reminderRules
-- ============================================================
create table public.reminder_programs (
  id                      uuid primary key default gen_random_uuid(),
  reminder_id             uuid not null references public.reminders(id) on delete cascade,
  days_ref_debt           int not null,            -- negative = before, positive = after expiration
  whatsapp_template_id    uuid references public.whatsapp_templates(id) on delete set null,
  reminder_count          int not null default 0,
  reminder_sent_count     int not null default 0,
  reminder_sent_pending   int not null default 0,
  reminder_sent_error     int not null default 0,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_reminder_programs_audit
  before insert or update on public.reminder_programs
  for each row execute function set_audit_fields();

create index idx_reminder_programs_reminder on public.reminder_programs(reminder_id);

-- ============================================================
-- 14. REMINDER LOGS
-- Execution log for each message send attempt
-- Maps to ReminderLogs in ERD
-- ============================================================
create type public.sent_status as enum ('Pending', 'Sent');

create table public.reminder_logs (
  id                    uuid primary key default gen_random_uuid(),
  reminder_program_id   uuid not null references public.reminder_programs(id) on delete cascade,
  debt_detail_id        uuid not null references public.debt_details(id) on delete cascade,
  whatsapp_template_id  uuid references public.whatsapp_templates(id) on delete set null,
  sent_at               timestamptz,
  sent_status           public.sent_status not null default 'Pending',
  success               boolean not null default false,
  error_message         varchar(500),
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_reminder_logs_audit
  before insert or update on public.reminder_logs
  for each row execute function set_audit_fields();

create index idx_reminder_logs_program on public.reminder_logs(reminder_program_id);
create index idx_reminder_logs_debt_detail on public.reminder_logs(debt_detail_id);

-- Add FK from whatsapp_messages to reminder_logs now that the table exists
alter table public.whatsapp_messages
  add constraint fk_whatsapp_messages_reminder_log
  foreign key (reminder_log_id)
  references public.reminder_logs(id)
  on delete set null;

create index idx_whatsapp_messages_reminder_log on public.whatsapp_messages(reminder_log_id);

-- ============================================================
-- 15. QRS
-- QR codes for payment links
-- ============================================================
create table public.qrs (
  id               uuid primary key default gen_random_uuid(),
  external_id      varchar(50),
  expiration_date  date,
  paid             boolean not null default false,
  paid_at          boolean not null default false,   -- timestamp flag; can be refined to timestamptz
  amount           decimal(13,2) not null,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id)
);

create trigger trg_qrs_audit
  before insert or update on public.qrs
  for each row execute function set_audit_fields();

-- ============================================================
-- 16. SUBSCRIPTION QRS
-- Junction: QR codes linked to subscriptions
-- ============================================================
create table public.subscription_qrs (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  qr_id            uuid not null references public.qrs(id) on delete cascade,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id),
  unique(subscription_id, qr_id)
);

create trigger trg_subscription_qrs_audit
  before insert or update on public.subscription_qrs
  for each row execute function set_audit_fields();

-- ============================================================
-- 17. DEBT DETAIL QRS
-- Junction: QR codes linked to specific debt detail items
-- ============================================================
create table public.debt_detail_qrs (
  id               uuid primary key default gen_random_uuid(),
  debt_detail_id   uuid not null references public.debt_details(id) on delete cascade,
  qr_id            uuid not null references public.qrs(id) on delete cascade,
  -- Audit fields
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id),
  deleted_by    uuid references public.users(id),
  unique(debt_detail_id, qr_id)
);

create trigger trg_debt_detail_qrs_audit
  before insert or update on public.debt_detail_qrs
  for each row execute function set_audit_fields();

create index idx_debt_detail_qrs_detail on public.debt_detail_qrs(debt_detail_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tenant-scoped tables
-- ============================================================
alter table public.tenants                 enable row level security;
alter table public.users                   enable row level security;
alter table public.subscription_plans      enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.contacts                enable row level security;
alter table public.whatsapp_configurations enable row level security;
alter table public.whatsapp_templates      enable row level security;
alter table public.whatsapp_threads        enable row level security;
alter table public.whatsapp_messages       enable row level security;
alter table public.debts                   enable row level security;
alter table public.debt_details            enable row level security;
alter table public.reminders               enable row level security;
alter table public.reminder_programs       enable row level security;
alter table public.reminder_logs           enable row level security;
alter table public.qrs                     enable row level security;
alter table public.subscription_qrs        enable row level security;
alter table public.debt_detail_qrs         enable row level security;

-- ============================================================
-- SOFT-DELETE HELPER VIEW (example for contacts)
-- Excludes logically deleted rows
-- ============================================================
create view public.v_active_contacts as
  select * from public.contacts where deleted_at is null;

create view public.v_active_debt_details as
  select * from public.debt_details where deleted_at is null;

create view public.v_active_debts as
  select * from public.debts where deleted_at is null;

-- ===== End: supabase\\migrations\\20260406000001_initial_schema.sql =====


-- ===== Begin: supabase\\migrations\\20260406000002_rls_policies.sql =====
-- ============================================================
-- RLS POLICIES â€” Aicobranzas
-- Ejecutar en Supabase Dashboard â†’ SQL Editor
-- ============================================================

-- â”€â”€ Helper function: get current user's role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- Debt details â€” inherit via debt's tenant
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

-- ===== End: supabase\\migrations\\20260406000002_rls_policies.sql =====


-- ===== Begin: supabase\\migrations\\20260406000003_workspaces_and_invites.sql =====
create extension if not exists "pgcrypto";

create table if not exists public.tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        varchar(20) not null check (role in ('Superadmin', 'Admin', 'Agente')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (tenant_id, user_id)
);

create trigger trg_tenant_members_audit
  before insert or update on public.tenant_members
  for each row execute function set_audit_fields();

create table if not exists public.tenant_invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       varchar(120) not null,
  role        varchar(20) not null check (role in ('Admin', 'Agente')),
  status      varchar(20) not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  expires_at  timestamptz not null default (now() + interval '72 hours'),
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger trg_tenant_invites_audit
  before insert or update on public.tenant_invites
  for each row execute function set_audit_fields();

insert into public.tenant_members (tenant_id, user_id, role, enabled, created_at, updated_at)
select
  u.tenant_id,
  u.id,
  coalesce(u.role, 'Agente'),
  coalesce(u.enabled, true),
  coalesce(u.created_at, now()),
  coalesce(u.updated_at, now())
from public.users u
where u.tenant_id is not null
on conflict (tenant_id, user_id) do nothing;

-- ===== End: supabase\\migrations\\20260406000003_workspaces_and_invites.sql =====


-- ===== Begin: supabase\\migrations\\20260408000001_meta_templates_integration.sql =====
-- Step 1: Add phone_number_id to whatsapp_configurations
ALTER TABLE public.whatsapp_configurations 
ADD COLUMN phone_number_id text;

-- Step 2: Augment whatsapp_templates with Meta fields
ALTER TABLE public.whatsapp_templates 
ADD COLUMN meta_status text DEFAULT 'PENDING' NOT NULL,
ADD COLUMN meta_template_id text,
ADD COLUMN language text DEFAULT 'es_LA' NOT NULL,
ADD COLUMN category text DEFAULT 'UTILITY' NOT NULL,
ADD COLUMN components jsonb DEFAULT '[]'::jsonb NOT NULL;

-- ===== End: supabase\\migrations\\20260408000001_meta_templates_integration.sql =====


-- ===== Begin: supabase\\migrations\\20260408000002_whatsapp_app_webhook_config.sql =====
-- WhatsApp App/Webhook oriented configuration fields
ALTER TABLE public.whatsapp_configurations
ADD COLUMN IF NOT EXISTS channel_name text;

ALTER TABLE public.whatsapp_configurations
ADD COLUMN IF NOT EXISTS verify_token text;

ALTER TABLE public.whatsapp_configurations
ADD COLUMN IF NOT EXISTS default_template_language text DEFAULT 'es_LA' NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_configurations_verify_token
ON public.whatsapp_configurations(verify_token)
WHERE verify_token IS NOT NULL;
-- ===== End: supabase\\migrations\\20260408000002_whatsapp_app_webhook_config.sql =====


-- ===== Begin: supabase\\migrations\\20260409000003_whatsapp_window_state.sql =====
-- Conversation window state derived fields (24h inbound window)
ALTER TABLE public.whatsapp_threads
ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
ADD COLUMN IF NOT EXISTS window_open boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS window_expires_at timestamptz;

WITH inbound_last AS (
  SELECT
    wm.whatsapp_thread_id AS thread_id,
    MAX(COALESCE(wm.sent_at, wm.created_at)) AS last_inbound_at
  FROM public.whatsapp_messages wm
  WHERE wm.incoming = true
    AND wm.deleted_at IS NULL
  GROUP BY wm.whatsapp_thread_id
)
UPDATE public.whatsapp_threads wt
SET
  last_inbound_at = il.last_inbound_at,
  window_expires_at = il.last_inbound_at + interval '24 hours',
  window_open = (il.last_inbound_at + interval '24 hours') > now()
FROM inbound_last il
WHERE wt.id = il.thread_id;

UPDATE public.whatsapp_threads
SET
  window_open = false,
  window_expires_at = null
WHERE last_inbound_at IS NULL;

-- ===== End: supabase\\migrations\\20260409000003_whatsapp_window_state.sql =====


-- ===== Begin: supabase\\migrations\\20260410000004_whatsapp_mass_sends.sql =====
-- Mass send orchestration for WhatsApp template deliveries

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS mass_send_id uuid,
ADD COLUMN IF NOT EXISTS mass_send_run_id uuid;

CREATE TABLE IF NOT EXISTS public.whatsapp_mass_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  template_name text NOT NULL,
  language text NOT NULL DEFAULT 'es_LA',
  template_parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'scheduled')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_mass_send_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mass_send_id uuid NOT NULL REFERENCES public.whatsapp_mass_sends(id) ON DELETE CASCADE,
  cron_expression text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Bogota',
  next_run_at timestamptz,
  last_run_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_mass_send_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mass_send_id uuid NOT NULL REFERENCES public.whatsapp_mass_sends(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'scheduled')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_mass_send_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mass_send_id uuid NOT NULL REFERENCES public.whatsapp_mass_sends(id) ON DELETE CASCADE,
  mass_send_run_id uuid NOT NULL REFERENCES public.whatsapp_mass_send_runs(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  template_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  meta_message_id text,
  whatsapp_thread_id uuid REFERENCES public.whatsapp_threads(id) ON DELETE SET NULL,
  whatsapp_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_messages_mass_send_id_fkey'
  ) THEN
    ALTER TABLE public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_mass_send_id_fkey
    FOREIGN KEY (mass_send_id) REFERENCES public.whatsapp_mass_sends(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_messages_mass_send_run_id_fkey'
  ) THEN
    ALTER TABLE public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_mass_send_run_id_fkey
    FOREIGN KEY (mass_send_run_id) REFERENCES public.whatsapp_mass_send_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TRIGGER trg_whatsapp_mass_sends_audit
BEFORE INSERT OR UPDATE ON public.whatsapp_mass_sends
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER trg_whatsapp_mass_send_schedules_audit
BEFORE INSERT OR UPDATE ON public.whatsapp_mass_send_schedules
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER trg_whatsapp_mass_send_runs_audit
BEFORE INSERT OR UPDATE ON public.whatsapp_mass_send_runs
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER trg_whatsapp_mass_send_recipients_audit
BEFORE INSERT OR UPDATE ON public.whatsapp_mass_send_recipients
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE INDEX IF NOT EXISTS idx_whatsapp_mass_sends_tenant
ON public.whatsapp_mass_sends(tenant_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_mass_send_runs_mass_send
ON public.whatsapp_mass_send_runs(mass_send_id, started_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_mass_send_recipients_run
ON public.whatsapp_mass_send_recipients(mass_send_run_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_mass_send
ON public.whatsapp_messages(mass_send_id, mass_send_run_id)
WHERE deleted_at IS NULL;

ALTER TABLE public.whatsapp_mass_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mass_send_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mass_send_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mass_send_recipients ENABLE ROW LEVEL SECURITY;

-- ===== End: supabase\\migrations\\20260410000004_whatsapp_mass_sends.sql =====


-- ===== Begin: supabase\\migrations\\20260411000001_notifications_bell_realtime.sql =====
-- Notifications Bell + Realtime

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  enabled_in_app boolean NOT NULL DEFAULT true,
  enabled_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  deleted_by uuid REFERENCES public.users(id),
  CONSTRAINT notification_preferences_unique UNIQUE (tenant_id, user_id, event_type)
);

DROP TRIGGER IF EXISTS trg_notification_events_audit ON public.notification_events;
CREATE TRIGGER trg_notification_events_audit
BEFORE INSERT OR UPDATE ON public.notification_events
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

DROP TRIGGER IF EXISTS trg_notifications_audit ON public.notifications;
CREATE TRIGGER trg_notifications_audit
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

DROP TRIGGER IF EXISTS trg_notification_preferences_audit ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_audit
BEFORE INSERT OR UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_type
ON public.notification_events(tenant_id, event_type, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON public.notifications(tenant_id, user_id, is_read, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_event
ON public.notification_preferences(tenant_id, user_id, event_type)
WHERE deleted_at IS NULL;

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_events: tenant select admin" ON public.notification_events;
CREATE POLICY "notification_events: tenant select admin"
  ON public.notification_events FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = notification_events.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.enabled = true
        AND tm.role IN ('Admin', 'Superadmin')
    )
  );

DROP POLICY IF EXISTS "notifications: own tenant select" ON public.notifications;
CREATE POLICY "notifications: own tenant select"
  ON public.notifications FOR SELECT
  USING (
    deleted_at IS NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = notifications.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.enabled = true
    )
  );

DROP POLICY IF EXISTS "notifications: own tenant update" ON public.notifications;
CREATE POLICY "notifications: own tenant update"
  ON public.notifications FOR UPDATE
  USING (
    deleted_at IS NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = notifications.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.enabled = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = notifications.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.enabled = true
    )
  );

DROP POLICY IF EXISTS "notification_preferences: own tenant all" ON public.notification_preferences;
CREATE POLICY "notification_preferences: own tenant all"
  ON public.notification_preferences FOR ALL
  USING (
    deleted_at IS NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = notification_preferences.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.enabled = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = notification_preferences.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.enabled = true
    )
  );

-- ===== End: supabase\\migrations\\20260411000001_notifications_bell_realtime.sql =====


-- ===== Begin: supabase\\migrations\\20260413000001_invites_hardening.sql =====
-- Invitations hardening for multi-tenant onboarding

alter table if exists public.tenant_invites
  drop constraint if exists tenant_invites_status_check;

alter table if exists public.tenant_invites
  add constraint tenant_invites_status_check
  check (status in ('pending', 'accepted', 'expired', 'revoked'));

create unique index if not exists ux_tenant_invites_pending_email
  on public.tenant_invites (tenant_id, lower(email))
  where status = 'pending' and deleted_at is null;

alter table if exists public.tenant_members enable row level security;
alter table if exists public.tenant_invites enable row level security;

drop policy if exists "tenant_members: read own memberships" on public.tenant_members;
create policy "tenant_members: read own memberships"
  on public.tenant_members
  for select
  using (user_id = auth.uid() and deleted_at is null);

drop policy if exists "tenant_members: workspace admin manage memberships" on public.tenant_members;
create policy "tenant_members: workspace admin manage memberships"
  on public.tenant_members
  for all
  using (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = tenant_members.tenant_id
        and tm.user_id = auth.uid()
        and tm.enabled = true
        and tm.deleted_at is null
        and tm.role in ('Admin', 'Superadmin')
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = tenant_members.tenant_id
        and tm.user_id = auth.uid()
        and tm.enabled = true
        and tm.deleted_at is null
        and tm.role in ('Admin', 'Superadmin')
    )
  );

drop policy if exists "tenant_invites: workspace admin manage invites" on public.tenant_invites;
create policy "tenant_invites: workspace admin manage invites"
  on public.tenant_invites
  for all
  using (
    deleted_at is null
    and exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = tenant_invites.tenant_id
        and tm.user_id = auth.uid()
        and tm.enabled = true
        and tm.deleted_at is null
        and tm.role in ('Admin', 'Superadmin')
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = tenant_invites.tenant_id
        and tm.user_id = auth.uid()
        and tm.enabled = true
        and tm.deleted_at is null
        and tm.role in ('Admin', 'Superadmin')
    )
  );

-- ===== End: supabase\\migrations\\20260413000001_invites_hardening.sql =====


-- ===== Begin: supabase\\migrations\\20260414000001_iam_roles_tenant_members_cutover.sql =====
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

-- ===== End: supabase\\migrations\\20260414000001_iam_roles_tenant_members_cutover.sql =====
