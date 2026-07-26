-- PLACE MODEL V1.0
-- Non-destructive migration: creates new tables for place evaluations and model bets.

create table if not exists public.place_race_evaluations (
  id uuid primary key default gen_random_uuid(),
  race_id text not null,
  rule_version text not null,
  decision text not null,
  reasons text[] not null default '{}',
  race_json jsonb not null,
  lock_time_ms bigint not null,
  locked_at timestamptz not null,
  config_snapshot jsonb not null,
  checks_json jsonb not null,
  smoothest_json jsonb,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, rule_version)
);

create index if not exists idx_place_race_evaluations_date
  on public.place_race_evaluations ((race_json->>'date'));

create table if not exists public.place_model_bets (
  id uuid primary key default gen_random_uuid(),
  bet_id text not null unique,
  race_id text not null,
  rule_version text not null,
  config_snapshot jsonb not null,
  date text not null,
  track_id int not null,
  track_name text not null,
  race_number int not null,
  planned_start_time timestamptz not null,
  lock_time timestamptz not null,
  horse_number int not null,
  horse_name text not null,
  start_lane int,
  start_method text not null,
  distance_meters int,
  starters int not null,
  start_odds numeric(10,4) not null,
  current_win_odds numeric(10,4) not null,
  odds_drop_percent numeric(10,4) not null,
  cv_raw numeric(14,8) not null,
  cv_display numeric(10,4) not null,
  strength int not null,
  indicators_green text[] not null default '{}',
  valid_odds_points int not null,
  stake_oren int not null,
  result_outcome text not null,
  result_status text not null,
  finish_position_official int,
  place_odds_decimal numeric(10,4),
  return_oren int,
  net_oren int,
  roi_pct numeric(10,4),
  automatic_model_bet boolean not null default true,
  user_actually_played boolean not null default false,
  result_source text,
  result_updated_at timestamptz,
  place_odds_entry_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, rule_version)
);

create index if not exists idx_place_model_bets_date
  on public.place_model_bets (date);

create table if not exists public.place_model_audit_log (
  id uuid primary key default gen_random_uuid(),
  bet_id text not null,
  field text not null,
  previous_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_place_model_audit_bet
  on public.place_model_audit_log (bet_id, changed_at desc);
