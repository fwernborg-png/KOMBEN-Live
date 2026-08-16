begin;

-- =========================================================
-- Återbygg äldre GALLOP LOCK-data från minutrådata.
--
-- Samma princip som live:
--   start = första WIN-oddset från T-60
--   lock  = sista WIN-oddset vid/innan exakt T-90
--
-- Resultat, slutodds och utbetalningar ändras INTE.
-- Ett lopp återställs bara om alla aktiva hästar har
-- giltig rådata i T-60 -> T-90-fönstret.
-- =========================================================

create temporary table tmp_gallop_t90_metrics
on commit drop
as
with gallop_races as (
  select
    race.race_key,
    race.source_race_id,
    race.planned_start_time
  from public.research_races race
  where race.sport_type = 'GALLOP'
    and race.planned_start_time is not null
),

lock_runners as (
  select distinct
    runner.race_key,
    runner.runner_number,
    runner.scratched
  from public.research_race_snapshots snapshot
  join public.research_runner_snapshots runner
    on runner.snapshot_key = snapshot.snapshot_key
  join gallop_races race
    on race.race_key = runner.race_key
  where snapshot.signal_phase = 'LIVE'
    and snapshot.capture_type = 'LOCK'
),

raw_points as (
  select
    race.race_key,
    runner.runner_number,
    point.odds_decimal::numeric as odds,
    point.point_ts
  from gallop_races race
  join lock_runners runner
    on runner.race_key = race.race_key
  join public.place_live_odds_points point
    on point.race_id = race.source_race_id
   and point.runner_number = runner.runner_number
   and point.market = 'WIN'
  where point.point_ts >=
          race.planned_start_time - interval '60 minutes'
    and point.point_ts <=
          race.planned_start_time - interval '90 seconds'
    and point.odds_decimal > 0
),

runner_values as (
  select
    race_key,
    runner_number,

    (array_agg(
      odds
      order by point_ts asc
    ))[1] as start_odds,

    (array_agg(
      odds
      order by point_ts desc
    ))[1] as lock_odds,

    min(point_ts) as start_odds_timestamp,
    max(point_ts) as lock_odds_timestamp,

    count(*)::integer as valid_odds_points,

    min(odds) as minimum_odds,
    max(odds) as maximum_odds,
    avg(odds) as mean_odds,

    case
      when count(*) >= 2
       and avg(odds) > 0
      then (
        stddev_pop(odds) /
        avg(odds)
      ) * 100
      else null
    end as cv_percent

  from raw_points
  group by
    race_key,
    runner_number
),

calculated as (
  select
    value.*,

    case
      when value.start_odds > 0
      then (
        (
          value.start_odds -
          value.lock_odds
        ) /
        value.start_odds
      ) * 100
      else null
    end as drop_percent,

    case
      when value.start_odds > 0
      then 1 / value.start_odds
      else null
    end as implied_start,

    case
      when value.lock_odds > 0
      then 1 / value.lock_odds
      else null
    end as implied_lock

  from runner_values value
),

ranked as (
  select
    calc.*,

    row_number() over (
      partition by calc.race_key
      order by
        calc.drop_percent desc nulls last,
        calc.lock_odds asc nulls last,
        calc.runner_number asc
    )::integer as odds_drop_rank,

    case
      when calc.cv_percent is null
      then null
      else row_number() over (
        partition by calc.race_key
        order by
          calc.cv_percent asc nulls last,
          calc.runner_number asc
      )::integer
    end as smoothness_rank,

    row_number() over (
      partition by calc.race_key
      order by
        calc.lock_odds asc nulls last,
        calc.runner_number asc
    )::integer as market_rank,

    calc.implied_start /
      nullif(
        sum(calc.implied_start) over (
          partition by calc.race_key
        ),
        0
      )
      as normalized_market_share_start,

    calc.implied_lock /
      nullif(
        sum(calc.implied_lock) over (
          partition by calc.race_key
        ),
        0
      )
      as normalized_market_share_lock

  from calculated calc
),

