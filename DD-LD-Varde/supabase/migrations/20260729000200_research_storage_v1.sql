-- RESEARCH STORAGE V1
--
-- Icke-destruktivt forskningslager för samtliga lopp och hästar.
-- Befintliga modell-, notis- och speljournalstabeller ändras inte.
--
-- Minutdata fortsätter tills vidare ligga i place_live_odds_points.
-- Dessa tabeller innehåller det permanenta, kompakta arkivet.

create table if not exists public.research_races (
  race_key text primary key,

  source_race_id text not null,
  race_date date not null,

  event_id text,
  meeting_id text,
  meeting_name text,

  country_code text not null default 'SE'
    check (country_code in ('SE', 'NO', 'DK', 'FR')),

  currency_code text not null default 'SEK'
    check (currency_code in ('SEK', 'NOK', 'DKK', 'EUR')),

  track_id int not null,
  track_name text not null,
  race_number int not null,

  race_name text,

  planned_start_time timestamptz,
  actual_start_time timestamptz,

  race_status text,

  start_method text
    check (
      start_method is null
      or start_method in ('AUTO', 'VOLT', 'UNKNOWN')
    ),

  distance_meters int,
  is_monte boolean not null default false,

  scheduled_starters int,
  actual_starters int,

  race_class_code text,
  race_category text,

  earnings_min bigint,
  earnings_max bigint,

  age_min int,
  age_max int,
  sex_condition text,

  first_additional_distance_meters int,

  prize_money_total bigint,
  first_prize bigint,

  meeting_time_category text
    check (
      meeting_time_category is null
      or meeting_time_category in (
        'LUNCH',
        'DAY',
        'EVENING',
        'NIGHT',
        'UNKNOWN'
      )
    ),

  meeting_time_category_method text,

  archive_status text not null default 'COLLECTING'
    check (
      archive_status in (
        'COLLECTING',
        'READY_TO_ARCHIVE',
        'COMPLETE',
        'INCOMPLETE',
        'FAILED'
      )
    ),

  expected_runner_count int,
  archived_runner_count int not null default 0,
  archived_result_count int not null default 0,
  archived_odds_point_count int not null default 0,

  missing_fields text[] not null default '{}',
  invalid_fields text[] not null default '{}',

  collector_version text not null,
  parser_version text not null,

  source_provider text not null default 'ATG',

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    source_race_id,
    race_date,
    track_id,
    race_number
  )
);

create index if not exists idx_research_races_date_track
  on public.research_races (
    race_date,
    track_id,
    race_number
  );

create index if not exists idx_research_races_filters
  on public.research_races (
    meeting_time_category,
    start_method,
    distance_meters,
    is_monte
  );

create index if not exists idx_research_races_archive_status
  on public.research_races (
    archive_status,
    race_date
  );


