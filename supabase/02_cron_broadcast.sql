-- HireFlow on Vercel: make Supabase call the API every minute so queued broadcast email gets sent.
-- (Vercel's free plan cannot run a job every minute and the API is not a long-running process.)
--
-- Run ONCE in the Supabase SQL editor, AFTER the API is deployed and CRON_SECRET is set in Vercel.
-- Replace both placeholders below:
--   YOUR_DOMAIN   e.g. ainstooling.vercel.app
--   YOUR_CRON_SECRET   the exact value of the CRON_SECRET environment variable in Vercel
--
-- Note: the secret is stored inside the job definition (table cron.job), readable by the database owner only.
-- To rotate it: change CRON_SECRET in Vercel, then re-run this script (it replaces the job).
sb
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'hireflow-broadcast-tick';

select cron.schedule(
  'hireflow-broadcast-tick',
  '* * * * *',
  $job$
    select net.http_post(
      url     := 'https://YOUR_DOMAIN/api/v1/cron/broadcast',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
      timeout_milliseconds := 55000
    );
  $job$
);

-- Check it is scheduled:      select jobid, jobname, schedule, active from cron.job;
-- See the last results:       select status_code, content, created from net._http_response order by created desc limit 5;
-- Stop it:                    select cron.unschedule('hireflow-broadcast-tick');
