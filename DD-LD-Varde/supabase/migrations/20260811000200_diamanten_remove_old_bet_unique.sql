-- DIAMANTEN V1.0 – steg 2
--
-- Körs först efter att workern som använder horse_number
-- i onConflict är deployad.

alter table public.win_place_model_bets
  drop constraint if exists
  win_place_model_bets_race_id_rule_version_market_signal_pha_key;