race_gaps as (
  select
    race_key,

    max(drop_percent)
      filter (where odds_drop_rank = 1)
    -
    max(drop_percent)
      filter (where odds_drop_rank = 2)
      as top_drop_gap,

    max(cv_percent)
      filter (where smoothness_rank = 2)
    -
    max(cv_percent)
      filter (where smoothness_rank = 1)
      as top_smoothness_gap

  from ranked
  group by race_key
)

select
  ranked.*,
  gaps.top_drop_gap,
  gaps.top_smoothness_gap
from ranked
left join race_gaps gaps
  on gaps.race_key = ranked.race_key
;


-- Bara lopp där SAMTLIGA aktiva hästar har T-60 -> T-90-data.
create temporary table tmp_gallop_t90_valid_races
on commit drop
as
select
  runner.race_key,

  bool_and(
    runner.scratched
    or metric.runner_number is not null
  ) as coverage_complete,

  bool_and(
    runner.scratched
    or coalesce(metric.valid_odds_points, 0) >= 5
  ) as five_points_complete

from (
  select distinct
    snapshot.snapshot_key,
    snapshot.race_key,
    rs.runner_number,
    rs.scratched
  from public.research_race_snapshots snapshot
  join public.research_runner_snapshots rs
    on rs.snapshot_key = snapshot.snapshot_key
  join public.research_races race
    on race.race_key = snapshot.race_key
  where snapshot.signal_phase = 'LIVE'
    and snapshot.capture_type = 'LOCK'
    and race.sport_type = 'GALLOP'
) runner

left join tmp_gallop_t90_metrics metric
  on metric.race_key = runner.race_key
 and metric.runner_number = runner.runner_number

group by runner.race_key

having bool_and(
  runner.scratched
  or metric.runner_number is not null
);


-- ---------------------------------------------------------
-- Kärnmetriken som Galoppstatistiken använder.
-- FINAL/resultatfält lämnas orörda.
-- ---------------------------------------------------------

update public.research_runner_metrics metric
set
  calculated_at =
    race.planned_start_time - interval '90 seconds',

  valid_odds_points =
    rebuilt.valid_odds_points,

  start_odds =
    rebuilt.start_odds,

  lock_odds =
    rebuilt.lock_odds,

  start_odds_timestamp =
    rebuilt.start_odds_timestamp,

  lock_odds_timestamp =
    rebuilt.lock_odds_timestamp,

  odds_drop_to_lock_percent =
    rebuilt.drop_percent,

  minimum_odds =
    rebuilt.minimum_odds,

  maximum_odds =
    rebuilt.maximum_odds,

  mean_odds =
    rebuilt.mean_odds,

  cv_percent =
    rebuilt.cv_percent,

  implied_probability_start =
    rebuilt.implied_start,

  implied_probability_lock =
    rebuilt.implied_lock,

  normalized_market_share_start =
    rebuilt.normalized_market_share_start,

  normalized_market_share_lock =
    rebuilt.normalized_market_share_lock,

  odds_drop_rank =
    rebuilt.odds_drop_rank,

  smoothness_rank =
    rebuilt.smoothness_rank,

  lock_market_rank =
    rebuilt.market_rank,

  is_most_shortened =
    rebuilt.odds_drop_rank = 1,

  is_smoothest =
    coalesce(rebuilt.smoothness_rank = 1, false),

  is_favorite_at_lock =
    rebuilt.market_rank = 1,

  top_odds_drop_gap_to_second =
    rebuilt.top_drop_gap,

  top_smoothness_gap_to_second =
    rebuilt.top_smoothness_gap,

  data_quality_status =
    case
      when rebuilt.valid_odds_points >= 5
        then 'COMPLETE'
      else 'PARTIAL'
    end,

  updated_at = now()

from tmp_gallop_t90_metrics rebuilt
join tmp_gallop_t90_valid_races valid
  on valid.race_key = rebuilt.race_key
join public.research_races race
  on race.race_key = rebuilt.race_key

where metric.race_key = rebuilt.race_key
  and metric.runner_number = rebuilt.runner_number
  and metric.signal_phase = 'LIVE'
  and valid.coverage_complete = true
;


