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