create table if not exists public.research_race_products (
  product_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  product_code text not null,
  product_id text,

  leg_number int,
  total_legs int,

  product_start_time timestamptz,

  is_main_product boolean not null default false,

  turnover_minor_units bigint,

  country_code text not null default 'SE',
  currency_code text not null default 'SEK',

  source text not null default 'ATG',

  raw_product_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_products_filter
  on public.research_race_products (
    product_code,
    leg_number,
    race_key
  );

create index if not exists idx_research_products_race
  on public.research_race_products (race_key);


create table if not exists public.research_race_snapshots (
  snapshot_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  signal_phase text not null default 'LIVE'
    check (signal_phase in ('LIVE', 'BACKTEST')),

  capture_type text not null
    check (
      capture_type in (
        'START',
        'T30',
        'T15',
        'T10',
        'T9',
        'T8',
        'T7',
        'T6',
        'T5',
        'T4',
        'T3',
        'T2',
        'LOCK',
        'T1',
        'FINAL',
        'EVENT',
        'RESULT'
      )
    ),

  target_snapshot_time timestamptz,
  actual_snapshot_time timestamptz not null,

  target_seconds_before_start numeric(12,3),
  actual_seconds_before_start numeric(12,3),

  latest_odds_timestamp timestamptz,
  data_fetched_at timestamptz not null,

  data_quality_status text not null default 'COMPLETE'
    check (
      data_quality_status in (
        'COMPLETE',
        'PARTIAL',
        'INVALID',
        'STALE'
      )
    ),

  snapshot_complete boolean not null default true,

  expected_runner_count int,
  archived_runner_count int not null default 0,

  missing_fields text[] not null default '{}',
  invalid_fields text[] not null default '{}',
  stale_fields text[] not null default '{}',
  source_errors text[] not null default '{}',

  collector_version text not null,
  parser_version text not null,
  sampling_version text not null,

  raw_race_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_snapshots_race
  on public.research_race_snapshots (
    race_key,
    actual_snapshot_time
  );

create index if not exists idx_research_snapshots_capture
  on public.research_race_snapshots (
    capture_type,
    actual_snapshot_time
  );


create table if not exists public.research_runner_snapshots (
  runner_snapshot_key text primary key,

  snapshot_key text not null
    references public.research_race_snapshots(snapshot_key)
    on delete cascade,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  runner_number int not null,

  horse_id bigint,
  horse_name text not null,

  horse_age int,
  horse_sex text,

  start_lane int,
  start_distance_meters int,
  distance_handicap_meters int,

  driver_id bigint,
  driver_name text,

  trainer_id bigint,
  trainer_name text,

  scratched boolean not null default false,
  scratched_at timestamptz,
  scratch_reason text,

  runner_status text,

  current_win_odds numeric(12,4),
  current_place_odds numeric(12,4),

  start_win_odds numeric(12,4),
  odds_drop_percent numeric(12,6),

  implied_probability_raw numeric(16,10),
  normalized_market_share numeric(16,10),

  strength_total int,

  odds_drop_rank int,
  smoothness_rank int,
  market_rank int,

  is_most_shortened boolean not null default false,
  is_second_most_shortened boolean not null default false,

  is_smoothest boolean not null default false,
  is_second_smoothest boolean not null default false,

  is_favorite boolean not null default false,

  indicator_data_complete boolean not null default false,
  odds_data_complete boolean not null default false,

  missing_fields text[] not null default '{}',
  invalid_fields text[] not null default '{}',

  raw_runner_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (snapshot_key, runner_number)
);

create index if not exists idx_research_runner_snapshots_race
  on public.research_runner_snapshots (
    race_key,
    runner_number
  );

create index if not exists idx_research_runner_snapshots_rank
  on public.research_runner_snapshots (
    race_key,
    odds_drop_rank,
    smoothness_rank,
    market_rank
  );


create table if not exists public.research_runner_indicators (
  indicator_key text primary key,

  runner_snapshot_key text not null
    references public.research_runner_snapshots(runner_snapshot_key)
    on delete cascade,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  runner_number int not null,

  indicator_code text not null,

  raw_value numeric(18,8),
  rank_in_race int,

  is_top_four boolean not null default false,

  ranking_direction text not null
    check (ranking_direction in ('HIGH', 'LOW')),

  source text not null,
  source_updated_at timestamptz,

  data_quality_status text not null default 'COMPLETE'
    check (
      data_quality_status in (
        'COMPLETE',
        'PARTIAL',
        'INVALID',
        'STALE'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    runner_snapshot_key,
    indicator_code
  )
);

create index if not exists idx_research_indicators_filter
  on public.research_runner_indicators (
    indicator_code,
    is_top_four,
    rank_in_race
  );

create index if not exists idx_research_indicators_race
  on public.research_runner_indicators (
    race_key,
    runner_number
  );


create table if not exists public.research_odds_points (
  odds_point_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  signal_phase text not null default 'LIVE'
    check (signal_phase in ('LIVE', 'BACKTEST')),

  runner_number int not null,

  horse_id bigint,
  horse_name text not null,

  capture_type text not null
    check (
      capture_type in (
        'START',
        'T30',
        'T15',
        'T10',
        'T9',
        'T8',
        'T7',
        'T6',
        'T5',
        'T4',
        'T3',
        'T2',
        'LOCK',
        'T1',
        'FINAL',
        'EVENT',
        'RESULT'
      )
    ),

  target_seconds_before_start numeric(12,3),
  actual_seconds_before_start numeric(12,3) not null,

  point_timestamp timestamptz not null,
  target_timestamp timestamptz,

  source_timestamp_delta_seconds numeric(12,3),

  win_odds_decimal numeric(12,4),
  place_odds_decimal numeric(12,4),

  odds_valid boolean not null default true,
  invalid_reason text,

  scratched_at_point boolean not null default false,

  source text not null default 'ATG',
  fetched_at timestamptz not null,

  sampling_version text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_odds_race_runner
  on public.research_odds_points (
    signal_phase,
    race_key,
    runner_number,
    point_timestamp
  );

create index if not exists idx_research_odds_capture
  on public.research_odds_points (
    capture_type,
    point_timestamp
  );


create table if not exists public.research_runner_metrics (
  metric_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  signal_phase text not null default 'LIVE'
    check (signal_phase in ('LIVE', 'BACKTEST')),

  runner_number int not null,

  horse_id bigint,
  horse_name text not null,

  metrics_version text not null,

  calculated_at timestamptz not null,

  valid_odds_points int not null default 0,

  start_odds numeric(12,4),
  lock_odds numeric(12,4),
  final_odds numeric(12,4),

  start_odds_timestamp timestamptz,
  lock_odds_timestamp timestamptz,
  final_odds_timestamp timestamptz,

  odds_drop_to_lock_percent numeric(14,8),
  odds_drop_to_final_percent numeric(14,8),

  odds_drop_last_10_minutes_percent numeric(14,8),
  odds_drop_last_5_minutes_percent numeric(14,8),
  odds_drop_last_2_minutes_percent numeric(14,8),

  minimum_odds numeric(12,4),
  maximum_odds numeric(12,4),
  mean_odds numeric(14,8),

  cv_percent numeric(14,8),
  cv_last_10_minutes_percent numeric(14,8),

  odds_drops_count int not null default 0,
  odds_rises_count int not null default 0,
  odds_unchanged_count int not null default 0,

  largest_single_drop_percent numeric(14,8),
  largest_single_rise_percent numeric(14,8),
  largest_rebound_percent numeric(14,8),

  trend_slope_odds_per_minute numeric(18,10),

  implied_probability_start numeric(16,10),
  implied_probability_lock numeric(16,10),
  implied_probability_final numeric(16,10),

  normalized_market_share_start numeric(16,10),
  normalized_market_share_lock numeric(16,10),
  normalized_market_share_final numeric(16,10),

  odds_drop_rank int,
  smoothness_rank int,
  lock_market_rank int,

  is_most_shortened boolean not null default false,
  is_smoothest boolean not null default false,
  is_favorite_at_lock boolean not null default false,

  top_odds_drop_gap_to_second numeric(14,8),
  top_smoothness_gap_to_second numeric(14,8),

  data_quality_status text not null default 'COMPLETE'
    check (
      data_quality_status in (
        'COMPLETE',
        'PARTIAL',
        'INVALID',
        'STALE'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    race_key,
    signal_phase,
    runner_number,
    metrics_version
  )
);

create index if not exists idx_research_metrics_filters
  on public.research_runner_metrics (
    odds_drop_rank,
    smoothness_rank,
    lock_market_rank
  );

create index if not exists idx_research_metrics_race
  on public.research_runner_metrics (
    signal_phase,
    race_key,
    runner_number
  );


create table if not exists public.research_race_events (
  event_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  event_type text not null
    check (
      event_type in (
        'SCRATCHED',
        'SCRATCH_REVERSED',
        'START_TIME_CHANGED',
        'DRIVER_CHANGED',
        'START_LANE_CHANGED',
        'START_FIELD_CHANGED',
        'LARGE_ODDS_MOVE',
        'RACE_STATUS_CHANGED',
        'OTHER'
      )
    ),

  event_timestamp timestamptz not null,
  seconds_before_start numeric(12,3),

  runner_number int,
  horse_id bigint,

  previous_value_json jsonb,
  new_value_json jsonb,

  source text not null default 'ATG',
  raw_event_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_research_events_race_time
  on public.research_race_events (
    race_key,
    event_timestamp
  );

create index if not exists idx_research_events_type
  on public.research_race_events (
    event_type,
    event_timestamp
  );


create table if not exists public.research_runner_results (
  result_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  runner_number int not null,

  horse_id bigint,
  horse_name text not null,

  result_revision int not null default 1,

  started boolean,
  scratched_after_lock boolean not null default false,

  finish_position_official int,
  finish_position_shared boolean not null default false,
  dead_heat_group text,

  winner_official boolean not null default false,

  placed_official boolean,
  paid_place_count int,

  disqualified boolean not null default false,
  did_not_finish boolean not null default false,
  galloped boolean,

  official_win_odds_decimal numeric(12,4),
  official_place_odds_decimal numeric(12,4),

  result_status text not null default 'PENDING'
    check (
      result_status in (
        'PENDING',
        'PRELIMINARY',
        'OFFICIAL',
        'REVISED',
        'VOID'
      )
    ),

  result_source text not null,
  result_received_at timestamptz not null,

  raw_result_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    race_key,
    runner_number,
    result_revision
  )
);

create index if not exists idx_research_results_race
  on public.research_runner_results (
    race_key,
    finish_position_official
  );

create index if not exists idx_research_results_winner_place
  on public.research_runner_results (
    winner_official,
    placed_official
  );


create table if not exists public.research_archive_runs (
  id uuid primary key default gen_random_uuid(),

  race_key text
    references public.research_races(race_key)
    on delete cascade,

  signal_phase text not null default 'LIVE'
    check (signal_phase in ('LIVE', 'BACKTEST')),

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  status text not null
    check (
      status in (
        'RUNNING',
        'SUCCESS',
        'PARTIAL',
        'FAILED'
      )
    ),

  archive_version text not null,

  summary_json jsonb not null default '{}'::jsonb,
  error_text text,

  created_at timestamptz not null default now()
);

create index if not exists idx_research_archive_runs
  on public.research_archive_runs (
    signal_phase,
    started_at desc,
    status
  );


-- Forskningslagret skrivs inledningsvis endast av Workerns service role.
-- Läsbehörighet för appens analysvy läggs till separat i Block 4.

alter table public.research_races
  enable row level security;

alter table public.research_race_products
  enable row level security;

alter table public.research_race_snapshots
  enable row level security;

alter table public.research_runner_snapshots
  enable row level security;

alter table public.research_runner_indicators
  enable row level security;

alter table public.research_odds_points
  enable row level security;

alter table public.research_runner_metrics
  enable row level security;

alter table public.research_race_events
  enable row level security;

alter table public.research_runner_results
  enable row level security;

alter table public.research_archive_runs
  enable row level security;