-- ---------------------------------------------------------
-- LOCK-hästarnas visade värden och ranking.
-- ---------------------------------------------------------

update public.research_runner_snapshots runner
set
  current_win_odds =
    rebuilt.lock_odds,

  start_win_odds =
    rebuilt.start_odds,

  odds_drop_percent =
    rebuilt.drop_percent,

  implied_probability_raw =
    rebuilt.implied_lock,

  normalized_market_share =
    rebuilt.normalized_market_share_lock,

  odds_drop_rank =
    rebuilt.odds_drop_rank,

  smoothness_rank =
    rebuilt.smoothness_rank,

  market_rank =
    rebuilt.market_rank,

  is_most_shortened =
    rebuilt.odds_drop_rank = 1,

  is_second_most_shortened =
    rebuilt.odds_drop_rank = 2,

  is_smoothest =
    coalesce(rebuilt.smoothness_rank = 1, false),

  is_second_smoothest =
    coalesce(rebuilt.smoothness_rank = 2, false),

  is_favorite =
    rebuilt.market_rank = 1,

  odds_data_complete =
    rebuilt.valid_odds_points >= 5,

  updated_at = now()

from tmp_gallop_t90_metrics rebuilt
join tmp_gallop_t90_valid_races valid
  on valid.race_key = rebuilt.race_key
join public.research_race_snapshots snapshot
  on snapshot.race_key = rebuilt.race_key
 and snapshot.signal_phase = 'LIVE'
 and snapshot.capture_type = 'LOCK'

where runner.snapshot_key = snapshot.snapshot_key
  and runner.runner_number = rebuilt.runner_number
  and valid.coverage_complete = true
;


-- ODD-indikatorn ska följa den nya T-90-rankingen.
update public.research_runner_indicators indicator
set
  raw_value =
    rebuilt.drop_percent,

  rank_in_race =
    rebuilt.odds_drop_rank,

  is_top_four =
    rebuilt.odds_drop_rank between 1 and 4,

  data_quality_status =
    case
      when rebuilt.valid_odds_points >= 5
        then 'COMPLETE'
      else 'PARTIAL'
    end,

  updated_at = now()

from tmp_gallop_t90_metrics rebuilt
join tmp_gallop_t90_valid_races valid
  on valid.race_key = rebuilt.race_key

where indicator.race_key = rebuilt.race_key
  and indicator.runner_number = rebuilt.runner_number
  and indicator.indicator_code = 'ODD'
  and valid.coverage_complete = true
;


-- ---------------------------------------------------------
-- Märk snapshoten som den kanoniska T-90-snapshoten.
-- Detta gör att den åter syns i Galoppstatistiken.
-- ---------------------------------------------------------

update public.research_race_snapshots snapshot
set
  target_snapshot_time =
    race.planned_start_time - interval '90 seconds',

  actual_snapshot_time =
    race.planned_start_time - interval '90 seconds',

  target_seconds_before_start = 90,
  actual_seconds_before_start = 90,

  latest_odds_timestamp =
    rebuilt.latest_odds_timestamp,

  data_quality_status =
    case
      when valid.five_points_complete
        then 'COMPLETE'
      else 'PARTIAL'
    end,

  snapshot_complete =
    valid.five_points_complete,

  updated_at = now()

from public.research_races race
join tmp_gallop_t90_valid_races valid
  on valid.race_key = race.race_key

join (
  select
    race_key,
    max(lock_odds_timestamp)
      as latest_odds_timestamp
  from tmp_gallop_t90_metrics
  group by race_key
) rebuilt
  on rebuilt.race_key = race.race_key

where snapshot.race_key = race.race_key
  and snapshot.signal_phase = 'LIVE'
  and snapshot.capture_type = 'LOCK'
  and race.sport_type = 'GALLOP'
  and valid.coverage_complete = true
;


do $$
declare
  v_restored integer;
begin
  select count(*)
  into v_restored
  from tmp_gallop_t90_valid_races
  where coverage_complete = true;

  raise notice
    'GALLOP T-90 backfill: % lopp återbyggda från råodds.',
    v_restored;
end
$$;

commit;
