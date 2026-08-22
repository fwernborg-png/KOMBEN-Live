create or replace function public.ddld_insert_snapshot_v1(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round jsonb := p_payload->'round';
  v_snapshot jsonb := p_payload->'snapshot';
  v_snapshot_id uuid;
begin
  if jsonb_typeof(v_round) <> 'object' then
    raise exception 'round payload missing or invalid';
  end if;

  if jsonb_typeof(v_snapshot) <> 'object' then
    raise exception 'snapshot payload missing or invalid';
  end if;

  if nullif(v_round->>'game_id', '') is null then
    raise exception 'game_id is required';
  end if;

  insert into public.ddld_rounds (
    game_id,
    game_type,
    track_name,
    race_one_id,
    race_two_id,
    scheduled_start_time
  )
  values (
    v_round->>'game_id',
    v_round->>'game_type',
    v_round->>'track_name',
    v_round->>'race_one_id',
    v_round->>'race_two_id',
    nullif(v_round->>'scheduled_start_time', '')::timestamptz
  )
  on conflict (game_id) do update
  set
    game_type = excluded.game_type,
    track_name = excluded.track_name,
    race_one_id = excluded.race_one_id,
    race_two_id = excluded.race_two_id,
    scheduled_start_time = excluded.scheduled_start_time;

  insert into public.ddld_snapshots (
    game_id,
    captured_at,
    seconds_to_start,
    model_version,
    capture_reason,
    winner_market_complete_race_one,
    winner_market_complete_race_two,
    active_horses_race_one,
    active_horses_race_two,
    implied_sum_race_one,
    implied_sum_race_two
  )
  values (
    v_round->>'game_id',
    coalesce(
      nullif(v_snapshot->>'captured_at', '')::timestamptz,
      now()
    ),
    nullif(v_snapshot->>'seconds_to_start', '')::integer,
    v_snapshot->>'model_version',
    coalesce(nullif(v_snapshot->>'capture_reason', ''), 'manual'),
    (v_snapshot->>'winner_market_complete_race_one')::boolean,
    (v_snapshot->>'winner_market_complete_race_two')::boolean,
    (v_snapshot->>'active_horses_race_one')::integer,
    (v_snapshot->>'active_horses_race_two')::integer,
    nullif(v_snapshot->>'implied_sum_race_one', '')::double precision,
    nullif(v_snapshot->>'implied_sum_race_two', '')::double precision
  )
  returning id into v_snapshot_id;

  insert into public.ddld_horse_snapshots (
    snapshot_id,
    leg,
    race_id,
    horse_number,
    horse_name,
    winner_odds,
    market_probability,
    bet_share,
    kronor_per_start,
    kronor_rank
  )
  select
    v_snapshot_id,
    (item->>'leg')::smallint,
    item->>'race_id',
    (item->>'horse_number')::integer,
    item->>'horse_name',
    nullif(item->>'winner_odds', '')::double precision,
    nullif(item->>'market_probability', '')::double precision,
    nullif(item->>'bet_share', '')::double precision,
    nullif(item->>'kronor_per_start', '')::double precision,
    nullif(item->>'kronor_rank', '')::integer
  from jsonb_array_elements(
    coalesce(p_payload->'horses', '[]'::jsonb)
  ) as item;

  insert into public.ddld_combo_snapshots (
    snapshot_id,
    first_horse_number,
    second_horse_number,
    double_odds,
    first_market_probability,
    second_market_probability,
    combination_probability,
    fair_odds,
    market_ev_percent,
    first_kronor_rank,
    second_kronor_rank
  )
  select
    v_snapshot_id,
    (item->>'first_horse_number')::integer,
    (item->>'second_horse_number')::integer,
    (item->>'double_odds')::double precision,
    (item->>'first_market_probability')::double precision,
    (item->>'second_market_probability')::double precision,
    (item->>'combination_probability')::double precision,
    (item->>'fair_odds')::double precision,
    (item->>'market_ev_percent')::double precision,
    nullif(item->>'first_kronor_rank', '')::integer,
    nullif(item->>'second_kronor_rank', '')::integer
  from jsonb_array_elements(
    coalesce(p_payload->'combinations', '[]'::jsonb)
  ) as item;

  return v_snapshot_id;
end;
$$;

revoke all on function public.ddld_insert_snapshot_v1(jsonb)
  from public, anon, authenticated;

grant execute on function public.ddld_insert_snapshot_v1(jsonb)
  to service_role;

comment on function public.ddld_insert_snapshot_v1(jsonb) is
  'Atomisk server-side insättning av en DD/LD marknadssnapshot.';;
