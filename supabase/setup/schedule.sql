-- Apply AFTER migrations and function deployment, using Supabase SQL Editor as postgres.
-- Enable Cron (pg_cron), pg_net and Vault in the dashboard first.
-- In Vault create:
--   replyfolio_project_url   = https://YOUR_PROJECT.supabase.co
--   replyfolio_worker_secret = the exact WORKER_SECRET from Edge Function secrets
-- No service-role key is stored in the scheduler.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function private.dispatch_worker() returns bigint
language plpgsql security definer set search_path = '' as $$
declare project_url text; worker_secret text; request_id bigint;
begin
  perform private.cleanup_access();
  -- Do not invoke Edge Functions while there is no work.
  if not exists(
    select 1 from private.jobs where due_at<=now() and
      (status='pending' or (status='processing' and lease_until<now()))
  ) and not (
    exists(select 1 from public.instagram_accounts where status='connected')
    and not exists(select 1 from private.jobs where event_key='refresh:'||to_char(now() at time zone 'UTC','YYYY-MM-DD'))
  ) then return null; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='replyfolio_project_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='replyfolio_worker_secret';
  if project_url is null or worker_secret is null then
    raise exception 'Configure ReplyFolio Vault secrets before enabling the scheduler';
  end if;
  select net.http_post(
    url:=rtrim(project_url,'/')||'/functions/v1/automation-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',worker_secret),
    body:='{}'::jsonb,
    timeout_milliseconds:=100000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.dispatch_worker() from public, anon, authenticated, service_role;
-- Cron runs as the database owner, not as a browser user.
do $$ declare job record; begin
  for job in select jobid from cron.job where jobname='replyfolio-worker' loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;
select cron.schedule('replyfolio-worker','* * * * *','select private.dispatch_worker();');
commit;
-- Inspect scheduler status:
-- select jobid, jobname, active from cron.job where jobname='replyfolio-worker';
-- Pause:
-- select cron.unschedule(jobid) from cron.job where jobname='replyfolio-worker';

