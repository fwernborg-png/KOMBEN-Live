import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseGallopHistoryRow,
} from "./gallopRepository";

describe(
  "gallop history row parsing",
  () => {
    it(
      "parses international handicap and weight data",
      () => {
        const row =
          parseGallopHistoryRow({
            race_key:
              "ATG:2026-08-13:89:2",

            race_date:
              "2026-08-13",

            country_code:
              "ZA",

            track_name:
              "Vaal",

            race_number:
              2,

            race_name:
              "Test Handicap",

            surface:
              "turf",

            distance_meters:
              1000,

            starters:
              9,

            selection_kind:
              "S2",

            runner_number:
              4,

            horse_name:
              "Example Horse",

            handicap_rating:
              72,

            handicap_rank:
              2,

            handicap_delta_from_top:
              3,

            carried_weight_kg:
              59.5,

            weight_rank:
              1,

            rider_id:
              777,

            rider_name:
              "Test Rider",

            strength_total:
              null,

            start_odds:
              8,

            lock_odds:
              5.5,

            odds_drop_to_lock_percent:
              31.25,

            valid_odds_points:
              12,

            started:
              true,

            scratched_after_lock:
              false,

            bet_void:
              false,

            finish_position_official:
              2,

            winner_official:
              false,

            placed_official:
              true,

            official_win_odds_decimal:
              null,

            official_place_odds_decimal:
              2.1,

            result_status:
              "OFFICIAL",

            metric_quality_status:
              "PARTIAL",

            indicator_data_complete:
              false,

            odds_data_complete:
              true,
          });

        expect(row)
          .not.toBeNull();

        expect(
          row?.countryCode,
        ).toBe("ZA");

        expect(
          row?.gallopSelection,
        ).toBe("S2");

        expect(
          row?.handicapRating,
        ).toBe(72);

        expect(
          row?.handicapRank,
        ).toBe(2);

        expect(
          row?.handicapDeltaFromTop,
        ).toBe(3);

        expect(
          row?.carriedWeightKg,
        ).toBe(59.5);

        expect(
          row?.riderName,
        ).toBe(
          "Test Rider",
        );

        expect(
          row?.placedOfficial,
        ).toBe(true);

        expect(
          row?.strengthTotal,
        ).toBeNull();
      },
    );
  },
);
