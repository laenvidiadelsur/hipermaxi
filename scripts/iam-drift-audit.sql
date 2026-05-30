-- IAM drift audit (users vs tenant_members)
-- Run in Supabase SQL editor before and after cutover.

-- 1) users without active tenant membership (excluding soft-deleted users)
select u.id, u.email, u.role, u.tenant_id, u.enabled
from public.users u
where u.deleted_at is null
  and not exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = u.id
      and tm.deleted_at is null
      and tm.enabled = true
  )
order by u.created_at desc;

-- 2) active memberships pointing to missing/deleted users
select tm.id, tm.tenant_id, tm.user_id, tm.role, tm.enabled
from public.tenant_members tm
left join public.users u on u.id = tm.user_id
where tm.deleted_at is null
  and tm.enabled = true
  and (u.id is null or u.deleted_at is not null)
order by tm.created_at desc;

-- 3) users.tenant_id differs from any active membership tenant
select u.id, u.email, u.tenant_id as users_tenant_id,
  array_remove(array_agg(distinct tm.tenant_id), null) as membership_tenants
from public.users u
left join public.tenant_members tm
  on tm.user_id = u.id
 and tm.deleted_at is null
 and tm.enabled = true
where u.deleted_at is null
group by u.id, u.email, u.tenant_id
having u.tenant_id is not null
   and bool_or(tm.tenant_id = u.tenant_id) is not true;

-- 4) users.role differs from strongest active membership role
with ranked as (
  select tm.user_id,
         max(case tm.role when 'Superadmin' then 3 when 'Admin' then 2 else 1 end) as max_rank
  from public.tenant_members tm
  where tm.deleted_at is null
    and tm.enabled = true
  group by tm.user_id
)
select u.id, u.email, u.role as users_role,
       case r.max_rank when 3 then 'Superadmin' when 2 then 'Admin' when 1 then 'Agente' else null end as strongest_membership_role
from public.users u
left join ranked r on r.user_id = u.id
where u.deleted_at is null
  and r.max_rank is not null
  and u.role is distinct from case r.max_rank when 3 then 'Superadmin' when 2 then 'Admin' when 1 then 'Agente' else null end
order by u.created_at desc;
