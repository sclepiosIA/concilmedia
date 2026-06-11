CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Supprime un schedule existant éventuel pour rester idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('sync-ansm-shortages-daily');
EXCEPTION WHEN OTHERS THEN
  -- ignore si le job n'existe pas
  NULL;
END $$;

SELECT cron.schedule(
  'sync-ansm-shortages-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://concilmedia.lovable.app/api/public/hooks/sync-ansm-shortages',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);