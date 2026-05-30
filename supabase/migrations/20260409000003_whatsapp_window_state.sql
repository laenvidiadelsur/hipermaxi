-- Conversation window state derived fields (24h inbound window)
ALTER TABLE public.whatsapp_threads
ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
ADD COLUMN IF NOT EXISTS window_open boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS window_expires_at timestamptz;

WITH inbound_last AS (
  SELECT
    wm.whatsapp_thread_id AS thread_id,
    MAX(COALESCE(wm.sent_at, wm.created_at)) AS last_inbound_at
  FROM public.whatsapp_messages wm
  WHERE wm.incoming = true
    AND wm.deleted_at IS NULL
  GROUP BY wm.whatsapp_thread_id
)
UPDATE public.whatsapp_threads wt
SET
  last_inbound_at = il.last_inbound_at,
  window_expires_at = il.last_inbound_at + interval '24 hours',
  window_open = (il.last_inbound_at + interval '24 hours') > now()
FROM inbound_last il
WHERE wt.id = il.thread_id;

UPDATE public.whatsapp_threads
SET
  window_open = false,
  window_expires_at = null
WHERE last_inbound_at IS NULL;
