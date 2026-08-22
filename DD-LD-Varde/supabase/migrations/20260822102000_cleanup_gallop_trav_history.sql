begin;

-- ============================================================
-- Historisk korrigering 2026-08-22
--
-- Svenska galopplopp har felaktigt kunnat skapa spel i
-- Travfestens travstrategier.
--
-- Research/gallophistorik, T90 och T1 ska INTE röras.
-- Travstrategiernas evaluations lämnas också kvar som teknisk
-- audit trail. Endast felaktiga modellspel tas bort.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Backup: win/place-modeller
-- Förväntat exakt 80 rader.
-- ------------------------------------------------------------

create table
  public._backup_20260822_gallop_leak_win_place_model_bets
as
select
  b.*
from
  public.win_place_model_bets b
where
  b.rule_version in (
    'WIN_PLACE_V1.0',
    'SMALLKARAMELL_S2_V1.0',
    'BIG_B_MONSTER_V1.0',
    'ENSAMVARGEN_V1.0'
  )
  and exists (
    select
      1
    from
      public.research_races r
    where
      r.sport_type = 'GALLOP'
      and r.race_date::text = b.date
      and r.track_id = b.track_id
      and r.race_number = b.race_number
  );


-- ------------------------------------------------------------
-- 2. Backup: pensionerade PLACE_V2.0
-- Förväntat exakt 11 rader.
--
-- Matchning görs på datum+bana+loppnummer eftersom två äldre
-- Bro Park-rader har ett äldre race_id-format.
-- ------------------------------------------------------------

create table
  public._backup_20260822_gallop_leak_place_model_bets
as
select
  b.*
from
  public.place_model_bets b
where
  b.rule_version = 'PLACE_V2.0'
  and exists (
    select
      1
    from
      public.research_races r
    where
      r.sport_type = 'GALLOP'
      and r.race_date::text = b.date
      and r.track_id = b.track_id
      and r.race_number = b.race_number
  );


-- ------------------------------------------------------------
-- 3. Säkerhetskontroll FÖRE delete.
-- Migrationen avbryts helt om antal inte är exakt rätt.
-- ------------------------------------------------------------

do $$
declare
  win_place_count integer;
  place_count integer;
begin
  select count(*)
  into win_place_count
  from public._backup_20260822_gallop_leak_win_place_model_bets;

  select count(*)
  into place_count
  from public._backup_20260822_gallop_leak_place_model_bets;

  if win_place_count <> 80 then
    raise exception
      'STOPP: förväntade 80 felaktiga win_place-rader, hittade %',
      win_place_count;
  end if;

  if place_count <> 11 then
    raise exception
      'STOPP: förväntade 11 felaktiga place-rader, hittade %',
      place_count;
  end if;
end
$$;


-- ------------------------------------------------------------
-- 4. Ta bort ENDAST de felaktiga galoppspelen.
-- ------------------------------------------------------------

delete from
  public.win_place_model_bets b
where
  b.rule_version in (
    'WIN_PLACE_V1.0',
    'SMALLKARAMELL_S2_V1.0',
    'BIG_B_MONSTER_V1.0',
    'ENSAMVARGEN_V1.0'
  )
  and exists (
    select
      1
    from
      public.research_races r
    where
      r.sport_type = 'GALLOP'
      and r.race_date::text = b.date
      and r.track_id = b.track_id
      and r.race_number = b.race_number
  );


delete from
  public.place_model_bets b
where
  b.rule_version = 'PLACE_V2.0'
  and exists (
    select
      1
    from
      public.research_races r
    where
      r.sport_type = 'GALLOP'
      and r.race_date::text = b.date
      and r.track_id = b.track_id
      and r.race_number = b.race_number
  );


-- ------------------------------------------------------------
-- 5. Säkerhetskontroll EFTER delete.
-- Ska finnas exakt 0 felaktiga spel kvar.
-- ------------------------------------------------------------

do $$
declare
  remaining_win_place integer;
  remaining_place integer;
begin
  select count(*)
  into remaining_win_place
  from public.win_place_model_bets b
  where
    b.rule_version in (
      'WIN_PLACE_V1.0',
      'SMALLKARAMELL_S2_V1.0',
      'BIG_B_MONSTER_V1.0',
      'ENSAMVARGEN_V1.0'
    )
    and exists (
      select
        1
      from
        public.research_races r
      where
        r.sport_type = 'GALLOP'
        and r.race_date::text = b.date
        and r.track_id = b.track_id
        and r.race_number = b.race_number
    );

  select count(*)
  into remaining_place
  from public.place_model_bets b
  where
    b.rule_version = 'PLACE_V2.0'
    and exists (
      select
        1
      from
        public.research_races r
      where
        r.sport_type = 'GALLOP'
        and r.race_date::text = b.date
        and r.track_id = b.track_id
        and r.race_number = b.race_number
    );

  if remaining_win_place <> 0 then
    raise exception
      'STOPP: % felaktiga win_place-rader återstår',
      remaining_win_place;
  end if;

  if remaining_place <> 0 then
    raise exception
      'STOPP: % felaktiga place-rader återstår',
      remaining_place;
  end if;
end
$$;

commit;
