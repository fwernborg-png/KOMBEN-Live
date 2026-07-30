-- RESEARCH HISTORY AND ANALYSIS V1
--
-- Säker, läsbar analysyta för appens anon-klient.
-- De underliggande forskningstabellerna förblir låsta av RLS.
-- Appen får endast åtkomst genom dessa begränsade RPC-funktioner.

drop function if exists public.research_history_options_v1();

create or replace function public.research_history_options_v1()
returns table (
  min_date date,
  max_date date,
  race_count bigint,
  tracks text[],
  distances integer[],
  start_methods text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    min(race.race_date) as min_date,
    max(race.race_date) as max_date,
    count(*) as race_count,

    coalesce(
      array_agg(
        distinct race.track_name
        order by race.track_name
      ) filter (
        where race.track_name is not null
      ),
      '{}'::text[]
    ) as tracks,

    coalesce(
      array_agg(
        distinct race.distance_meters
        order by race.distance_meters
      ) filter (
        where race.distance_meters is not null
      ),
      '{}'::integer[]
    ) as distances,

    coalesce(
      array_agg(
        distinct race.start_method
        order by race.start_method
      ) filter (
        where race.start_method is not null
      ),
      '{}'::text[]
    ) as start_methods

  from public.research_races race

  where race.archive_status = 'COMPLETE'
    and race.is_monte = false;
$function$;

revoke all
  on function public.research_history_options_v1()
  from public;

grant execute
  on function public.research_history_options_v1()
  to anon, authenticated;


drop function if exists public.research_history_rows_v1(
  date,
  date,
  text,
  text,
  integer,
  text,
  integer,
  numeric,
  boolean,
  integer
);

create or replace function public.research_history_rows_v1(
  p_date_from date default null,
  p_date_to date default null,

  p_selection text default 'MOST_SHORTENED',

  p_start_method text default null,
  p_distance_meters integer default null,
  p_track_name text default null,

  p_min_strength integer default null,
  p_min_drop_percent numeric default null,

  p_complete_only boolean default true,

  p_limit integer default 2000
)
returns table (
  race_key text,
  race_date date,

  track_name text,
  race_number integer,
  planned_start_time timestamptz,

  start_method text,
  distance_meters integer,
  race_category text,
  race_class_code text,
  starters integer,

  selection_kind text,

  runner_number integer,
  horse_name text,
  start_lane integer,

  strength_total integer,

  start_odds numeric,
  lock_odds numeric,
  final_odds numeric,

  odds_drop_to_lock_percent numeric,
  odds_drop_to_final_percent numeric,

  cv_percent numeric,
  valid_odds_points integer,

  is_favorite_at_lock boolean,

  kr_value numeric,
  st_value numeric,
  driver_value numeric,
  sp_value numeric,
  gallop_value numeric,
  odds_indicator_value numeric,

  started boolean,
  scratched_after_lock boolean,
  bet_void boolean,

  finish_position_official integer,

  winner_official boolean,
  placed_official boolean,

  galloped boolean,
  disqualified boolean,
  did_not_finish boolean,

  official_win_odds_decimal numeric,
  official_place_odds_decimal numeric,

  result_status text,

  metric_quality_status text,
  indicator_data_complete boolean,
  odds_data_complete boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_selection text :=
    upper(
      coalesce(
        nullif(trim(p_selection), ''),
        'MOST_SHORTENED'
      )
    );

  v_date_from date :=
    coalesce(
      p_date_from,
      current_date - 365
    );

  v_date_to date :=
    coalesce(
      p_date_to,
      current_date
    );

  v_limit integer :=
    greatest(
      1,
      least(
        coalesce(p_limit, 2000),
        5000
      )
    );
begin
  if v_selection not in (
    'MOST_SHORTENED',
    'SMOOTHEST',
    'FAVORITE'
  ) then
    raise exception
      'Ogiltig strategi: %',
      v_selection
      using errcode = '22023';
  end if;

  return query

  with
  latest_metrics as (
    select distinct on (
      metric.race_key,
      metric.runner_number
    )
      metric.*

    from public.research_runner_metrics metric

    where metric.signal_phase = 'LIVE'

    order by
      metric.race_key,
      metric.runner_number,
      metric.calculated_at desc,
      metric.updated_at desc
  ),

  lock_runners as (
    select
      runner.runner_snapshot_key,
      runner.race_key,
      runner.runner_number,
      runner.horse_name,
      runner.start_lane,
      runner.strength_total,

      runner.indicator_data_complete,
      runner.odds_data_complete

    from public.research_race_snapshots snapshot

    join public.research_runner_snapshots runner
      on runner.snapshot_key =
         snapshot.snapshot_key

    where snapshot.signal_phase = 'LIVE'
      and snapshot.capture_type = 'LOCK'
  ),

  indicator_values as (
    select
      runner.runner_snapshot_key,
      runner.race_key,
      runner.runner_number,

      max(indicator.raw_value) filter (
        where indicator.indicator_code = 'KR'
      ) as kr_value,

      max(indicator.raw_value) filter (
        where indicator.indicator_code = 'ST'
      ) as st_value,

      max(indicator.raw_value) filter (
        where indicator.indicator_code = 'K'
      ) as driver_value,

      max(indicator.raw_value) filter (
        where indicator.indicator_code = 'SP'
      ) as sp_value,

      max(indicator.raw_value) filter (
        where indicator.indicator_code = 'G'
      ) as gallop_value,

      max(indicator.raw_value) filter (
        where indicator.indicator_code = 'ODD'
      ) as odds_indicator_value

    from lock_runners runner

    left join public.research_runner_indicators indicator
      on indicator.runner_snapshot_key =
         runner.runner_snapshot_key

    group by
      runner.runner_snapshot_key,
      runner.race_key,
      runner.runner_number
  ),

  latest_results as (
    select distinct on (
      result.race_key,
      result.runner_number
    )
      result.*

    from public.research_runner_results result

    order by
      result.race_key,
      result.runner_number,
      result.result_revision desc,
      result.result_received_at desc
  ),

  candidate_rows as (
    select
      race.race_key,
      race.race_date,

      race.track_name,
      race.race_number,
      race.planned_start_time,

      race.start_method,
      race.distance_meters,
      race.race_category,
      race.race_class_code,

      coalesce(
        race.actual_starters,
        race.scheduled_starters,
        race.expected_runner_count
      ) as starters,

      v_selection as selection_kind,

      metric.runner_number,
      metric.horse_name,
      lock_runner.start_lane,

      lock_runner.strength_total,

      metric.start_odds,
      metric.lock_odds,
      metric.final_odds,

      metric.odds_drop_to_lock_percent,
      metric.odds_drop_to_final_percent,

      metric.cv_percent,
      metric.valid_odds_points,

      metric.is_favorite_at_lock,

      indicator.kr_value,
      indicator.st_value,
      indicator.driver_value,
      indicator.sp_value,
      indicator.gallop_value,
      indicator.odds_indicator_value,

      result.started,
      result.scratched_after_lock,

      (
        result.result_status = 'VOID'
        or result.scratched_after_lock = true
        or result.started = false
      ) as bet_void,

      result.finish_position_official,

      result.winner_official,
      result.placed_official,

      result.galloped,
      result.disqualified,
      result.did_not_finish,

      result.official_win_odds_decimal,
      result.official_place_odds_decimal,

      result.result_status,

      metric.data_quality_status
        as metric_quality_status,

      lock_runner.indicator_data_complete,
      lock_runner.odds_data_complete,

      row_number() over (
        partition by race.race_key

        order by
          case
            when v_selection = 'MOST_SHORTENED'
              then metric.odds_drop_rank

            when v_selection = 'SMOOTHEST'
              then metric.smoothness_rank

            when v_selection = 'FAVORITE'
              then metric.lock_market_rank
          end asc nulls last,

          case
            when v_selection = 'MOST_SHORTENED'
              then metric.odds_drop_to_lock_percent
          end desc nulls last,

          case
            when v_selection = 'SMOOTHEST'
              then metric.cv_percent
          end asc nulls last,

          case
            when v_selection = 'FAVORITE'
              then metric.lock_odds
          end asc nulls last,

          metric.runner_number asc
      ) as candidate_order

    from public.research_races race

    join latest_metrics metric
      on metric.race_key =
         race.race_key

    join lock_runners lock_runner
      on lock_runner.race_key =
         metric.race_key
     and lock_runner.runner_number =
         metric.runner_number

    join latest_results result
      on result.race_key =
         metric.race_key
     and result.runner_number =
         metric.runner_number

    left join indicator_values indicator
      on indicator.runner_snapshot_key =
         lock_runner.runner_snapshot_key

    where race.archive_status = 'COMPLETE'
      and race.is_monte = false

      and race.race_date between
        least(v_date_from, v_date_to)
        and greatest(v_date_from, v_date_to)

      and (
        p_start_method is null
        or trim(p_start_method) = ''
        or race.start_method =
           upper(trim(p_start_method))
      )

      and (
        p_distance_meters is null
        or race.distance_meters =
           p_distance_meters
      )

      and (
        p_track_name is null
        or trim(p_track_name) = ''
        or race.track_name =
           trim(p_track_name)
      )

      and (
        p_min_strength is null
        or coalesce(
          lock_runner.strength_total,
          0
        ) >= p_min_strength
      )

      and (
        p_min_drop_percent is null
        or metric.odds_drop_to_lock_percent >=
           p_min_drop_percent
      )

      and (
        p_complete_only = false

        or (
          metric.data_quality_status = 'COMPLETE'
          and lock_runner.indicator_data_complete = true
          and lock_runner.odds_data_complete = true
        )
      )

      and (
        (
          v_selection = 'MOST_SHORTENED'
          and metric.odds_drop_rank = 1
        )

        or (
          v_selection = 'SMOOTHEST'
          and metric.smoothness_rank = 1
        )

        or (
          v_selection = 'FAVORITE'
          and metric.lock_market_rank = 1
        )
      )
  )

  select
    candidate.race_key,
    candidate.race_date,

    candidate.track_name,
    candidate.race_number,
    candidate.planned_start_time,

    candidate.start_method,
    candidate.distance_meters,
    candidate.race_category,
    candidate.race_class_code,
    candidate.starters,

    candidate.selection_kind,

    candidate.runner_number,
    candidate.horse_name,
    candidate.start_lane,

    candidate.strength_total,

    candidate.start_odds,
    candidate.lock_odds,
    candidate.final_odds,

    candidate.odds_drop_to_lock_percent,
    candidate.odds_drop_to_final_percent,

    candidate.cv_percent,
    candidate.valid_odds_points,

    candidate.is_favorite_at_lock,

    candidate.kr_value,
    candidate.st_value,
    candidate.driver_value,
    candidate.sp_value,
    candidate.gallop_value,
    candidate.odds_indicator_value,

    candidate.started,
    candidate.scratched_after_lock,
    candidate.bet_void,

    candidate.finish_position_official,

    candidate.winner_official,
    candidate.placed_official,

    candidate.galloped,
    candidate.disqualified,
    candidate.did_not_finish,

    candidate.official_win_odds_decimal,
    candidate.official_place_odds_decimal,

    candidate.result_status,

    candidate.metric_quality_status,
    candidate.indicator_data_complete,
    candidate.odds_data_complete

  from candidate_rows candidate

  where candidate.candidate_order = 1

  order by
    candidate.race_date desc,
    candidate.planned_start_time desc nulls last,
    candidate.track_name,
    candidate.race_number

  limit v_limit;
end;
$function$;

revoke all
  on function public.research_history_rows_v1(
    date,
    date,
    text,
    text,
    integer,
    text,
    integer,
    numeric,
    boolean,
    integer
  )
  from public;

grant execute
  on function public.research_history_rows_v1(
    date,
    date,
    text,
    text,
    integer,
    text,
    integer,
    numeric,
    boolean,
    integer
  )
  to anon, authenticated;

comment on function public.research_history_options_v1()
is
  'Tillåtna filtervärden och datumintervall för Historik och analys V1.';

comment on function public.research_history_rows_v1(
  date,
  date,
  text,
  text,
  integer,
  text,
  integer,
  numeric,
  boolean,
  integer
)
is
  'En utvald häst per lopp för mest sänkta, jämnaste eller favorit, inklusive LOCK-data och officiellt resultat.';
