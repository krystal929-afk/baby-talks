-- Calls the reminder webhook every minute via pg_cron + pg_net.
-- Before running, store the values in Vault (Dashboard > Project Settings > Vault):
--   select vault.create_secret('https://<your-app-domain>', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
SELECT cron.unschedule('send-due-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-due-reminders');

SELECT cron.schedule(
  'send-due-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url') || '/api/public/hooks/send-due-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
