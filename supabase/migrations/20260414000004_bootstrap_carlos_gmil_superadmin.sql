-- Ensure Carlos (gmil) is fully operational as Superadmin.
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'carlosrichterhurtado@gmail.com';
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth user % not found. Create it in Supabase Auth first.', v_email;
  END IF;

  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name)
    VALUES ('Ribentek')
    RETURNING id INTO v_tenant_id;
  END IF;

  INSERT INTO public.users (id, name, email, role, enabled, tenant_id)
  VALUES (v_user_id, 'Carlos Richter', lower(v_email), 'Superadmin', true, v_tenant_id)
  ON CONFLICT (id) DO UPDATE
  SET name = excluded.name,
      email = excluded.email,
      role = 'Superadmin',
      enabled = true,
      tenant_id = v_tenant_id,
      deleted_at = null;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, enabled)
  VALUES (v_tenant_id, v_user_id, 'Superadmin', true)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET role = 'Superadmin',
      enabled = true,
      deleted_at = null;
END $$;