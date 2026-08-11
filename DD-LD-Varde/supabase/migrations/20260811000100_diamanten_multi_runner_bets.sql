-- DIAMANTEN V1.0 – steg 1
--
-- Lägg till den nya unikheten först.
-- Den gamla fyrdelade unikheten ligger kvar tills
-- den nya workern är deployad.

alter table public.win_place_model_bets
  add constraint
  win_place_model_bets_race_rule_market_phase_horse_key
  unique (
    race_id,
    rule_version,
    market,
    signal_phase,
    horse_number
  );
