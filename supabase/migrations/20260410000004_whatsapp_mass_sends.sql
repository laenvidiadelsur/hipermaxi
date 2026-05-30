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
