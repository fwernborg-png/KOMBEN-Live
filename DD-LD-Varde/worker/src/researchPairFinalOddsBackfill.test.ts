import {
  describe,
  expect,
  it,
} from "vitest";

import {
  runResearchPairFinalOddsBackfill,
  type ResearchPairFinalOddsBackfillAdapter,
  type ResearchPairMarketFetchDbRow,
} from "./researchPairFinalOddsBackfill";

import type {
  ResearchPairFinalOddsDbRow,
} from "./researchPairFinalOddsPersistence";

function createAdapter(
  args: {
    httpStatus: number;
    payload: unknown;
  },
) {
  const oddsRows:
    ResearchPairFinalOddsDbRow[] = [];

  const states:
    ResearchPairMarketFetchDbRow[] = [];

  const adapter:
    ResearchPairFinalOddsBackfillAdapter = {
      async loadPendingItems() {
        return [
          {
            race: {
              raceKey:
                "ATG:2026-07-21:15:1:RACE-1",

              raceDate:
                "2026-07-21",

              trackId: 15,
              raceNumber: 1,
            },

            market:
              "TVILLING",

            attemptCount: 0,
          },
        ];
      },

      async fetchGame() {
        return {
          httpStatus:
            args.httpStatus,

          payload:
            args.payload,
        };
      },

      async persistOdds(rows) {
        oddsRows.push(...rows);
      },

      async persistFetchState(row) {
        states.push(row);
      },
    };

  return {
    adapter,
    oddsRows,
    states,
  };
}

describe(
  "runResearchPairFinalOddsBackfill",
  () => {
    it(
      "arkiverar komplett historisk marknad",
      async () => {
        const context =
          createAdapter({
            httpStatus: 200,

            payload: {
              id:
                "tvilling_2026-07-21_15_1",

              status: "results",

              pools: {
                tvilling: {
                  status: "results",

                  comboOdds: [
                    [],
                    [425],
                  ],
                },
              },

              races: [
                {
                  pools: {
                    tvilling: {
                      result: {
                        winners: [
                          {
                            combination:
                              [1, 2],

                            odds: 425,
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          });

        const summary =
          await runResearchPairFinalOddsBackfill({
            enabled: true,

            adapter:
              context.adapter,

            nowIso:
              "2026-08-05T00:00:00.000Z",

            maxRaces: 1,
          });

        expect(summary).toMatchObject({
          itemsSelected: 1,
          fetchesAttempted: 1,

          marketsCompleted: 1,
          marketsMissing: 0,
          marketsRetrying: 0,
          marketsFailed: 0,

          oddsRowsArchived: 1,
        });

        expect(
          context.oddsRows,
        ).toHaveLength(1);

        expect(
          context.oddsRows[0],
        ).toMatchObject({
          market: "TVILLING",

          first_runner_number: 1,
          second_runner_number: 2,

          final_odds_decimal: 4.25,

          is_winning_pair: true,

          official_payout_decimal:
            4.25,
        });

        expect(
          context.states[0],
        ).toMatchObject({
          fetch_status:
            "COMPLETE",

          source_game_id:
            "tvilling_2026-07-21_15_1",

          rows_archived: 1,

          attempt_count: 1,
        });
      },
    );

    it(
      "markerar 404 som saknad marknad",
      async () => {
        const context =
          createAdapter({
            httpStatus: 404,
            payload: {},
          });

        const summary =
          await runResearchPairFinalOddsBackfill({
            enabled: true,

            adapter:
              context.adapter,

            nowIso:
              "2026-08-05T00:00:00.000Z",
          });

        expect(summary).toMatchObject({
          marketsMissing: 1,
          oddsRowsArchived: 0,
        });

        expect(
          context.states[0],
        ).toMatchObject({
          fetch_status:
            "MISSING",

          http_status: 404,
          rows_archived: 0,
        });
      },
    );

    it(
      "försöker igen när matris finns men officiell vinnare saknas",
      async () => {
        const context =
          createAdapter({
            httpStatus: 200,

            payload: {
              status: "results",

              pools: {
                tvilling: {
                  comboOdds: [
                    [],
                    [425],
                  ],
                },
              },

              races: [],
            },
          });

        const summary =
          await runResearchPairFinalOddsBackfill({
            enabled: true,

            adapter:
              context.adapter,

            nowIso:
              "2026-08-05T00:00:00.000Z",
          });

        expect(summary).toMatchObject({
          marketsCompleted: 0,
          marketsRetrying: 1,

          oddsRowsArchived: 1,
        });

        expect(
          context.states[0],
        ).toMatchObject({
          fetch_status:
            "RETRY",

          rows_archived: 1,
          attempt_count: 1,
        });
      },
    );
  },
);
