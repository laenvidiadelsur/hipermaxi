do $$
declare
  r record;
begin
  for r in (
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in ('tenants', 'whatsapp_configurations', 'whatsapp_templates')
      and tablename <> 'spatial_ref_sys'
  ) loop
    execute format('truncate table public.%I cascade;', r.tablename);
  end loop;
end $$;

select 'tenants' as table_name, count(*)::int as rows from public.tenants
union all
select 'whatsapp_configurations', count(*)::int from public.whatsapp_configurations
union all
select 'whatsapp_templates', count(*)::int from public.whatsapp_templates
union all
select 'whatsapp_threads', count(*)::int from public.whatsapp_threads
union all
select 'contacts', count(*)::int from public.contacts
union all
select 'users', count(*)::int from public.users;
