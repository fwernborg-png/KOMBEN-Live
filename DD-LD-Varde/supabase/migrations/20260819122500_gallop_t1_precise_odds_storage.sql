-- GALLOP T1 PRECISE ODDS STORAGE
--
-- Forskningsdata för svenska galopplopp.
-- Exakta WIN-odds samlas vid hel- och halvminut
-- under loppets sista minuter.
--
-- Tabellen används inte av trav, T90 eller någon
-- aktiv spelmodell.

begin;

create table public.gallop_t1_odds_points (
  id uuid primary key default gen_random_uuid(),

  race_id text not null,
  race_date text not null,

  track_id int not null,
  track_name text not null,
  race_number int not null,

  runner_number int not null,
  horse_id bigint,
  horse_name text not null,

  market text not null
    check (market = 'WIN'),

  odds_decimal numeric(10,4) not null,

  point_ts timestamptz not null,

  planned_start_time_at_capture
    timestamptz not null,

  source text not null
    check (
      source in (
        'ATG_T1_MINUTE',
        'ATG_T1_HALF_MINUTE'
      )
    ),

  created_at timestamptz not null
    default now(),

  unique (
    race_id,
    runner_number,
    market,
    point_ts
  )
);

create index
  idx_gallop_t1_odds_lookup
on public.gallop_t1_odds_points (
  race_id,
  market,
  runner_number,
  point_ts
);

create index
  idx_gallop_t1_odds_date
on public.gallop_t1_odds_points (
  race_date,
  track_id,
  race_number,
  point_ts
);

alter table
  public.gallop_t1_odds_points
enable row level security;

revoke all
on table public.gallop_t1_odds_points
from anon, authenticated;

grant
  select,
  insert,
  update,
  delete
on table public.gallop_t1_odds_points
to service_role;

comment on table
  public.gallop_t1_odds_points
is
  'Collector-only exact WIN odds for Swedish gallop research. No live decisions and no T90 or trot consumers.';

commit;
