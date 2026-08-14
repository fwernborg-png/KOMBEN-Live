-- LIVE LOCK STRENGTH V1
--
-- Läser den frysta LOCK-snapshoten direkt.
-- Kräver INTE resultat eller archive_status = COMPLETE.
-- Används av livevyn efter T-90.
--
-- Stark stjärna beslutas i klienten från de frysta
-- indikatorerna:
-- exakt 3/6 + KR + ODD + inte SP.

drop function if exists
  public.research_live_lock_strength_v1(
    date,
    text,
    integer
  );


create function
  public.research_live_lock_strength_v1(
    p_race_date date,
    p_track_name text,
    p_race_number integer
  )
returns table (
  runner_number integer,
  strength_total integer,
  actual_snapshot_time timestamptz,

  kr_top4 boolean,
  st_top4 boolean,
  driver_top4 boolean,
  sp_top4 boolean,
  gallop_top4 boolean,
  odds_indicator_top4 boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$

  with target_race as (
    select
      race.race_key

    from public.research_races race

    where race.race_date = p_race_date

      and lower(race.track_name) =
          lower(trim(p_track_name))

      and race.race_number =
          p_race_number

      and coalesce(
        race.is_monte,
        false
      ) = false

      and coalesce(
        race.sport_type,
        'TROT'
      ) <> 'GALLOP'

    order by race.race_key

    limit 1
  ),

  latest_lock as (
    select distinct on (
      runner.runner_number
    )
      runner.runner_snapshot_key,
      runner.runner_number,
      runner.strength_total,

      snapshot.actual_snapshot_time,

      snapshot.updated_at
        as snapshot_updated_at,

      runner.updated_at
        as runner_updated_at

    from public.research_race_snapshots snapshot

    join public.research_runner_snapshots runner
      on runner.snapshot_key =
         snapshot.snapshot_key

    join target_race race
      on race.race_key =
         runner.race_key

    where snapshot.signal_phase = 'LIVE'
      and snapshot.capture_type = 'LOCK'

    order by
      runner.runner_number,
      snapshot.actual_snapshot_time desc,
      snapshot.updated_at desc,
      runner.updated_at desc
  ),

  indicator_flags as (
    select
      lock.runner_snapshot_key,

      bool_or(
        indicator.indicator_code = 'KR'
        and indicator.is_top_four = true
      ) as kr_top4,

      bool_or(
        indicator.indicator_code = 'ST'
        and indicator.is_top_four = true
      ) as st_top4,

      bool_or(
        indicator.indicator_code = 'K'
        and indicator.is_top_four = true
      ) as driver_top4,

      bool_or(
        indicator.indicator_code = 'SP'
        and indicator.is_top_four = true
      ) as sp_top4,

      bool_or(
        indicator.indicator_code = 'G'
        and indicator.is_top_four = true
      ) as gallop_top4,

      bool_or(
        indicator.indicator_code = 'ODD'
        and indicator.is_top_four = true
      ) as odds_indicator_top4

    from latest_lock lock

    left join public.research_runner_indicators indicator
      on indicator.runner_snapshot_key =
         lock.runner_snapshot_key

    group by
      lock.runner_snapshot_key
  )

  select
    lock.runner_number,
    lock.strength_total,
    lock.actual_snapshot_time,

    coalesce(flags.kr_top4, false),
    coalesce(flags.st_top4, false),
    coalesce(flags.driver_top4, false),
    coalesce(flags.sp_top4, false),
    coalesce(flags.gallop_top4, false),
    coalesce(
      flags.odds_indicator_top4,
      false
    )

  from latest_lock lock

  left join indicator_flags flags
    on flags.runner_snapshot_key =
       lock.runner_snapshot_key

  order by
    lock.runner_number;

$function$;


revoke all
  on function
    public.research_live_lock_strength_v1(
      date,
      text,
      integer
    )
  from public;


grant execute
  on function
    public.research_live_lock_strength_v1(
      date,
      text,
      integer
    )
  to anon, authenticated;


comment on function
  public.research_live_lock_strength_v1(
    date,
    text,
    integer
  )
is
  'Reads frozen LIVE LOCK strength and indicator flags without requiring race completion or results.';
