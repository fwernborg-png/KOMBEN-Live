-- DIAMANTEN V1.0 – AUTOSTART CLEANUP
--
-- Diamanten gäller endast autostart.
-- Rådata/research-races rörs inte.
-- Endast felaktiga VOLT-evalueringar och VOLT-spel
-- för Diamanten tas bort.

begin;

delete from public.win_place_model_bets
where rule_version = 'DIAMANTEN_V1.0'
  and signal_phase = 'LIVE'
  and start_method = 'VOLT';

delete from public.win_place_race_evaluations
where rule_version = 'DIAMANTEN_V1.0'
  and signal_phase = 'LIVE'
  and upper(
    coalesce(
      race_json ->> 'startMethod',
      ''
    )
  ) = 'VOLT';

commit;
