-- =========================================================
-- GALLOP HISTORY EXACT T-90
-- =========================================================
--
-- Lägger till filter för:
-- - handicaprank
-- - viktrank
--
-- Rank 1 = högsta HCP respektive högsta buren vikt.
-- 5+ = rank 5 eller lägre placerad i rankingen.
--
-- V1 lämnas orörd.

drop function if exists
  public.research_gallop_history_rows_v2
  (
    date,
    date,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    integer
  );

create function
  public.research_gallop_history_rows_v2(
    p_date_from date default null,
    p_date_to date default null,

    p_selection text default 'S1',

    p_country_code text default null,
    p_track_name text default null,
    p_surface text default null,

    p_distance_meters integer default null,

    p_min_starters integer default null,
    p_max_starters integer default null,

    p_min_handicap_rating numeric default null,
    p_max_handicap_rating numeric default null,

    p_handicap_rank text default null,

    p_min_carried_weight_kg numeric default null,
    p_max_carried_weight_kg numeric default null,

    p_weight_rank text default null,

    p_min_drop_percent numeric default null,
    p_max_drop_percent numeric default null,

    p_min_lock_odds numeric default null,
    p_max_lock_odds numeric default null,

    p_limit integer default 5000
  )
returns table (
  race_key text,
  race_date date,

  country_code text,

  track_name text,
  race_number integer,
  race_name text,

  planned_start_time timestamptz,

  surface text,
  going text,
  is_handicap_race boolean,

  start_method text,
  distance_meters integer,
  starters integer,

  selection_kind text,

  runner_number integer,
  horse_name text,

  handicap_rating numeric,
  handicap_rank integer,
  handicap_delta_from_top numeric,

  carried_weight_kg numeric,
  weight_rank integer,

  rider_id bigint,
  rider_name text,

  strength_total integer,

  start_odds numeric,
  lock_odds numeric,
  final_odds numeric,

  odds_drop_to_lock_percent numeric,
  odds_drop_to_final_percent numeric,

  cv_percent numeric,
  valid_odds_points integer,

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
        nullif(
          trim(p_selection),
          ''
        ),
        'S1'
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
        coalesce(
          p_limit,
          5000
        ),
        10000
      )
    );

