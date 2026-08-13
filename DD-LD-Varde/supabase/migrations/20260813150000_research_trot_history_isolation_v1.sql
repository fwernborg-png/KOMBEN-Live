-- RESEARCH TROT HISTORY ISOLATION V1
--
-- Trav/Historik ska inte kunna blanda in GALLOP.
-- Galopp har nu sin egen separata analysyta.
--
-- Ingen underliggande forskningsdata raderas eller ändras.


drop function if exists public.research_trot_history_options_v1();


create function public.research_trot_history_options_v1()
returns table (
  min_date date,
  max_date date,
  race_count bigint,

  tracks text[],
  distances integer[],
  start_methods text[],

  race_categories text[],
  race_class_codes text[],

  drivers text[],
  start_lanes integer[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with
  eligible_races as (
    select
      race.race_key,
      race.race_date,
      race.track_name,
      race.distance_meters,
      race.start_method,
      race.race_category,
      race.race_class_code

    from public.research_races race

    where race.archive_status = 'COMPLETE'
      and race.is_monte = false

      -- Bevara gammal travdata där sport_type ännu saknas,
      -- men släpp aldrig in explicit GALLOP.
      and coalesce(
        race.sport_type,
        'TROT'
      ) <> 'GALLOP'
  ),

  latest_lock_runners as (
    select distinct on (
      runner.race_key,
      runner.runner_number
    )
      runner.race_key,
      runner.runner_number,
      runner.driver_name,
      runner.start_lane

    from public.research_race_snapshots snapshot

    join public.research_runner_snapshots runner
      on runner.snapshot_key =
         snapshot.snapshot_key

    join eligible_races race
      on race.race_key =
         runner.race_key

    where snapshot.signal_phase = 'LIVE'
      and snapshot.capture_type = 'LOCK'

    order by
      runner.race_key,
      runner.runner_number,
      snapshot.actual_snapshot_time desc,
      snapshot.updated_at desc,
      runner.updated_at desc
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
          value.track_name
          order by value.track_name
        )
        from (
          select distinct race.track_name
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
          value.distance_meters
          order by value.distance_meters
        )
        from (
          select distinct race.distance_meters
          from eligible_races race
          where race.distance_meters is not null
        ) value
      ),
      '{}'::integer[]
    ) as distances,

    coalesce(
      (
        select array_agg(
          value.start_method
          order by value.start_method
        )
        from (
          select distinct race.start_method
          from eligible_races race
          where race.start_method is not null
            and trim(race.start_method) <> ''
        ) value
      ),
      '{}'::text[]
    ) as start_methods,

    coalesce(
      (
        select array_agg(
          value.race_category
          order by value.race_category
        )
        from (
          select distinct race.race_category
          from eligible_races race
          where race.race_category is not null
            and trim(race.race_category) <> ''
        ) value
      ),
      '{}'::text[]
    ) as race_categories,

    coalesce(
      (
        select array_agg(
          value.race_class_code
          order by value.race_class_code
        )
        from (
          select distinct race.race_class_code
          from eligible_races race
          where race.race_class_code is not null
            and trim(race.race_class_code) <> ''
        ) value
      ),
      '{}'::text[]
    ) as race_class_codes,

    coalesce(
      (
        select array_agg(
          value.driver_name
          order by value.driver_name
        )
        from (
          select distinct runner.driver_name
          from latest_lock_runners runner
          where runner.driver_name is not null
            and trim(runner.driver_name) <> ''
        ) value
      ),
      '{}'::text[]
    ) as drivers,

    coalesce(
      (
        select array_agg(
          value.start_lane
          order by value.start_lane
        )
        from (
          select distinct runner.start_lane
          from latest_lock_runners runner
          where runner.start_lane is not null
        ) value
      ),
      '{}'::integer[]
    ) as start_lanes;
$function$;


revoke all
  on function public.research_trot_history_options_v1()
  from public;

grant execute
  on function public.research_trot_history_options_v1()
  to anon, authenticated;



drop function if exists public.research_trot_history_rows_v1(
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


create function public.research_trot_history_rows_v1(
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
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    history.*

  from public.research_history_rows_v4(
    p_date_from =>
      p_date_from,

    p_date_to =>
      p_date_to,

    p_selection =>
      p_selection,

    p_start_method =>
      p_start_method,

    p_distance_meters =>
      p_distance_meters,

    p_track_name =>
      p_track_name,

    p_driver_name =>
      p_driver_name,

    p_start_lane =>
      p_start_lane,

    p_lane_group =>
      p_lane_group,

    p_race_category =>
      p_race_category,

    p_race_class_code =>
      p_race_class_code,

    p_earnings_min =>
      p_earnings_min,

    p_earnings_max =>
      p_earnings_max,

    p_min_starters =>
      p_min_starters,

    p_max_starters =>
      p_max_starters,

    p_min_strength =>
      p_min_strength,

    p_max_strength =>
      p_max_strength,

    p_kr_top4 =>
      p_kr_top4,

    p_st_top4 =>
      p_st_top4,

    p_driver_top4 =>
      p_driver_top4,

    p_sp_top4 =>
      p_sp_top4,

    p_gallop_top4 =>
      p_gallop_top4,

    p_odds_indicator_top4 =>
      p_odds_indicator_top4,

    p_min_drop_percent =>
      p_min_drop_percent,

    p_max_drop_percent =>
      p_max_drop_percent,

    p_min_start_odds =>
      p_min_start_odds,

    p_max_start_odds =>
      p_max_start_odds,

    p_min_lock_odds =>
      p_min_lock_odds,

    p_max_lock_odds =>
      p_max_lock_odds,

    p_complete_only =>
      p_complete_only,

    -- V4 filtrerar först. Ta ett stort säkert internt urval
    -- och applicera användarens limit efter sportisoleringen.
    p_limit =>
      10000
  ) history

  join public.research_races race
    on race.race_key =
       history.race_key

  where coalesce(
    race.sport_type,
    'TROT'
  ) <> 'GALLOP'

  order by
    history.race_date desc,
    history.planned_start_time desc nulls last,
    history.track_name,
    history.race_number

  limit greatest(
    1,
    least(
      coalesce(p_limit, 5000),
      10000
    )
  );
$function$;


revoke all
  on function public.research_trot_history_rows_v1(
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
  on function public.research_trot_history_rows_v1(
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

comment on function public.research_trot_history_options_v1()
is
  'Trav-only filter options. Explicit GALLOP rows are excluded.';

comment on function public.research_trot_history_rows_v1(
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
  'Trav-only history wrapper around research_history_rows_v4. Explicit GALLOP rows are excluded.';
