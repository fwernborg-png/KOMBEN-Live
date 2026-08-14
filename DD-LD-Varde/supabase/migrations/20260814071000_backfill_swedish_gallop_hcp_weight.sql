-- BACKFILL SWEDISH GALLOP HANDICAP + CARRIED WEIGHT
--
-- Fyller endast äldre svenska galopp-LOCK-snapshots där
-- de nya strukturerade fälten fortfarande är NULL.
--
-- Befintliga handicap_rating / carried_weight_kg skrivs aldrig över.
-- ATG handicap 0 behandlas fortsatt som saknad uppgift.
-- Vikt i rådata är normalt gramliknande tusendelar:
-- 60000 -> 60.0 kg, 57500 -> 57.5 kg.
--
-- Ingen travdata eller utländsk data berörs.

update public.research_runner_snapshots as runner
set
  handicap_rating =
    coalesce(
      runner.handicap_rating,
      case
        when
          trim(
            runner.raw_runner_json #>> '{horse,handicap}'
          ) ~ '^[0-9]+([.][0-9]+)?$'
        then
          case
            when (
              trim(
                runner.raw_runner_json #>> '{horse,handicap}'
              )
            )::numeric > 0
            then (
              trim(
                runner.raw_runner_json #>> '{horse,handicap}'
              )
            )::numeric
            else null
          end
        else null
      end
    ),

  carried_weight_kg =
    coalesce(
      runner.carried_weight_kg,
      case
        when
          trim(
            runner.raw_runner_json ->> 'weight'
          ) ~ '^[0-9]+([.][0-9]+)?$'
        then
          case
            when (
              trim(
                runner.raw_runner_json ->> 'weight'
              )
            )::numeric
              between 30000 and 100000
            then (
              trim(
                runner.raw_runner_json ->> 'weight'
              )
            )::numeric / 1000.0

            when (
              trim(
                runner.raw_runner_json ->> 'weight'
              )
            )::numeric
              between 30 and 100
            then (
              trim(
                runner.raw_runner_json ->> 'weight'
              )
            )::numeric

            else null
          end
        else null
      end
    ),

  updated_at = now()

from
  public.research_race_snapshots as snapshot,
  public.research_races as race

where
  runner.snapshot_key =
    snapshot.snapshot_key

  and race.race_key =
    runner.race_key

  and race.country_code = 'SE'
  and race.sport_type = 'GALLOP'

  and snapshot.signal_phase = 'LIVE'
  and snapshot.capture_type = 'LOCK'

  and (
    (
      runner.handicap_rating is null

      and case
        when
          trim(
            runner.raw_runner_json #>> '{horse,handicap}'
          ) ~ '^[0-9]+([.][0-9]+)?$'
        then (
          trim(
            runner.raw_runner_json #>> '{horse,handicap}'
          )
        )::numeric > 0
        else false
      end
    )

    or

    (
      runner.carried_weight_kg is null

      and case
        when
          trim(
            runner.raw_runner_json ->> 'weight'
          ) ~ '^[0-9]+([.][0-9]+)?$'
        then (
          (
            trim(
              runner.raw_runner_json ->> 'weight'
            )
          )::numeric between 30000 and 100000

          or

          (
            trim(
              runner.raw_runner_json ->> 'weight'
            )
          )::numeric between 30 and 100
        )
        else false
      end
    )
  );
