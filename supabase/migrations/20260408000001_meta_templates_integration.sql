-- Step 1: Add phone_number_id to whatsapp_configurations
ALTER TABLE public.whatsapp_configurations 
ADD COLUMN phone_number_id text;

-- Step 2: Augment whatsapp_templates with Meta fields
ALTER TABLE public.whatsapp_templates 
ADD COLUMN meta_status text DEFAULT 'PENDING' NOT NULL,
ADD COLUMN meta_template_id text,
ADD COLUMN language text DEFAULT 'es_LA' NOT NULL,
ADD COLUMN category text DEFAULT 'UTILITY' NOT NULL,
ADD COLUMN components jsonb DEFAULT '[]'::jsonb NOT NULL;
