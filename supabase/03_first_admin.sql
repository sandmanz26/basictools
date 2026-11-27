-- Create the default roles and the first admin WITHOUT running anything on your computer.
-- Run in the Supabase SQL editor AFTER the API is deployed on Vercel with these environment variables set:
--   CRON_SECRET, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (8+ characters, a letter and a number).
-- Replace YOUR_DOMAIN and YOUR_CRON_SECRET (same value as in Vercel), run, wait ~5 seconds, then run the check below.
-- Safe to run again: it never overwrites roles or an existing admin.
-- Afterwards: delete BOOTSTRAP_ADMIN_PASSWORD from Vercel and change the password after the first login.

select net.http_post(
  url     := 'https://YOUR_DOMAIN/api/v1/setup/seed',
  headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
  timeout_milliseconds := 30000
);

-- Check (expect status_code 200 and {"roles":6,"adminCreated":true}):
-- select status_code, content from net._http_response order by created desc limit 3;
