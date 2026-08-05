-- Slutliga Tvilling- och Kombodds för forskningsarkivet.
--
-- En rad per lopp, marknad och par.
--
-- TVILLING:
--   Ordningen saknar betydelse.
--   Lägsta startnummer sparas alltid först.
--
-- KOMB:
--   Ordningen är betydelsefull.
--   5-7 och 7-5 sparas som separata rader.

create table if not exists
  public.research_pair_final_odds
(
  pair_odds_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  market text not null
    check (
      market in (
        'TVILLING',
        'KOMB'
      )
    ),

  first_runner_number int not null,
  second_runner_number int not null,

  final_odds_decimal numeric(14,4) not null
    check (final_odds_decimal > 0),

  is_winning_pair boolean not null
    default false,

  official_payout_decimal numeric(14,4)
    check (
      official_payout_decimal is null
      or official_payout_decimal > 0
    ),

  source_game_id text,
  source_status text,
  source_timestamp timestamptz,

  source_provider text not null
    default 'ATG',

  fetched_at timestamptz not null,
  collector_version text not null,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  check (
    first_runner_number > 0
    and second_runner_number > 0
    and first_runner_number
      <> second_runner_number
  ),

  check (
    market <> 'TVILLING'
    or first_runner_number
      < second_runner_number
  ),

  unique (
    race_key,
    market,
    first_runner_number,
    second_runner_number
  )
);

create index if not exists
  idx_research_pair_final_odds_race
on public.research_pair_final_odds (
  race_key,
  market
);

create index if not exists
  idx_research_pair_final_odds_winners
on public.research_pair_final_odds (
  market,
  is_winning_pair,
  race_key
);

create index if not exists
  idx_research_pair_final_odds_pair
on public.research_pair_final_odds (
  market,
  first_runner_number,
  second_runner_number
);

alter table
  public.research_pair_final_odds
enable row level security;

comment on table
  public.research_pair_final_odds
is
  'ATG:s slutliga Tvilling- och Kombodds för samtliga arkiverade par.';

comment on column
  public.research_pair_final_odds.final_odds_decimal
is
  'Slutoddset från ATG:s comboOdds-matris.';

comment on column
  public.research_pair_final_odds.official_payout_decimal
is
  'ATG:s officiella utdelning för det vinnande paret.';


-- Intern hämtstatus per lopp och marknad.
-- Gör backfillen återstartbar och förhindrar onödiga återhämtningar.

create table if not exists
  public.research_pair_market_fetches
(
  fetch_key text primary key,

  race_key text not null
    references public.research_races(race_key)
    on delete cascade,

  market text not null
    check (
      market in (
        'TVILLING',
        'KOMB'
      )
    ),

  fetch_status text not null
    check (
      fetch_status in (
        'COMPLETE',
        'MISSING',
        'RETRY',
        'FAILED'
      )
    ),

  source_game_id text,
  source_status text,

  http_status int,
  rows_archived int not null
    default 0,

  attempt_count int not null
    default 0,

  last_error text,

  first_attempt_at timestamptz not null
    default now(),

  last_attempt_at timestamptz not null,
  completed_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (
    race_key,
    market
  )
);

create index if not exists
  idx_research_pair_market_fetches_status
on public.research_pair_market_fetches (
  fetch_status,
  last_attempt_at,
  race_key
);

create index if not exists
  idx_research_pair_market_fetches_race
on public.research_pair_market_fetches (
  race_key,
  market
);

alter table
  public.research_pair_market_fetches
enable row level security;

comment on table
  public.research_pair_market_fetches
is
  'Hämtstatus för slutliga Tvilling- och Kombodds per arkiverat lopp.';
