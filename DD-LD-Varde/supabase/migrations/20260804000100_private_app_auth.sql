-- KOMBEN LIVE PRIVATE APP AUTH
--
-- Tillåtna konton lagras separat.
-- Tabellen kan endast läsas av service_role.
-- PostgREST-kontrollen stoppar alla Data API-anrop
-- från anon eller icke godkända användare.

create table if not exists
  public.app_allowed_users (
    email text primary key,
    active boolean not null
      default true,
    created_at timestamptz
      not null
      default now(),
    updated_at timestamptz
      not null
      default now(),

    constraint
      app_allowed_users_email_lowercase
      check (
        email = lower(email)
      )
  );

alter table
  public.app_allowed_users
  enable row level security;

revoke all
  on table
    public.app_allowed_users
  from
    public,
    anon,
    authenticated;

grant select
  on table
    public.app_allowed_users
  to
    service_role;


create or replace function
  public.check_komben_app_request()
returns void
language plpgsql
security definer
set search_path =
  public,
  pg_temp
as $function$
declare
  claims jsonb :=
    coalesce(
      nullif(
        current_setting(
          'request.jwt.claims',
          true
        ),
        ''
      ),
      '{}'
    )::jsonb;

  request_role text :=
    coalesce(
      claims ->> 'role',
      'anon'
    );

  request_email text :=
    lower(
      coalesce(
        claims ->> 'email',
        ''
      )
    );
begin
  -- Cloudflare Worker använder service_role
  -- och ska fortsätta arbeta i bakgrunden.
  if request_role = 'service_role' then
    return;
  end if;

  if
    request_role <> 'authenticated'
    or request_email = ''
    or not exists (
      select 1
      from
        public.app_allowed_users
      where
        app_allowed_users.email =
          request_email
        and
        app_allowed_users.active =
          true
    )
  then
    raise sqlstate 'PGRST'
      using
        message =
          json_build_object(
            'code',
              'KOMBEN_AUTH_REQUIRED',
            'message',
              'Inloggning krävs',
            'details',
              null,
            'hint',
              null
          )::text,

        detail =
          json_build_object(
            'status',
              401,
            'status_text',
              'Unauthorized',
            'headers',
              json_build_object(
                'WWW-Authenticate',
                'Bearer'
              )
          )::text;
  end if;
end;
$function$;

revoke all
  on function
    public.check_komben_app_request()
  from public;

grant execute
  on function
    public.check_komben_app_request()
  to
    anon,
    authenticated,
    service_role;


-- ACTIVATE_POSTGREST_PRE_REQUEST

alter role authenticator
  set pgrst.db_pre_request =
    'public.check_komben_app_request';

notify pgrst,
  'reload config';

notify pgrst,
  'reload schema';
