alter table if exists private.ddld_cron_config drop column if exists token;

create or replace function public.ddld_fire_cron_v1()
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_endpoint text;
  v_token text;
  v_request_id bigint;
begin
  select endpoint into v_endpoint
  from private.ddld_cron_config
  where id = 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'ddld_cron_token'
  limit 1;

  if v_endpoint is null or v_token is null then
    return null;
  end if;

  select net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.ddld_install_cron_v1(p_endpoint text)
returns bigint
language plpgsql
security definer
set search_path = public, private, cron, pg_temp
as $$
declare
  v_job_id bigint;
begin
  if p_endpoint <> 'https://dd-ld-varde.vercel.app/api/ddld/cron' then
    raise exception 'Unexpected DD/LD cron endpoint';
  end if;

  insert into private.ddld_cron_config(id, endpoint, updated_at)
  values (1, p_endpoint, now())
  on conflict (id) do update
    set endpoint = excluded.endpoint,
        updated_at = excluded.updated_at;

  perform cron.unschedule(j.jobid)
  from cron.job j
  where j.jobname = 'ddld-market-collector';

  select cron.schedule(
    'ddld-market-collector',
    '* * * * *',
    'select public.ddld_fire_cron_v1();'
  ) into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.ddld_install_cron_v1(text, text) from public;
revoke all on function public.ddld_install_cron_v1(text, text) from anon;
revoke all on function public.ddld_install_cron_v1(text, text) from authenticated;
revoke all on function public.ddld_install_cron_v1(text) from public;
revoke all on function public.ddld_install_cron_v1(text) from anon;
revoke all on function public.ddld_install_cron_v1(text) from authenticated;
grant execute on function public.ddld_install_cron_v1(text) to service_role;;
