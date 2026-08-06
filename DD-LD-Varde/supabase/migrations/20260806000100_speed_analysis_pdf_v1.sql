-- SPEEDANALYSEN PDF V1
--
-- Separat datalager för V85/V86.
-- PDF-filen lagras inte.
-- Ordinarie styrkefaktorer KR/ST/K/SP/G/ODD påverkas inte.


create extension if not exists pgcrypto;


create table if not exists public.speed_analysis_imports (
  id uuid primary key
    default gen_random_uuid(),

  race_date date not null,

  track_name text not null,
  track_key text not null,

  product text not null
    check (
      product in (
        'V85',
        'V86'
      )
    ),

  source_filename text not null,

  page_count integer not null
    check (
      page_count > 0
    ),

  parsed_runner_count integer not null
    check (
      parsed_runner_count >= 0
    ),

  imported_at timestamptz not null
    default now(),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (
    race_date,
    track_key,
    product
  )
);


create table if not exists public.speed_analysis_runners (
  id uuid primary key
    default gen_random_uuid(),

  import_id uuid not null
    references public.speed_analysis_imports(id)
    on delete cascade,

  race_date date not null,

  track_name text not null,
  track_key text not null,

  product text not null
    check (
      product in (
        'V85',
        'V86'
      )
    ),

  leg_number integer not null
    check (
      leg_number between 1 and 8
    ),

  runner_number integer not null
    check (
      runner_number between 1 and 20
    ),

  horse_name text not null,
  normalized_horse_name text not null,

  spets_text text not null
    default '',

  bot_text text not null
    default '',

  s1000_text text not null
    default '',

  s500_text text not null
    default '',

  bot_color text not null
    default 'NONE'
    check (
      bot_color in (
        'GREEN',
        'YELLOW',
        'RED',
        'NONE'
      )
    ),

  s1000_color text not null
    default 'NONE'
    check (
      s1000_color in (
        'GREEN',
        'YELLOW',
        'RED',
        'NONE'
      )
    ),

  s500_color text not null
    default 'NONE'
    check (
      s500_color in (
        'GREEN',
        'YELLOW',
        'RED',
        'NONE'
      )
    ),

  probable_leader boolean not null
    default false,

  own_probable_leader boolean not null
    default false,

  rank_position integer null
    check (
      rank_position is null
      or rank_position between 1 and 20
    ),

  rank_text text not null
    default '',

  source_page integer not null
    check (
      source_page > 0
    ),

  source_filename text not null,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (
    import_id,
    leg_number,
    runner_number
  )
);


create index if not exists
  speed_analysis_runners_date_track_idx
on public.speed_analysis_runners (
  race_date,
  track_key
);


create index if not exists
  speed_analysis_runners_horse_idx
on public.speed_analysis_runners (
  normalized_horse_name,
  runner_number
);


create unique index if not exists
  speed_analysis_one_own_leader_per_leg_idx
on public.speed_analysis_runners (
  import_id,
  leg_number
)
where own_probable_leader;


alter table
  public.speed_analysis_imports
enable row level security;


alter table
  public.speed_analysis_runners
enable row level security;


drop policy if exists
  "Authenticated Speedanalysen imports"
on public.speed_analysis_imports;


create policy
  "Authenticated Speedanalysen imports"
on public.speed_analysis_imports
for all
to authenticated
using (true)
with check (true);


drop policy if exists
  "Authenticated Speedanalysen runners"
on public.speed_analysis_runners;


create policy
  "Authenticated Speedanalysen runners"
on public.speed_analysis_runners
for all
to authenticated
using (true)
with check (true);


grant
  select,
  insert,
  update,
  delete
on public.speed_analysis_imports
to authenticated;


grant
  select,
  insert,
  update,
  delete
on public.speed_analysis_runners
to authenticated;


