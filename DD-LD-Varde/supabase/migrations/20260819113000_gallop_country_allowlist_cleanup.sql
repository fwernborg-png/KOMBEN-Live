-- GALLOP COUNTRY ALLOWLIST CLEANUP
--
-- Tar bort redan insamlad galopp utanför:
-- Sverige, Danmark, Norge och Sydafrika.
--
-- Trav påverkas inte.
--
-- Förhandskontroll 2026-08-19:
-- CA: 25 lopp
-- FR:  9 lopp
-- GB: 20 lopp
-- Totalt: 54 lopp och 11 101 lagrade rader.

begin;


-- Avbryt innan radering om någon tabell som refererar
-- research_races inte använder ON DELETE CASCADE.

do $$
declare
  v_unsafe_foreign_keys text;
begin
  select string_agg(
    format(
      '%s via %I',
      constraint_row.conrelid::regclass,
      constraint_row.conname
    ),
    ', '
    order by
      constraint_row.conrelid::regclass::text,
      constraint_row.conname
  )
  into v_unsafe_foreign_keys
  from pg_constraint constraint_row
  where constraint_row.contype = 'f'
    and constraint_row.confrelid =
        'public.research_races'::regclass
    and constraint_row.confdeltype <> 'c';

  if v_unsafe_foreign_keys is not null then
    raise exception
      'Rensningen stoppades. Följande relationer saknar ON DELETE CASCADE: %',
      v_unsafe_foreign_keys;
  end if;
end;
$$;


-- Radera endast galopp från länder utanför vitlistan.
-- Alla tillhörande odds, snapshots, mätvärden och
-- resultat tas bort genom ON DELETE CASCADE.

do $$
declare
  v_deleted_races bigint;
begin
  delete from public.research_races race
  where upper(
          trim(
            coalesce(
              race.sport_type,
              ''
            )
          )
        ) = 'GALLOP'
    and coalesce(
          nullif(
            upper(
              trim(
                race.country_code
              )
            ),
            ''
          ),
          'SAKNAS'
        ) not in (
          'SE',
          'DK',
          'NO',
          'ZA'
        );

  get diagnostics
    v_deleted_races = row_count;

  raise notice
    'Raderade % otillåtna galopplopp.',
    v_deleted_races;
end;
$$;


-- Databasskydd: förhindra att otillåten galopp
-- kan lagras igen, även om ett framtida kodfel
-- skulle släppa igenom loppet.

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid =
          'public.research_races'::regclass
      and constraint_row.conname =
          'research_races_gallop_country_allowlist_check'
  ) then
    alter table public.research_races
      add constraint
        research_races_gallop_country_allowlist_check
      check (
        upper(
          trim(
            coalesce(
              sport_type,
              ''
            )
          )
        ) <> 'GALLOP'
        or upper(
          trim(
            coalesce(
              country_code,
              ''
            )
          )
        ) in (
          'SE',
          'DK',
          'NO',
          'ZA'
        )
      )
      not valid;
  end if;
end;
$$;


alter table public.research_races
  validate constraint
    research_races_gallop_country_allowlist_check;


-- Slutkontroll. Ett fel här rullar tillbaka hela migreringen.

do $$
begin
  if exists (
    select 1
    from public.research_races race
    where upper(
            trim(
              coalesce(
                race.sport_type,
                ''
              )
            )
          ) = 'GALLOP'
      and upper(
            trim(
              coalesce(
                race.country_code,
                ''
              )
            )
          ) not in (
            'SE',
            'DK',
            'NO',
            'ZA'
          )
  ) then
    raise exception
      'Rensningen misslyckades: otillåten galopp finns fortfarande kvar.';
  end if;
end;
$$;


commit;
