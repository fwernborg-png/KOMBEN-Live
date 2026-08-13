-- INTERNATIONAL GALLOP RESEARCH
--
-- Icke-destruktiv utökning av research-arkivet.
-- Ingen befintlig travdata tas bort eller skrivs om.
--
-- Syfte:
-- - kunna skilja trav / galopp
-- - kunna lagra internationella ATG-länder
-- - lagra galoppunderlag
-- - lagra handicap/rating
-- - lagra buren vikt
-- - lagra jockey/rider
--
-- Handicap 0 från ATG ska behandlas som "saknas"
-- i parsern och lagras därför som NULL.

alter table public.research_races
  drop constraint if exists research_races_country_code_check;

alter table public.research_races
  add constraint research_races_country_code_check
  check (
    country_code ~ '^[A-Z]{2}$'
  );

alter table public.research_races
  drop constraint if exists research_races_currency_code_check;

alter table public.research_races
  add constraint research_races_currency_code_check
  check (
    currency_code ~ '^[A-Z]{3}$'
  );

alter table public.research_races
  add column if not exists sport_type text,
  add column if not exists surface text,
  add column if not exists going text,
  add column if not exists is_handicap_race boolean;

alter table public.research_races
  drop constraint if exists research_races_sport_type_check;

alter table public.research_races
  add constraint research_races_sport_type_check
  check (
    sport_type is null
    or sport_type in (
      'TROT',
      'GALLOP',
      'MONTE',
      'UNKNOWN'
    )
  );

create index if not exists idx_research_races_country_sport
  on public.research_races (
    country_code,
    sport_type,
    race_date
  );

create index if not exists idx_research_races_gallop_surface
  on public.research_races (
    sport_type,
    surface,
    distance_meters
  );

alter table public.research_runner_snapshots
  add column if not exists handicap_rating numeric(10,3),
  add column if not exists carried_weight_kg numeric(10,3),
  add column if not exists rider_id bigint,
  add column if not exists rider_name text;

create index if not exists idx_research_runner_handicap
  on public.research_runner_snapshots (
    race_key,
    handicap_rating
  );

comment on column public.research_races.sport_type is
  'Normaliserad sport: TROT, GALLOP, MONTE eller UNKNOWN.';

comment on column public.research_races.surface is
  'Underlag från ATG, exempelvis turf eller dirt.';

comment on column public.research_races.going is
  'Ban-/markförhållande när källan tillhandahåller det.';

comment on column public.research_races.is_handicap_race is
  'TRUE endast när loppet uttryckligen kan identifieras som handicap. NULL betyder okänt.';

comment on column public.research_runner_snapshots.handicap_rating is
  'Officiellt handicap/ratingtal från ATG. ATG-värdet 0 behandlas som saknad uppgift.';

comment on column public.research_runner_snapshots.carried_weight_kg is
  'Buren vikt normaliserad till kilogram. Råvärdet finns kvar i raw_runner_json.';

comment on column public.research_runner_snapshots.rider_id is
  'Jockey/rider-id från ATG när tillgängligt.';

comment on column public.research_runner_snapshots.rider_name is
  'Jockey/rider-namn från ATG när tillgängligt.';

-- ---------------------------------------------------------
-- BACKFILL AV SPORTTYP FÖR BEFINTLIG HISTORIK
-- ---------------------------------------------------------
--
-- Forskningsarkivet före denna migration innehåller främst
-- svensk racing och saknar sport_type.
--
-- De tre svenska galoppbanorna identifieras uttryckligen.
-- Monté hålls separat.
-- Resterande tidigare svenska arkivdata klassas som trav.
--
-- Ingen rad tas bort.

update public.research_races
set sport_type =
  case
    when is_monte = true
      then 'MONTE'

    when lower(trim(track_name)) in (
      lower('Bro Park'),
      lower('Jägersro Galopp'),
      lower('Göteborg Galopp')
    )
      then 'GALLOP'

    else 'TROT'
  end
where sport_type is null;
