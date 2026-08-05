import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildResearchPairFinalOddsDbRows,
  buildResearchPairFinalOddsKey,
  RESEARCH_PAIR_FINAL_ODDS_COLLECTOR_VERSION,
} from "./researchPairFinalOddsPersistence";

describe(
  "researchPairFinalOddsPersistence",
  () => {
    it(
      "bygger stabil unik nyckel",
      () => {
        expect(
          buildResearchPairFinalOddsKey({
            raceKey:
              "ATG:2026-07-21:15:1:123",

            market:
              "TVILLING",

            firstRunnerNumber: 5,
            secondRunnerNumber: 7,
          }),
        ).toBe(
          [
            "ATG:2026-07-21:15:1:123",
            "PAIR_FINAL_ODDS",
            "TVILLING",
            "5",
            "7",
          ].join(":"),
        );
      },
    );

    it(
      "bygger kompletta databasrader",
      () => {
        const rows =
          buildResearchPairFinalOddsDbRows({
            raceKey:
              "ATG:2026-07-21:15:1:123",

            fetchedAt:
              "2026-08-04T22:00:00.000Z",

            rows: [
              {
                market:
                  "TVILLING",

                firstRunnerNumber: 5,
                secondRunnerNumber: 7,

                finalOddsDecimal: 4.25,

                isWinningPair: true,

                officialPayoutDecimal:
                  4.25,

                sourceGameId:
                  "tvilling_2026-07-21_15_1",

                sourceStatus:
                  "results",

                sourceTimestamp:
                  "2026-07-21T18:00:00.000Z",
              },
            ],
          });

        expect(rows).toEqual([
          {
            pair_odds_key:
              [
                "ATG:2026-07-21:15:1:123",
                "PAIR_FINAL_ODDS",
                "TVILLING",
                "5",
                "7",
              ].join(":"),

            race_key:
              "ATG:2026-07-21:15:1:123",

            market:
              "TVILLING",

            first_runner_number: 5,
            second_runner_number: 7,

            final_odds_decimal: 4.25,

            is_winning_pair: true,

            official_payout_decimal:
              4.25,

            source_game_id:
              "tvilling_2026-07-21_15_1",

            source_status:
              "results",

            source_timestamp:
              "2026-07-21T18:00:00.000Z",

            source_provider:
              "ATG",

            fetched_at:
              "2026-08-04T22:00:00.000Z",

            collector_version:
              RESEARCH_PAIR_FINAL_ODDS_COLLECTOR_VERSION,

            updated_at:
              "2026-08-04T22:00:00.000Z",
          },
        ]);
      },
    );

    it(
      "behåller Komb-riktningarna separata",
      () => {
        const rows =
          buildResearchPairFinalOddsDbRows({
            raceKey:
              "RACE-1",

            fetchedAt:
              "2026-08-04T22:00:00.000Z",

            rows: [
              {
                market: "KOMB",

                firstRunnerNumber: 5,
                secondRunnerNumber: 7,

                finalOddsDecimal: 6.65,

                isWinningPair: true,
                officialPayoutDecimal:
                  6.65,

                sourceGameId: null,
                sourceStatus: "results",
                sourceTimestamp: null,
              },
              {
                market: "KOMB",

                firstRunnerNumber: 7,
                secondRunnerNumber: 5,

                finalOddsDecimal: 9.8,

                isWinningPair: false,
                officialPayoutDecimal:
                  null,

                sourceGameId: null,
                sourceStatus: "results",
                sourceTimestamp: null,
              },
            ],
          });

        expect(rows).toHaveLength(2);

        expect(
          rows[0].pair_odds_key,
        ).not.toBe(
          rows[1].pair_odds_key,
        );

        expect(
          rows.map((row) => [
            row.first_runner_number,
            row.second_runner_number,
          ]),
        ).toEqual([
          [5, 7],
          [7, 5],
        ]);
      },
    );
  },
);