begin

  if v_selection not in (
    'S1',
    'S2',
    'ALL_RUNNERS'
  ) then
    raise exception
      'Ogiltigt galoppurval: %',
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


  latest_lock_runners as (
    select distinct on (
      runner.race_key,
      runner.runner_number
    )
      runner.runner_snapshot_key,
      runner.race_key,
      runner.runner_number,

      runner.horse_name,

      runner.handicap_rating,
      runner.carried_weight_kg,

      runner.rider_id,
      runner.rider_name,

      runner.strength_total,

      runner.indicator_data_complete,
      runner.odds_data_complete

    from public.research_race_snapshots snapshot

    join public.research_runner_snapshots runner
      on runner.snapshot_key =
         snapshot.snapshot_key

    where snapshot.signal_phase = 'LIVE'
      and snapshot.capture_type = 'LOCK'
      and abs(
        snapshot.actual_seconds_before_start - 90
      ) <= 1

    order by
      runner.race_key,
      runner.runner_number,
      snapshot.actual_snapshot_time desc,
      snapshot.updated_at desc,
      runner.updated_at desc
  ),


  ranked_lock_runners as (
    select
      runner.*,

      case
        when runner.handicap_rating is null
          then null

        else
          dense_rank() over (
            partition by runner.race_key
            order by
              runner.handicap_rating desc
          )::integer
      end as handicap_rank,

      case
        when runner.handicap_rating is null
          then null

        else
          max(
            runner.handicap_rating
          ) over (
            partition by runner.race_key
          ) -
          runner.handicap_rating
      end as handicap_delta_from_top,

      case
        when runner.carried_weight_kg is null
          then null

        else
          dense_rank() over (
            partition by runner.race_key
            order by
              runner.carried_weight_kg desc
          )::integer
      end as weight_rank

    from latest_lock_runners runner
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

      race.country_code,

      race.track_name,
      race.race_number,
      race.race_name,

      race.planned_start_time,

      race.surface,
      race.going,
      race.is_handicap_race,

      race.start_method,
      race.distance_meters,

      coalesce(
        race.actual_starters,
        race.scheduled_starters,
        race.expected_runner_count
      ) as starters,

      v_selection as selection_kind,

      metric.runner_number,
      lock_runner.horse_name,

      lock_runner.handicap_rating,
      lock_runner.handicap_rank,
      lock_runner.handicap_delta_from_top,

      lock_runner.carried_weight_kg,
      lock_runner.weight_rank,

      lock_runner.rider_id,
      lock_runner.rider_name,

      lock_runner.strength_total,

      metric.start_odds,
      metric.lock_odds,
      metric.final_odds,

      metric.odds_drop_to_lock_percent,
      metric.odds_drop_to_final_percent,

      metric.cv_percent,
      metric.valid_odds_points,

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
      lock_runner.odds_data_complete

    from public.research_races race

    join latest_metrics metric
      on metric.race_key =
         race.race_key

    join ranked_lock_runners lock_runner
      on lock_runner.race_key =
         metric.race_key
     and lock_runner.runner_number =
         metric.runner_number

    join latest_results result
      on result.race_key =
         metric.race_key
     and result.runner_number =
         metric.runner_number

    where (
      race.archive_status = 'COMPLETE'
      or (
        race.archive_status = 'INCOMPLETE'
        and race.archived_result_count > 0
        and cardinality(
          race.missing_fields
        ) > 0
        and race.missing_fields <@
          array['officialPlaceOdds']::text[]
      )
    )
      and race.is_monte = false
      and race.sport_type = 'GALLOP'

      and race.race_date between
        least(
          v_date_from,
          v_date_to
        )
        and greatest(
          v_date_from,
          v_date_to
        )

      and (
        p_country_code is null
        or trim(p_country_code) = ''
        or upper(race.country_code) =
           upper(trim(p_country_code))
      )

      and (
        p_track_name is null
        or trim(p_track_name) = ''
        or lower(race.track_name) =
           lower(trim(p_track_name))
      )

      and (
        p_surface is null
        or trim(p_surface) = ''
        or lower(race.surface) =
           lower(trim(p_surface))
      )

      and (
        p_distance_meters is null
        or race.distance_meters =
           p_distance_meters
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
        p_min_handicap_rating is null
        or lock_runner.handicap_rating >=
           p_min_handicap_rating
      )

      and (
        p_max_handicap_rating is null
        or lock_runner.handicap_rating <=
           p_max_handicap_rating
      )

      and case
        when p_handicap_rank is null
          or trim(p_handicap_rank) = ''
          then true

        when trim(p_handicap_rank) = '5+'
          then lock_runner.handicap_rank >= 5

        when trim(p_handicap_rank) in (
          '1',
          '2',
          '3',
          '4'
        )
          then lock_runner.handicap_rank =
               trim(p_handicap_rank)::integer

        else false
      end

      and (
        p_min_carried_weight_kg is null
        or lock_runner.carried_weight_kg >=
           p_min_carried_weight_kg
      )

      and (
        p_max_carried_weight_kg is null
        or lock_runner.carried_weight_kg <=
           p_max_carried_weight_kg
      )

      and case
        when p_weight_rank is null
          or trim(p_weight_rank) = ''
          then true

        when trim(p_weight_rank) = '5+'
          then lock_runner.weight_rank >= 5

        when trim(p_weight_rank) in (
          '1',
          '2',
          '3',
          '4'
        )
          then lock_runner.weight_rank =
               trim(p_weight_rank)::integer

        else false
      end

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
        v_selection = 'ALL_RUNNERS'

        or (
          v_selection = 'S1'
          and metric.odds_drop_rank = 1
        )

        or (
          v_selection = 'S2'
          and metric.odds_drop_rank = 2
        )
      )
  )


  select
    candidate.race_key,
    candidate.race_date,

    candidate.country_code,

    candidate.track_name,
    candidate.race_number,
    candidate.race_name,

    candidate.planned_start_time,

    candidate.surface,
    candidate.going,
    candidate.is_handicap_race,

    candidate.start_method,
    candidate.distance_meters,
    candidate.starters,

    candidate.selection_kind,

    candidate.runner_number,
    candidate.horse_name,

    candidate.handicap_rating,
    candidate.handicap_rank,
    candidate.handicap_delta_from_top,

    candidate.carried_weight_kg,
    candidate.weight_rank,

    candidate.rider_id,
    candidate.rider_name,

    candidate.strength_total,

    candidate.start_odds,
    candidate.lock_odds,
    candidate.final_odds,

    candidate.odds_drop_to_lock_percent,
    candidate.odds_drop_to_final_percent,

    candidate.cv_percent,
    candidate.valid_odds_points,

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

  order by
    candidate.race_date desc,
    candidate.planned_start_time desc nulls last,
    candidate.country_code,
    candidate.track_name,
    candidate.race_number,
    candidate.runner_number

  limit v_limit;

end;

$function$;


revoke all
  on function
    public.research_gallop_history_rows_v2
    (
    date,
    date,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    integer
  )
  from public;


grant execute
  on function
    public.research_gallop_history_rows_v2
    (
    date,
    date,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    integer
  )
  to anon, authenticated;


comment on function
  public.research_gallop_history_rows_v2
  (
    date,
    date,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    integer
  )
is
  'Galopphistorik V2 med filter för HCP-rank och viktrank.';
