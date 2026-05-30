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
-- One thread per contact — the conversation channel
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
  -- Status: Pending = pendiente de vencer, Active = en gestión,
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
