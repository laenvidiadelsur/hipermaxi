-- Seed mock data (run AFTER /setup/init has created first tenant + superadmin)
-- Idempotent-ish: clears tenant-scoped data for the first tenant found.
--
-- Prioriza el perfil de carlosrichterhurtado@gmail.com como actor (created_by / notificaciones).
-- Incluye contacto 59169160323 para pruebas de envío masivo.
-- Rellena reminder_logs + detalle pagado para el Dashboard Cobranzas (/cobranzas).

DO $$
DECLARE
  t_id uuid;
  actor_id uuid;
  v_email text := 'carlosrichterhurtado@gmail.com';
  e_id uuid;
  juan_id uuid;
  maria_id uuid;
  bolivia_id uuid;
  d_juan uuid;
  d_maria uuid;
  d_bolivia uuid;
  dd_juan uuid;
  dd_maria uuid;
  dd_bolivia uuid;
  qr_j uuid;
  qr_m uuid;
  qr_b uuid;
  r_id uuid;
  rp_id uuid;
  i int;
BEGIN
  SELECT id INTO t_id FROM public.tenants WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1;
  IF t_id IS NULL THEN
    RAISE EXCEPTION 'No tenant found. Run /setup/init first.';
  END IF;

  SELECT id INTO actor_id
  FROM public.users
  WHERE deleted_at IS NULL AND lower(email) = lower(v_email)
  LIMIT 1;

  IF actor_id IS NULL THEN
    SELECT id INTO actor_id
    FROM public.users
    WHERE deleted_at IS NULL AND enabled = true AND role = 'Superadmin'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'No user profile for % nor Superadmin. Run bootstrap or /setup/init first.', v_email;
  END IF;

  UPDATE public.tenant_invites SET deleted_at = now() WHERE tenant_id = t_id AND deleted_at IS NULL;
  UPDATE public.tenant_members
  SET deleted_at = now(), enabled = false
  WHERE tenant_id = t_id AND user_id <> actor_id AND deleted_at IS NULL;

  DELETE FROM public.notifications WHERE tenant_id = t_id;
  DELETE FROM public.notification_preferences WHERE tenant_id = t_id;
  DELETE FROM public.notification_events WHERE tenant_id = t_id;

  DELETE FROM public.whatsapp_mass_send_recipients WHERE mass_send_run_id IN (SELECT id FROM public.whatsapp_mass_send_runs WHERE tenant_id = t_id);
  DELETE FROM public.whatsapp_mass_send_runs WHERE tenant_id = t_id;
  DELETE FROM public.whatsapp_mass_send_schedules WHERE mass_send_id IN (SELECT id FROM public.whatsapp_mass_sends WHERE tenant_id = t_id);
  DELETE FROM public.whatsapp_mass_sends WHERE tenant_id = t_id;

  DELETE FROM public.whatsapp_messages WHERE whatsapp_thread_id IN (SELECT id FROM public.whatsapp_threads WHERE tenant_id = t_id);
  DELETE FROM public.whatsapp_threads WHERE tenant_id = t_id;
  DELETE FROM public.whatsapp_templates WHERE whatsapp_configuration_id IN (SELECT id FROM public.whatsapp_configurations WHERE tenant_id = t_id);
  DELETE FROM public.whatsapp_configurations WHERE tenant_id = t_id;

  DELETE FROM public.reminder_logs WHERE reminder_program_id IN (
    SELECT rp.id
    FROM public.reminder_programs rp
    JOIN public.reminders r ON r.id = rp.reminder_id
    JOIN public.debts d ON d.id = r.debt_id
    WHERE d.tenant_id = t_id
  );
  DELETE FROM public.reminder_programs WHERE reminder_id IN (
    SELECT r.id
    FROM public.reminders r
    JOIN public.debts d ON d.id = r.debt_id
    WHERE d.tenant_id = t_id
  );
  DELETE FROM public.reminders WHERE debt_id IN (SELECT id FROM public.debts WHERE tenant_id = t_id);

  -- IMPORTANT: delete debts first and let CASCADE remove debt_details/debt_detail_qrs.
  -- This avoids firing recalc on partial deletes against legacy rows with null counters.
  DELETE FROM public.debts WHERE tenant_id = t_id;
  DELETE FROM public.contacts WHERE tenant_id = t_id;

  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE deleted_at IS NULL) THEN
    INSERT INTO public.subscription_plans (name, description, price, duration_in_days, renewable)
    VALUES ('Starter', 'Plan inicial (mock)', 0, 3650, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = t_id AND deleted_at IS NULL) THEN
    INSERT INTO public.subscriptions (subscription_plan_id, tenant_id, price, expiration_date, enable, created_by, updated_by)
    SELECT sp.id, t_id, sp.price, (current_date + 3650), true, actor_id, actor_id
    FROM public.subscription_plans sp
    WHERE sp.deleted_at IS NULL
    ORDER BY sp.price ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.contacts (tenant_id, name, phone_number, email, created_by, updated_by)
  VALUES (t_id, 'Juan Perez', '573001112233', 'juan.perez@example.com', actor_id, actor_id)
  RETURNING id INTO juan_id;

  INSERT INTO public.contacts (tenant_id, name, phone_number, email, created_by, updated_by)
  VALUES (t_id, 'Maria Gomez', '573004445566', 'maria.gomez@example.com', actor_id, actor_id)
  RETURNING id INTO maria_id;

  INSERT INTO public.contacts (tenant_id, name, phone_number, email, created_by, updated_by)
  VALUES (t_id, 'Cliente Bolivia (envío masivo)', '59169160323', 'cliente.bolivia@example.com', actor_id, actor_id)
  RETURNING id INTO bolivia_id;

  INSERT INTO public.debts (tenant_id, contact_id, created_by, updated_by)
  VALUES (t_id, juan_id, actor_id, actor_id)
  RETURNING id INTO d_juan;

  INSERT INTO public.debt_details (
    contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by
  ) VALUES (
    juan_id, d_juan, 500000, 'Factura mock Juan', 0, 500000, (current_date - 40), 'Active', actor_id, actor_id
  )
  RETURNING id INTO dd_juan;

  INSERT INTO public.debts (tenant_id, contact_id, created_by, updated_by)
  VALUES (t_id, maria_id, actor_id, actor_id)
  RETURNING id INTO d_maria;

  INSERT INTO public.debt_details (
    contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by
  ) VALUES (
    maria_id, d_maria, 320000, 'Factura mock Maria', 0, 320000, (current_date - 15), 'Active', actor_id, actor_id
  )
  RETURNING id INTO dd_maria;

  INSERT INTO public.debts (tenant_id, contact_id, created_by, updated_by)
  VALUES (t_id, bolivia_id, actor_id, actor_id)
  RETURNING id INTO d_bolivia;

  INSERT INTO public.debt_details (
    contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by
  ) VALUES (
    bolivia_id, d_bolivia, 850000, 'Deuda mock envío masivo +591', 0, 850000, (current_date - 35), 'Active', actor_id, actor_id
  )
  RETURNING id INTO dd_bolivia;

  -- Detalle pagado reciente (recaudación en dashboard / gráficos diarios)
  INSERT INTO public.debt_details (
    contact_id, debt_id, debt_amount, debt_description, penalty_amount, total, expiration_date, debt_status, created_by, updated_by
  ) VALUES (
    juan_id, d_juan, 180000, 'Abono mock Juan', 0, 180000, (current_date - 5), 'Paid', actor_id, actor_id
  );

  UPDATE public.debt_details
  SET debt_status = 'Paid', updated_at = now() - interval '2 days'
  WHERE id = dd_maria;

  PERFORM public.recalc_debts_aggregate(t_id, juan_id);
  PERFORM public.recalc_debts_aggregate(t_id, maria_id);
  PERFORM public.recalc_debts_aggregate(t_id, bolivia_id);

  -- QRs por detalle (el KPI de recordatorios hace join con debt_detail_qrs)
  INSERT INTO public.qrs (external_id, expiration_date, amount, created_by, updated_by)
  VALUES ('seed-juan', current_date + 60, 500000, actor_id, actor_id)
  RETURNING id INTO qr_j;
  INSERT INTO public.debt_detail_qrs (debt_detail_id, qr_id, created_by, updated_by)
  VALUES (dd_juan, qr_j, actor_id, actor_id);

  INSERT INTO public.qrs (external_id, expiration_date, amount, created_by, updated_by)
  VALUES ('seed-maria', current_date + 60, 320000, actor_id, actor_id)
  RETURNING id INTO qr_m;
  INSERT INTO public.debt_detail_qrs (debt_detail_id, qr_id, created_by, updated_by)
  VALUES (dd_maria, qr_m, actor_id, actor_id);

  INSERT INTO public.qrs (external_id, expiration_date, amount, created_by, updated_by)
  VALUES ('seed-bolivia', current_date + 60, 850000, actor_id, actor_id)
  RETURNING id INTO qr_b;
  INSERT INTO public.debt_detail_qrs (debt_detail_id, qr_id, created_by, updated_by)
  VALUES (dd_bolivia, qr_b, actor_id, actor_id);

  INSERT INTO public.reminders (debt_id, action_type, created_by, updated_by)
  VALUES (d_juan, 'automatically', actor_id, actor_id)
  RETURNING id INTO r_id;

  INSERT INTO public.reminder_programs (reminder_id, days_ref_debt, whatsapp_template_id, created_by, updated_by)
  VALUES (r_id, -3, NULL, actor_id, actor_id)
  RETURNING id INTO rp_id;

  FOR i IN 1..20 LOOP
    INSERT INTO public.reminder_logs (
      reminder_program_id, debt_detail_id, sent_at, sent_status, success, created_by, updated_by
    ) VALUES (
      rp_id,
      dd_juan,
      (now() - (i * interval '32 hours')),
      'Sent',
      (i % 5 <> 0),
      actor_id,
      actor_id
    );
  END LOOP;

  INSERT INTO public.whatsapp_configurations (tenant_id, meta_id, waba_id, token, phone_number_id, verify_token, channel_name, created_by, updated_by)
  VALUES (t_id, 'mock_meta', 'mock_waba', 'mock_token', 'mock_phone', 'mock_verify', 'Mock Channel', actor_id, actor_id)
  ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now();

  INSERT INTO public.whatsapp_threads (tenant_id, contact_id, last_message, last_interaction, created_by, updated_by)
  VALUES (t_id, bolivia_id, 'Hola! Contacto listo para prueba de envío masivo.', now(), actor_id, actor_id);

  BEGIN
    INSERT INTO public.notification_events (tenant_id, event_type, payload, created_by, updated_by)
    VALUES (t_id, 'mock.event', jsonb_build_object('seed', 'mock', 'for_email', v_email), actor_id, actor_id)
    RETURNING id INTO e_id;

    INSERT INTO public.notifications (tenant_id, user_id, event_id, title, body, severity, action_url, created_by, updated_by)
    VALUES (t_id, actor_id, e_id, 'Data mock', 'Dashboard y cobranzas con datos de prueba.', 'info', '/cobranzas', actor_id, actor_id);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'seed-mock: notificaciones omitidas: %', SQLERRM;
  END;
END $$;
