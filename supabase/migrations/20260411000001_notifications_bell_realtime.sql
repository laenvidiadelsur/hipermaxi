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
