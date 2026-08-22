create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.ddld_cron_config (
  id integer primary key default 1 check (id = 1),
  endpoint text not null,
  token text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.ddld_cron_config from public;
revoke all on private.ddld_cron_config from anon;
revoke all on private.ddld_cron_config from authenticated;

create or replace function public.ddld_fire_cron_v1()
returns bigint
language plpgsql
security definer
set search_path = public, private, net, pg_temp
as $$
declare
  v_endpoint text;
  v_token text;
  v_request_id bigint;
begin
  select endpoint, token
    into v_endpoint, v_token
  from private.ddld_cron_config
  where id = 1;

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

create or replace function public.ddld_install_cron_v1(
  p_endpoint text,
  p_token text
)
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

  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid DD/LD cron token';
  end if;

  insert into private.ddld_cron_config(id, endpoint, token, updated_at)
  values (1, p_endpoint, p_token, now())
  on conflict (id) do update
    set endpoint = excluded.endpoint,
        token = excluded.token,
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

revoke all on function public.ddld_fire_cron_v1() from public;
revoke all on function public.ddld_fire_cron_v1() from anon;
revoke all on function public.ddld_fire_cron_v1() from authenticated;
revoke all on function public.ddld_install_cron_v1(text, text) from public;
revoke all on function public.ddld_install_cron_v1(text, text) from anon;
revoke all on function public.ddld_install_cron_v1(text, text) from authenticated;

grant execute on function public.ddld_fire_cron_v1() to service_role;
grant execute on function public.ddld_install_cron_v1(text, text) to service_role;;
