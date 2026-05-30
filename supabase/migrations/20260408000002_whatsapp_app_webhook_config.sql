-- WhatsApp App/Webhook oriented configuration fields
ALTER TABLE public.whatsapp_configurations
ADD COLUMN IF NOT EXISTS channel_name text;

ALTER TABLE public.whatsapp_configurations
ADD COLUMN IF NOT EXISTS verify_token text;

ALTER TABLE public.whatsapp_configurations
ADD COLUMN IF NOT EXISTS default_template_language text DEFAULT 'es_LA' NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_configurations_verify_token
ON public.whatsapp_configurations(verify_token)
WHERE verify_token IS NOT NULL;