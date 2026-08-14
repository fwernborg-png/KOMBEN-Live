-- TROT COUNTRY + TRACK FILTERS V2
--
-- Icke-destruktiv V2.
-- V1 lämnas orörd.
--
-- Land:
-- SE = Sverige
-- NO = Norge
-- DK = Danmark
-- FR = Frankrike


create or replace function public.research_trot_history_options_v2()
returns table (
  min_date date,
  max_date date,
  race_count bigint,

  countries text[],
  tracks text[],
  tracks_by_country jsonb,

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
  base as (
    select *
    from public.research_trot_history_options_v1()
  ),

  eligible_races as (
    select
      race.country_code,
      race.track_name

    from public.research_races race

    where race.archive_status = 'COMPLETE'
      and race.is_monte = false

      and coalesce(
        race.sport_type,
        'TROT'
      ) <> 'GALLOP'

      and race.country_code is not null
      and trim(race.country_code) <> ''
  ),

  country_tracks as (
    select
      upper(trim(race.country_code))
        as country_code,

      array_agg(
        distinct race.track_name
        order by race.track_name
      ) filter (
        where race.track_name is not null
          and trim(race.track_name) <> ''
      ) as tracks

    from eligible_races race

    group by
      upper(trim(race.country_code))
  )

  select
    base.min_date,
    base.max_date,
    base.race_count,

    coalesce(
      (
        select array_agg(
          item.country_code
          order by item.country_code
        )
        from country_tracks item
      ),
      '{}'::text[]
    ) as countries,

    base.tracks,

    coalesce(
      (
        select jsonb_object_agg(
          item.country_code,
          to_jsonb(
            coalesce(
              item.tracks,
              '{}'::text[]
            )
          )
        )
        from country_tracks item
      ),
      '{}'::jsonb
    ) as tracks_by_country,

    base.distances,
    base.start_methods,

    base.race_categories,
    base.race_class_codes,

    base.drivers,
    base.start_lanes

  from base;
$function$;


revoke all
  on function public.research_trot_history_options_v2()
  from public;

grant execute
  on function public.research_trot_history_options_v2()
  to anon, authenticated;


create or replace function public.research_trot_history_rows_v2(
  p_date_from date default null,
  p_date_to date default null,

  p_selection text default 'MOST_SHORTENED',

  p_start_method text default null,
  p_distance_meters integer default null,

  p_country_code text default null,
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

  from public.research_trot_history_rows_v1(
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

    p_limit =>
      10000
  ) history

  join public.research_races race
    on race.race_key =
       history.race_key

  where (
    p_country_code is null
    or trim(p_country_code) = ''
    or upper(trim(race.country_code)) =
       upper(trim(p_country_code))
  )

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
  on function public.research_trot_history_rows_v2(
    date,
    date,
    text,
    text,
    integer,
    text,
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
  on function public.research_trot_history_rows_v2(
    date,
    date,
    text,
    text,
    integer,
    text,
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


comment on function
  public.research_trot_history_options_v2()
is
  'Trav history options with country and country-to-track mapping.';


comment on function
  public.research_trot_history_rows_v2(
    date,
    date,
    text,
    text,
    integer,
    text,
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
  'Trav history V2 with country filter. V1 remains unchanged.';
