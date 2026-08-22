create extension if not exists pgcrypto;

create table if not exists public.ddld_rounds (
  game_id text primary key,
  game_type text not null check (game_type in ('DD', 'LD')),
  track_name text not null,
  race_one_id text not null,
  race_two_id text not null,
  scheduled_start_time timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ddld_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.ddld_rounds(game_id) on delete cascade,
  captured_at timestamptz not null default now(),
  seconds_to_start integer,
  model_version text not null,
  capture_reason text not null default 'manual',
  winner_market_complete_race_one boolean not null,
  winner_market_complete_race_two boolean not null,
  active_horses_race_one integer not null check (active_horses_race_one >= 0),
  active_horses_race_two integer not null check (active_horses_race_two >= 0),
  implied_sum_race_one double precision,
  implied_sum_race_two double precision,
  created_at timestamptz not null default now(),
  unique (game_id, captured_at)
);

create index if not exists idx_ddld_snapshots_game_time
  on public.ddld_snapshots (game_id, captured_at);

create table if not exists public.ddld_horse_snapshots (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.ddld_snapshots(id) on delete cascade,
  leg smallint not null check (leg in (1, 2)),
  race_id text not null,
  horse_number integer not null check (horse_number > 0),
  horse_name text not null,
  winner_odds double precision check (winner_odds is null or winner_odds > 1),
  market_probability double precision check (
    market_probability is null or (market_probability >= 0 and market_probability <= 1)
  ),
  bet_share double precision check (
    bet_share is null or (bet_share >= 0 and bet_share <= 100)
  ),
  kronor_per_start double precision check (
    kronor_per_start is null or kronor_per_start >= 0
  ),
  kronor_rank integer check (
    kronor_rank is null or kronor_rank > 0
  ),
  created_at timestamptz not null default now(),
  unique (snapshot_id, leg, horse_number)
);

create index if not exists idx_ddld_horse_snapshot_lookup
  on public.ddld_horse_snapshots (snapshot_id, leg, horse_number);

create table if not exists public.ddld_combo_snapshots (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.ddld_snapshots(id) on delete cascade,
  first_horse_number integer not null check (first_horse_number > 0),
  second_horse_number integer not null check (second_horse_number > 0),
  double_odds double precision not null check (double_odds > 0),
  first_market_probability double precision not null check (
    first_market_probability >= 0 and first_market_probability <= 1
  ),
  second_market_probability double precision not null check (
    second_market_probability >= 0 and second_market_probability <= 1
  ),
  combination_probability double precision not null check (
    combination_probability >= 0 and combination_probability <= 1
  ),
  fair_odds double precision not null check (fair_odds > 0),
  market_ev_percent double precision not null,
  first_kronor_rank integer check (
    first_kronor_rank is null or first_kronor_rank > 0
  ),
  second_kronor_rank integer check (
    second_kronor_rank is null or second_kronor_rank > 0
  ),
  created_at timestamptz not null default now(),
  unique (snapshot_id, first_horse_number, second_horse_number)
);

create index if not exists idx_ddld_combo_snapshot_ev
  on public.ddld_combo_snapshots (snapshot_id, market_ev_percent);

create index if not exists idx_ddld_combo_ev
  on public.ddld_combo_snapshots (market_ev_percent);

alter table public.ddld_rounds enable row level security;
alter table public.ddld_snapshots enable row level security;
alter table public.ddld_horse_snapshots enable row level security;
alter table public.ddld_combo_snapshots enable row level security;

comment on table public.ddld_rounds is 'En rad per DD/LD-omgång.';
comment on table public.ddld_snapshots is 'Marknadsobservation med tid till start och datakvalitet.';
comment on table public.ddld_horse_snapshots is 'Vinnarodds och marknadsdata per aktiv häst vid snapshot.';
comment on table public.ddld_combo_snapshots is 'Alla tillgängliga DD/LD-kombinationer vid snapshot.';;
