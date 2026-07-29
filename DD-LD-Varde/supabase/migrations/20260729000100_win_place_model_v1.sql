-- WIN + PLACE MODEL V1
-- Separat lagring för den nya marknadsregeln:
-- mest sänkt, minst 30 % sänkning och vinnarodds högst 6,00.

create table if not exists public.win_place_race_evaluations (
  id uuid primary key default gen_random_uuid(),
  race_id text not null,
  rule_version text not null,
  decision text not null
    check (
      decision in (
        'PLAY',
        'NO_PLAY',
        'EXCLUDED',
        'INSUFFICIENT_DATA'
      )
    ),
  reasons text[] not null default '{}',
  race_json jsonb not null,
  planned_lock_time_ms bigint not null,
  actual_lock_time_ms bigint not null,
  locked_at timestamptz not null,
  seconds_before_start numeric(10,3) not null,
  config_snapshot jsonb not null,
  checks_json jsonb not null,
  most_shortened_json jsonb,
  snapshot_json jsonb not null default '{}'::jsonb,
  signal_phase text not null default 'LIVE'
    check (signal_phase in ('LIVE', 'BACKTEST')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, rule_version, signal_phase)
);

create index if not exists idx_win_place_evaluations_lookup
  on public.win_place_race_evaluations (
    rule_version,
    signal_phase,
    locked_at desc
  );

create index if not exists idx_win_place_evaluations_race
  on public.win_place_race_evaluations (
    race_id,
    rule_version
  );

create table if not exists public.win_place_model_bets (
  id uuid primary key default gen_random_uuid(),
  bet_id text not null unique,
  race_id text not null,
  rule_version text not null,
  market text not null
    check (market in ('WIN', 'PLACE')),
  signal_phase text not null default 'LIVE'
    check (signal_phase in ('LIVE', 'BACKTEST')),
  config_snapshot jsonb not null,

  date text not null,
  track_id int not null,
  track_name text not null,
  race_number int not null,
  planned_start_time timestamptz not null,
  lock_time timestamptz not null,
  seconds_before_start numeric(10,3) not null,

  horse_number int not null,
  horse_name text not null,
  horse_id bigint,
  start_lane int,
  start_method text,
  distance_meters int,
  starters int,

  start_odds numeric(10,4) not null,
  locked_win_odds numeric(10,4) not null,
  odds_drop_percent numeric(10,4) not null,
  cv_raw numeric(10,6),
  cv_display numeric(10,2),
  strength int not null,
  indicators_green text[] not null default '{}',
  valid_odds_points int not null,

  stake_oren int not null,
  result_outcome text not null default 'PENDING'
    check (
      result_outcome in (
        'PENDING',
        'HIT',
        'MISS',
        'VOID'
      )
    ),
  result_status text not null default 'PENDING'
    check (
      result_status in (
        'PENDING',
        'RESULT_READY',
        'SAKNAR_ODDS',
        'VOID'
      )
    ),

  finish_position_official int,
  official_win_odds_decimal numeric(10,4),
  place_odds_decimal numeric(10,4),
  return_oren int,
  net_oren int,
  roi_pct numeric(12,4),

  automatic_model_bet boolean not null default true,
  user_actually_played boolean not null default false,
  result_source text,
  result_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    race_id,
    rule_version,
    market,
    signal_phase
  )
);

create index if not exists idx_win_place_bets_date
  on public.win_place_model_bets (
    date,
    track_id,
    race_number
  );

create index if not exists idx_win_place_bets_pending
  on public.win_place_model_bets (
    result_outcome,
    date
  );

create index if not exists idx_win_place_bets_stats
  on public.win_place_model_bets (
    rule_version,
    signal_phase,
    market,
    result_outcome
  );
