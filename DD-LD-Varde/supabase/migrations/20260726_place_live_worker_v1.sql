-- PLACE MODEL LIVE WORKER V1
-- Adds durable minute-level odds collection and worker run monitoring.

create table if not exists public.place_live_race_states (
  id uuid primary key default gen_random_uuid(),
  race_id text not null,
  race_date text not null,
  track_id int not null,
  track_name text not null,
  race_number int not null,
  planned_start_time timestamptz,
  race_status text,
  is_monte boolean not null default false,
  start_method text,
  distance_meters int,
  starters int,
  payload_json jsonb not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, race_date)
);

create index if not exists idx_place_live_race_states_date_track
  on public.place_live_race_states (race_date, track_id, race_number);

create table if not exists public.place_live_odds_points (
  id uuid primary key default gen_random_uuid(),
  race_id text not null,
  race_date text not null,
  track_id int not null,
  track_name text not null,
  race_number int not null,
  runner_number int not null,
  horse_id bigint,
  horse_name text not null,
  market text not null check (market in ('WIN', 'PLACE')),
  odds_decimal numeric(10,4) not null,
  point_ts timestamptz not null,
  source text not null default 'ATG',
  created_at timestamptz not null default now(),
  unique (race_id, runner_number, market, point_ts)
);

create index if not exists idx_place_live_odds_lookup
  on public.place_live_odds_points (race_id, market, runner_number, point_ts);

create index if not exists idx_place_live_odds_date
  on public.place_live_odds_points (race_date, track_id, race_number, point_ts);

create table if not exists public.place_live_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  summary_json jsonb,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_place_live_worker_runs_started
  on public.place_live_worker_runs (started_at desc);
