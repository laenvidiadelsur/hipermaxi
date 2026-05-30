-- Seed Data para Desarrollo - Aicobranzas
-- Objetivo: cargar mocks para el usuario carlosrichterhurtado@gmail.com
-- Ejecutar en Supabase Dashboard > SQL Editor

do $$
declare
  v_email text := 'carlosrichterhurtado@gmail.com';
  v_user_id uuid;
  v_tenant_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_contact_id_1 uuid;
  v_contact_id_2 uuid;
  v_contact_id_3 uuid;
  v_debt_id_1 uuid;
  v_debt_id_2 uuid;
  v_debt_id_3 uuid;
begin
  -- 1) Verificar que el usuario exista en Auth
  select id into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'No existe usuario Auth para %. Crealo primero en Supabase Auth.', v_email;
  end if;

  -- 2) Tenant demo
  insert into public.tenants (id, name, nit, address)
  values (v_tenant_id, 'Empresa Demo S.R.L.', '12345678', 'Av. Principal 123, La Paz')
  on conflict (id) do update
    set name = excluded.name,
        nit = excluded.nit,
        address = excluded.address,
        deleted_at = null;

  -- 3) Perfil de usuario app
  insert into public.users (id, name, email, role, tenant_id, enabled)
  values (v_user_id, 'Carlos Richter', v_email, 'Admin', v_tenant_id, true)
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email,
        role = 'Admin',
        tenant_id = v_tenant_id,
        enabled = true,
        deleted_at = null;

  -- 4) Membership para multi-workspace
  insert into public.tenant_members (tenant_id, user_id, role, enabled)
  values (v_tenant_id, v_user_id, 'Admin', true)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role,
        enabled = true,
        deleted_at = null;

  -- 5) Contactos mock (no duplica por tenant + nombre)
  insert into public.contacts (name, phone_number, email, tenant_id, created_by, updated_by)
  select 'Juan Carlos Perez', '+59170012345', 'juan.mock@demo.com', v_tenant_id, v_user_id, v_user_id
  where not exists (
    select 1 from public.contacts c
    where c.tenant_id = v_tenant_id and c.name = 'Juan Carlos Perez' and c.deleted_at is null
  );

  insert into public.contacts (name, phone_number, email, tenant_id, created_by, updated_by)
  select 'Maria Fernandez', '+59171123456', 'maria.mock@demo.com', v_tenant_id, v_user_id, v_user_id
  where not exists (
    select 1 from public.contacts c
    where c.tenant_id = v_tenant_id and c.name = 'Maria Fernandez' and c.deleted_at is null
  );

  insert into public.contacts (name, phone_number, email, tenant_id, created_by, updated_by)
  select 'Roberto Mamani', '+59172234567', 'roberto.mock@demo.com', v_tenant_id, v_user_id, v_user_id
  where not exists (
    select 1 from public.contacts c
    where c.tenant_id = v_tenant_id and c.name = 'Roberto Mamani' and c.deleted_at is null
  );

  -- 6) IDs de contactos
  select id into v_contact_id_1
  from public.contacts
  where tenant_id = v_tenant_id and name = 'Juan Carlos Perez' and deleted_at is null
  order by created_at asc
  limit 1;

  select id into v_contact_id_2
  from public.contacts
  where tenant_id = v_tenant_id and name = 'Maria Fernandez' and deleted_at is null
  order by created_at asc
  limit 1;

  select id into v_contact_id_3
  from public.contacts
  where tenant_id = v_tenant_id and name = 'Roberto Mamani' and deleted_at is null
  order by created_at asc
  limit 1;

  -- 7) Deudas agregadas por contacto
  insert into public.debts (contact_id, debt_count, debt_paid_count, debt_pending_count, total_debt, total_paid, total_pending, debt_status, tenant_id, created_by, updated_by)
  select v_contact_id_1, 2, 0, 2, 1500, 0, 1500, 'Active', v_tenant_id, v_user_id, v_user_id
  where not exists (select 1 from public.debts d where d.contact_id = v_contact_id_1 and d.tenant_id = v_tenant_id and d.deleted_at is null);

  insert into public.debts (contact_id, debt_count, debt_paid_count, debt_pending_count, total_debt, total_paid, total_pending, debt_status, tenant_id, created_by, updated_by)
  select v_contact_id_2, 1, 0, 1, 890, 0, 890, 'Pending', v_tenant_id, v_user_id, v_user_id
  where not exists (select 1 from public.debts d where d.contact_id = v_contact_id_2 and d.tenant_id = v_tenant_id and d.deleted_at is null);

  insert into public.debts (contact_id, debt_count, debt_paid_count, debt_pending_count, total_debt, total_paid, total_pending, debt_status, tenant_id, created_by, updated_by)
  select v_contact_id_3, 3, 1, 2, 3200, 1200, 2000, 'Active', v_tenant_id, v_user_id, v_user_id
  where not exists (select 1 from public.debts d where d.contact_id = v_contact_id_3 and d.tenant_id = v_tenant_id and d.deleted_at is null);

  -- 8) IDs de deudas
  select id into v_debt_id_1 from public.debts where contact_id = v_contact_id_1 and tenant_id = v_tenant_id and deleted_at is null order by created_at asc limit 1;
  select id into v_debt_id_2 from public.debts where contact_id = v_contact_id_2 and tenant_id = v_tenant_id and deleted_at is null order by created_at asc limit 1;
  select id into v_debt_id_3 from public.debts where contact_id = v_contact_id_3 and tenant_id = v_tenant_id and deleted_at is null order by created_at asc limit 1;

  -- 9) Detalles de deuda mock
  insert into public.debt_details (contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by)
  select v_contact_id_1, v_debt_id_1, 1000, 'Cuota marzo', 50, 1050, current_date - 12, 'Expired', v_user_id, v_user_id
  where not exists (select 1 from public.debt_details dd where dd.debt_id = v_debt_id_1 and dd.debt_description = 'Cuota marzo' and dd.deleted_at is null);

  insert into public.debt_details (contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by)
  select v_contact_id_1, v_debt_id_1, 500, 'Cuota abril', 0, 500, current_date + 8, 'Pending', v_user_id, v_user_id
  where not exists (select 1 from public.debt_details dd where dd.debt_id = v_debt_id_1 and dd.debt_description = 'Cuota abril' and dd.deleted_at is null);

  insert into public.debt_details (contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by)
  select v_contact_id_2, v_debt_id_2, 890, 'Servicio tecnico', 0, 890, current_date + 3, 'Pending', v_user_id, v_user_id
  where not exists (select 1 from public.debt_details dd where dd.debt_id = v_debt_id_2 and dd.debt_description = 'Servicio tecnico' and dd.deleted_at is null);

  insert into public.debt_details (contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by)
  select v_contact_id_3, v_debt_id_3, 1200, 'Factura enero', 0, 1200, current_date - 40, 'Paid', v_user_id, v_user_id
  where not exists (select 1 from public.debt_details dd where dd.debt_id = v_debt_id_3 and dd.debt_description = 'Factura enero' and dd.deleted_at is null);

  insert into public.debt_details (contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by)
  select v_contact_id_3, v_debt_id_3, 1100, 'Factura febrero', 90, 1190, current_date - 10, 'Active', v_user_id, v_user_id
  where not exists (select 1 from public.debt_details dd where dd.debt_id = v_debt_id_3 and dd.debt_description = 'Factura febrero' and dd.deleted_at is null);

  insert into public.debt_details (contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by)
  select v_contact_id_3, v_debt_id_3, 900, 'Factura marzo', 0, 900, current_date + 5, 'Pending', v_user_id, v_user_id
  where not exists (select 1 from public.debt_details dd where dd.debt_id = v_debt_id_3 and dd.debt_description = 'Factura marzo' and dd.deleted_at is null);

  raise notice 'Seed OK para % (user_id=% tenant_id=%)', v_email, v_user_id, v_tenant_id;
end $$;