create or replace function public.replace_speed_analysis_import(
  p_race_date date,
  p_track_name text,
  p_track_key text,
  p_product text,
  p_source_filename text,
  p_page_count integer,
  p_runners jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import_id uuid;
  v_runner_count integer;
begin
  if p_product not in (
    'V85',
    'V86'
  ) then
    raise exception
      'Ogiltig produkt: %',
      p_product;
  end if;

  if p_race_date is null then
    raise exception
      'Datum saknas';
  end if;

  if nullif(
    trim(p_track_name),
    ''
  ) is null then
    raise exception
      'Bana saknas';
  end if;

  if jsonb_typeof(
    p_runners
  ) <> 'array' then
    raise exception
      'Hästrader måste vara en JSON-array';
  end if;

  v_runner_count :=
    jsonb_array_length(
      p_runners
    );

  if v_runner_count < 40 then
    raise exception
      'För få hästar: %',
      v_runner_count;
  end if;

  insert into public.speed_analysis_imports (
    race_date,
    track_name,
    track_key,
    product,
    source_filename,
    page_count,
    parsed_runner_count,
    imported_at,
    updated_at
  )
  values (
    p_race_date,
    trim(p_track_name),
    trim(p_track_key),
    p_product,
    p_source_filename,
    p_page_count,
    v_runner_count,
    now(),
    now()
  )
  on conflict (
    race_date,
    track_key,
    product
  )
  do update set
    track_name =
      excluded.track_name,

    source_filename =
      excluded.source_filename,

    page_count =
      excluded.page_count,

    parsed_runner_count =
      excluded.parsed_runner_count,

    imported_at =
      now(),

    updated_at =
      now()
  returning id
  into v_import_id;

  delete from
    public.speed_analysis_runners
  where import_id =
    v_import_id;

  insert into public.speed_analysis_runners (
    import_id,

    race_date,

    track_name,
    track_key,

    product,

    leg_number,
    runner_number,

    horse_name,
    normalized_horse_name,

    spets_text,

    bot_text,
    s1000_text,
    s500_text,

    bot_color,
    s1000_color,
    s500_color,

    probable_leader,
    own_probable_leader,

    rank_position,
    rank_text,

    source_page,
    source_filename,

    created_at,
    updated_at
  )
  select
    v_import_id,

    p_race_date,

    trim(p_track_name),
    trim(p_track_key),

    p_product,

    (
      runner ->
      'leg_number'
    )::text::integer,

    (
      runner ->
      'runner_number'
    )::text::integer,

    coalesce(
      runner ->> 'horse_name',
      ''
    ),

    coalesce(
      runner ->> 'normalized_horse_name',
      ''
    ),

    coalesce(
      runner ->> 'spets_text',
      ''
    ),

    coalesce(
      runner ->> 'bot_text',
      ''
    ),

    coalesce(
      runner ->> 's1000_text',
      ''
    ),

    coalesce(
      runner ->> 's500_text',
      ''
    ),

    coalesce(
      runner ->> 'bot_color',
      'NONE'
    ),

    coalesce(
      runner ->> 's1000_color',
      'NONE'
    ),

    coalesce(
      runner ->> 's500_color',
      'NONE'
    ),

    coalesce(
      (
        runner ->
        'probable_leader'
      )::text::boolean,
      false
    ),

    coalesce(
      (
        runner ->
        'own_probable_leader'
      )::text::boolean,
      false
    ),

    case
      when runner ? 'rank_position'
        and runner ->
          'rank_position'
          <> 'null'::jsonb
      then (
        runner ->
        'rank_position'
      )::text::integer
      else null
    end,

    coalesce(
      runner ->> 'rank_text',
      ''
    ),

    (
      runner ->
      'source_page'
    )::text::integer,

    p_source_filename,

    now(),
    now()
  from jsonb_array_elements(
    p_runners
  ) as runner;

  return v_import_id;
end;
$$;


grant execute
on function public.replace_speed_analysis_import(
  date,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
to authenticated;


notify pgrst, 'reload schema';
