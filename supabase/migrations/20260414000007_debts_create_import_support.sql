-- Support manual debt creation and safe batch import.

-- 1) Ensure one aggregate debt row per (tenant, contact)
create unique index if not exists ux_debts_tenant_contact_active
  on public.debts (tenant_id, contact_id)
  where deleted_at is null;

-- 2) Recalculate aggregates from debt_details
create or replace function public.recalc_debts_aggregate(p_tenant_id uuid, p_contact_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_debt_id uuid;
  v_count int;
  v_paid int;
  v_pending int;
  v_total numeric;
  v_total_paid numeric;
  v_total_pending numeric;
  v_status public.debt_status;
begin
  -- ensure aggregate row exists
  select d.id into v_debt_id
  from public.debts d
  where d.tenant_id = p_tenant_id
    and d.contact_id = p_contact_id
    and d.deleted_at is null
  limit 1;

  if v_debt_id is null then
    insert into public.debts (tenant_id, contact_id)
    values (p_tenant_id, p_contact_id)
    returning id into v_debt_id;
  end if;

  select
    count(*)::int,
    sum(case when dd.debt_status = 'Paid' then 1 else 0 end)::int,
    sum(case when dd.debt_status in ('Pending','Active','Expired') then 1 else 0 end)::int,
    coalesce(sum(dd.total),0),
    coalesce(sum(case when dd.debt_status = 'Paid' then dd.total else 0 end),0),
    coalesce(sum(case when dd.debt_status in ('Pending','Active','Expired') then dd.total else 0 end),0)
  into v_count, v_paid, v_pending, v_total, v_total_paid, v_total_pending
  from public.debt_details dd
  where dd.debt_id = v_debt_id
    and dd.deleted_at is null;

  if v_count = 0 then
    v_status := 'Pending';
  elsif exists (
    select 1 from public.debt_details dd
    where dd.debt_id = v_debt_id and dd.deleted_at is null and dd.debt_status = 'Expired'
  ) then
    v_status := 'Expired';
  elsif exists (
    select 1 from public.debt_details dd
    where dd.debt_id = v_debt_id and dd.deleted_at is null and dd.debt_status = 'Active'
  ) then
    v_status := 'Active';
  elsif v_pending = 0 and v_paid > 0 then
    v_status := 'Paid';
  else
    v_status := 'Pending';
  end if;

  update public.debts
  set
    debt_count = v_count,
    debt_paid_count = v_paid,
    debt_pending_count = v_pending,
    total_debt = v_total,
    total_paid = v_total_paid,
    total_pending = v_total_pending,
    debt_status = v_status,
    updated_at = now()
  where id = v_debt_id;
end;
$$;

create or replace function public.trg_debt_details_recalc()
returns trigger
language plpgsql
security definer
as $$
declare
  t_id uuid;
  c_id uuid;
begin
  -- resolve tenant/contact via debts row
  if (tg_op = 'DELETE') then
    select tenant_id, contact_id into t_id, c_id from public.debts where id = old.debt_id;
  else
    select tenant_id, contact_id into t_id, c_id from public.debts where id = new.debt_id;
  end if;

  if t_id is not null and c_id is not null then
    perform public.recalc_debts_aggregate(t_id, c_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_debt_details_recalc on public.debt_details;
create trigger trg_debt_details_recalc
after insert or update or delete on public.debt_details
for each row execute function public.trg_debt_details_recalc();

-- 3) Backfill aggregates for existing rows
DO $$
DECLARE
  r record;
BEGIN
  for r in (
    select distinct d.tenant_id, d.contact_id
    from public.debts d
    where d.deleted_at is null
  ) loop
    perform public.recalc_debts_aggregate(r.tenant_id, r.contact_id);
  end loop;
END $$;