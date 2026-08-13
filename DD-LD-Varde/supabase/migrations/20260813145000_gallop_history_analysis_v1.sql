-- =========================================================
-- GALLOP HISTORY & ANALYSIS V1
-- =========================================================
--
-- Separat analysyta för galopp.
--
-- Påverkar INTE befintliga trav-RPC:er.
--
-- Stöd:
-- • land
-- • bana
-- • turf / dirt
-- • distans
-- • S1 / S2 / alla hästar
-- • handicap/rating
-- • handicaprank
-- • avstånd till högsta handicap
-- • buren vikt
-- • viktrank
-- • oddssänkning
-- • LOCK-odds
-- • officiella WIN / PLACE-resultat


-- =========================================================
-- OPTIONS
-- =========================================================

drop function if exists
  public.research_gallop_history_options_v1();


create function
  public.research_gallop_history_options_v1()
returns table (
  min_date date,
  max_date date,

  race_count bigint,

  countries text[],
  tracks text[],
  surfaces text[],
  distances integer[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$

  with eligible_races as (
    select
      race.race_key,
      race.race_date,
      race.country_code,
      race.track_name,
      race.surface,
      race.distance_meters

    from public.research_races race

    where race.archive_status = 'COMPLETE'
      and race.is_monte = false
      and race.sport_type = 'GALLOP'
  )

  select
    (
      select min(race.race_date)
      from eligible_races race
    ) as min_date,

    (
      select max(race.race_date)
      from eligible_races race
    ) as max_date,

    (
      select count(*)
      from eligible_races race
    ) as race_count,

    coalesce(
      (
        select array_agg(
          value.country_code
          order by value.country_code
        )

        from (
          select distinct
            race.country_code

          from eligible_races race

          where race.country_code is not null
            and trim(race.country_code) <> ''
        ) value
      ),
      '{}'::text[]
    ) as countries,

    coalesce(
      (
        select array_agg(
          value.track_name
          order by value.track_name
        )

        from (
          select distinct
            race.track_name

          from eligible_races race

          where race.track_name is not null
            and trim(race.track_name) <> ''
        ) value
      ),
      '{}'::text[]
    ) as tracks,

    coalesce(
      (
        select array_agg(
          value.surface
          order by value.surface
        )

        from (
          select distinct
            lower(trim(race.surface)) as surface

          from eligible_races race

          where race.surface is not null
            and trim(race.surface) <> ''
        ) value
      ),
      '{}'::text[]
    ) as surfaces,

    coalesce(
      (
        select array_agg(
          value.distance_meters
          order by value.distance_meters
        )

        from (
          select distinct
            race.distance_meters

          from eligible_races race

          where race.distance_meters is not null
        ) value
      ),
      '{}'::integer[]
    ) as distances;

$function$;


revoke all
  on function
    public.research_gallop_history_options_v1()
  from public;

grant execute
  on function
    public.research_gallop_history_options_v1()
  to anon, authenticated;


-- =========================================================
-- ROWS
-- =========================================================

drop function if exists
  public.research_gallop_history_rows_v1(
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
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer
  );


create function
  public.research_gallop_history_rows_v1(
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

    p_min_carried_weight_kg numeric default null,
    p_max_carried_weight_kg numeric default null,

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

    where race.archive_status = 'COMPLETE'
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
    public.research_gallop_history_rows_v1(
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
      numeric,
      numeric,
      numeric,
      numeric,
      numeric,
      numeric,
      integer
    )
  from public;


grant execute
  on function
    public.research_gallop_history_rows_v1(
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
      numeric,
      numeric,
      numeric,
      numeric,
      numeric,
      numeric,
      integer
    )
  to anon, authenticated;


comment on function
  public.research_gallop_history_options_v1()
is
  'Filtervärden för separat internationell galoppanalys.';


comment on function
  public.research_gallop_history_rows_v1(
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
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer
  )
is
  'Separat historik-RPC för galopp: land, underlag, handicap, vikt, S1/S2 och odds.';
