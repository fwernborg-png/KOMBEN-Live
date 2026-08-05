-- Generalisera T-90-utvärderingarna så samma stabila pipeline kan bära
-- både den befintliga mest-sänkta-regeln och Smällkaramellen (S2).

alter table public.win_place_race_evaluations
  add column if not exists strategy_code text;

alter table public.win_place_race_evaluations
  add column if not exists candidate_json jsonb;

update public.win_place_race_evaluations
set
  strategy_code = coalesce(
    strategy_code,
    'MOST_SHORTENED_WIN_PLACE'
  ),
  candidate_json = coalesce(
    candidate_json,
    most_shortened_json
  )
where
  strategy_code is null
  or candidate_json is null;

alter table public.win_place_race_evaluations
  alter column strategy_code
  set default 'MOST_SHORTENED_WIN_PLACE';

alter table public.win_place_race_evaluations
  alter column strategy_code
  set not null;

create index if not exists
  idx_win_place_evaluations_strategy
on public.win_place_race_evaluations (
  strategy_code,
  rule_version,
  signal_phase,
  locked_at desc
);

comment on column
  public.win_place_race_evaluations.candidate_json
is
  'Den häst som den aktuella regelversionen faktiskt valde. För Smällkaramellen är detta S2.';
