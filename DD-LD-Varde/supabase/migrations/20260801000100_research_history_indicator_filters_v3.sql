-- RESEARCH HISTORY INDICATOR FILTERS V3
--
-- Lägger till säkra, valfria Ja/Nej-filter för:
-- • KR – kronor per start
-- • ST – segerprocent
-- • K – kuskprocent
-- • SP – startpoäng
-- • G – galopp
-- • ODD – oddsmodell
--
-- TRUE betyder grön/topp 4 i loppet.
-- FALSE betyder att indikatorn fanns men inte var topp 4.
-- NULL betyder att indikatorn inte ska filtreras.
--
-- De skyddade forskningstabellerna förblir låsta av RLS.
-- Appen läser fortsatt enbart genom en begränsad RPC.


drop function if exists public.research_history_rows_v3(
  date,
  date,
  text,
  text,
  integer,
  text,
  text,
  integer,
  text,
  text,
  text,
  bigint,
  bigint,
  integer,
  integer,
  integer,
  integer,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  boolean,
  integer
);


create function public.research_history_rows_v3(
  p_date_from date default null,
  p_date_to date default null,

  p_selection text default 'MOST_SHORTENED',

  p_start_method text default null,
  p_distance_meters integer default null,

  p_track_name text default null,
  p_driver_name text default null,

  p_start_lane integer default null,
  p_lane_group text default null,

  p_race_category text default null,
  p_race_class_code text default null,

  p_earnings_min bigint default null,
  p_earnings_max bigint default null,

  p_min_starters integer default null,
  p_max_starters integer default null,

  p_min_strength integer default null,
  p_max_strength integer default null,

  p_kr_top4 boolean default null,
  p_st_top4 boolean default null,
  p_driver_top4 boolean default null,
  p_sp_top4 boolean default null,
  p_gallop_top4 boolean default null,
  p_odds_indicator_top4 boolean default null,

  p_min_drop_percent numeric default null,
  p_max_drop_percent numeric default null,

  p_min_start_odds numeric default null,
  p_max_start_odds numeric default null,

  p_min_lock_odds numeric default null,
  p_max_lock_odds numeric default null,

  p_complete_only boolean default false,

  p_limit integer default 5000
)
returns table (
  race_key text,
  race_date date,

  track_name text,
  race_number integer,
  race_name text,
  planned_start_time timestamptz,

  start_method text,
  distance_meters integer,

  race_category text,
  race_class_code text,

  earnings_min bigint,
  earnings_max bigint,

  starters integer,

  selection_kind text,

  runner_number integer,
  horse_name text,

  start_lane integer,
  start_distance_meters integer,
  distance_handicap_meters integer,

  driver_id bigint,
  driver_name text,

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

  v_lane_group text :=
    upper(
      coalesce(
        nullif(trim(p_lane_group), ''),
        'ALL'
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
        coalesce(p_limit, 5000),
        10000
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

  if v_lane_group not in (
    'ALL',
    'AUTO_INNER_1_5',
    'AUTO_FRONT_1_8',
    'AUTO_BACK_9_12',
    'AUTO_THIRD_13_15',
    'VOLT_BASE',
    'VOLT_HANDICAP'
  ) then
    raise exception
      'Ogiltig spårgrupp: %',
      v_lane_group
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

  latest_lock_runners as (
    select distinct on (
      runner.race_key,
      runner.runner_number
    )
      runner.runner_snapshot_key,
      runner.race_key,
      runner.runner_number,

      runner.horse_name,

      runner.start_lane,
      runner.start_distance_meters,
      runner.distance_handicap_meters,

      runner.driver_id,
      runner.driver_name,

      runner.strength_total,

      runner.indicator_data_complete,
      runner.odds_data_complete

    from public.research_race_snapshots snapshot

    join public.research_runner_snapshots runner
      on runner.snapshot_key =
         snapshot.snapshot_key

    where snapshot.signal_phase = 'LIVE'
      and snapshot.capture_type = 'LOCK'

    order by
      runner.race_key,
      runner.runner_number,
      snapshot.actual_snapshot_time desc,
      snapshot.updated_at desc,
      runner.updated_at desc
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
      ) as odds_indicator_value,

      bool_or(indicator.is_top_four) filter (
        where indicator.indicator_code = 'KR'
      ) as kr_top4,

      bool_or(indicator.is_top_four) filter (
        where indicator.indicator_code = 'ST'
      ) as st_top4,

      bool_or(indicator.is_top_four) filter (
        where indicator.indicator_code = 'K'
      ) as driver_top4,

      bool_or(indicator.is_top_four) filter (
        where indicator.indicator_code = 'SP'
      ) as sp_top4,

      bool_or(indicator.is_top_four) filter (
        where indicator.indicator_code = 'G'
      ) as gallop_top4,

      bool_or(indicator.is_top_four) filter (
        where indicator.indicator_code = 'ODD'
      ) as odds_indicator_top4

    from latest_lock_runners runner

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
      race.race_name,
      race.planned_start_time,

      race.start_method,
      race.distance_meters,

      race.race_category,
      race.race_class_code,

      race.earnings_min,
      race.earnings_max,

      coalesce(
        race.actual_starters,
        race.scheduled_starters,
        race.expected_runner_count
      ) as starters,

      v_selection as selection_kind,

      metric.runner_number,
      metric.horse_name,

      lock_runner.start_lane,
      lock_runner.start_distance_meters,
      lock_runner.distance_handicap_meters,

      lock_runner.driver_id,
      lock_runner.driver_name,

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

    join latest_lock_runners lock_runner
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
        or lower(race.track_name) =
           lower(trim(p_track_name))
      )

      and (
        p_driver_name is null
        or trim(p_driver_name) = ''
        or lower(lock_runner.driver_name) =
           lower(trim(p_driver_name))
      )

      and (
        p_start_lane is null
        or lock_runner.start_lane =
           p_start_lane
      )

      and (
        v_lane_group = 'ALL'

        or (
          v_lane_group = 'AUTO_INNER_1_5'
          and race.start_method = 'AUTO'
          and lock_runner.start_lane between 1 and 5
        )

        or (
          v_lane_group = 'AUTO_FRONT_1_8'
          and race.start_method = 'AUTO'
          and lock_runner.start_lane between 1 and 8
        )

        or (
          v_lane_group = 'AUTO_BACK_9_12'
          and race.start_method = 'AUTO'
          and lock_runner.start_lane between 9 and 12
        )

        or (
          v_lane_group = 'AUTO_THIRD_13_15'
          and race.start_method = 'AUTO'
          and lock_runner.start_lane between 13 and 15
        )

        or (
          v_lane_group = 'VOLT_BASE'
          and race.start_method = 'VOLT'
          and coalesce(
            lock_runner.distance_handicap_meters,
            0
          ) = 0
        )

        or (
          v_lane_group = 'VOLT_HANDICAP'
          and race.start_method = 'VOLT'
          and coalesce(
            lock_runner.distance_handicap_meters,
            0
          ) > 0
        )
      )

      and (
        p_race_category is null
        or trim(p_race_category) = ''
        or lower(race.race_category) =
           lower(trim(p_race_category))
      )

      and (
        p_race_class_code is null
        or trim(p_race_class_code) = ''
        or lower(race.race_class_code) =
           lower(trim(p_race_class_code))
      )

      and (
        p_earnings_min is null
        or race.earnings_min >=
           p_earnings_min
      )

      and (
        p_earnings_max is null
        or race.earnings_max <=
           p_earnings_max
      )

      and (
        p_min_starters is null
        or coalesce(
          race.actual_starters,
          race.scheduled_starters,
          race.expected_runner_count
        ) >= p_min_starters
      )

      and (
        p_max_starters is null
        or coalesce(
          race.actual_starters,
          race.scheduled_starters,
          race.expected_runner_count
        ) <= p_max_starters
      )

      and (
        p_min_strength is null
        or lock_runner.strength_total >=
           p_min_strength
      )

      and (
        p_max_strength is null
        or lock_runner.strength_total <=
           p_max_strength
      )

      and (
        p_kr_top4 is null
        or indicator.kr_top4
           is not distinct from p_kr_top4
      )

      and (
        p_st_top4 is null
        or indicator.st_top4
           is not distinct from p_st_top4
      )

      and (
        p_driver_top4 is null
        or indicator.driver_top4
           is not distinct from p_driver_top4
      )

      and (
        p_sp_top4 is null
        or indicator.sp_top4
           is not distinct from p_sp_top4
      )

      and (
        p_gallop_top4 is null
        or indicator.gallop_top4
           is not distinct from p_gallop_top4
      )

      and (
        p_odds_indicator_top4 is null
        or indicator.odds_indicator_top4
           is not distinct from
             p_odds_indicator_top4
      )

      and (
        p_min_drop_percent is null
        or metric.odds_drop_to_lock_percent >=
           p_min_drop_percent
      )

      and (
        p_max_drop_percent is null
        or metric.odds_drop_to_lock_percent <=
           p_max_drop_percent
      )

      and (
        p_min_start_odds is null
        or metric.start_odds >=
           p_min_start_odds
      )

      and (
        p_max_start_odds is null
        or metric.start_odds <=
           p_max_start_odds
      )

      and (
        p_min_lock_odds is null
        or metric.lock_odds >=
           p_min_lock_odds
      )

      and (
        p_max_lock_odds is null
        or metric.lock_odds <=
           p_max_lock_odds
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
    candidate.race_name,
    candidate.planned_start_time,

    candidate.start_method,
    candidate.distance_meters,

    candidate.race_category,
    candidate.race_class_code,

    candidate.earnings_min,
    candidate.earnings_max,

    candidate.starters,

    candidate.selection_kind,

    candidate.runner_number,
    candidate.horse_name,

    candidate.start_lane,
    candidate.start_distance_meters,
    candidate.distance_handicap_meters,

    candidate.driver_id,
    candidate.driver_name,

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
  on function public.research_history_rows_v3(
    date,
    date,
    text,
    text,
    integer,
    text,
    text,
    integer,
    text,
    text,
    text,
    bigint,
    bigint,
    integer,
    integer,
    integer,
    integer,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    boolean,
    integer
  )
  from public;


grant execute
  on function public.research_history_rows_v3(
    date,
    date,
    text,
    text,
    integer,
    text,
    text,
    integer,
    text,
    text,
    text,
    bigint,
    bigint,
    integer,
    integer,
    integer,
    integer,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    boolean,
    integer
  )
  to anon, authenticated;


comment on function public.research_history_options_v2()
is
  'Filtervärden för Historik och analys V2: bana, distans, klass, kusk och spår.';


comment on function public.research_history_rows_v3(
  date,
  date,
  text,
  text,
  integer,
  text,
  text,
  integer,
  text,
  text,
  text,
  bigint,
  bigint,
  integer,
  integer,
  integer,
  integer,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  boolean,
  integer
)
is
  'En vald häst per lopp med kombinerbara filter för odds, indikatorernas topp-4-status, spår, klass, bana, kusk, styrka och startfält.';

notify pgrst, 'reload schema';
