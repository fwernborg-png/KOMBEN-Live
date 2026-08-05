import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseResearchPairFinalOdds,
} from "./researchPairFinalOdds";

describe(
  "parseResearchPairFinalOdds",
  () => {
    it(
      "läser triangelformad Tvillingmatris utan ordning",
      () => {
        const rows =
          parseResearchPairFinalOdds({
            market: "TVILLING",

            payload: {
              id:
                "tvilling_2026-07-21_15_1",

              status: "results",

              pools: {
                tvilling: {
                  status: "results",

                  timestamp:
                    "2026-07-21T20:00:00Z",

                  comboOdds: [
                    [],
                    [3244],
                    [7797, 25430],
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

                            odds: 3244,
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          });

        expect(rows).toHaveLength(3);

        expect(rows[0]).toEqual({
          market: "TVILLING",

          firstRunnerNumber: 1,
          secondRunnerNumber: 2,

          finalOddsDecimal: 32.44,

          isWinningPair: true,
          officialPayoutDecimal:
            32.44,

          sourceGameId:
            "tvilling_2026-07-21_15_1",

          sourceStatus: "results",

          sourceTimestamp:
            "2026-07-21T20:00:00Z",
        });

        expect(rows[1]).toMatchObject({
          firstRunnerNumber: 1,
          secondRunnerNumber: 3,
          finalOddsDecimal: 77.97,
          isWinningPair: false,
        });

        expect(rows[2]).toMatchObject({
          firstRunnerNumber: 2,
          secondRunnerNumber: 3,
          finalOddsDecimal: 254.3,
          isWinningPair: false,
        });
      },
    );

    it(
      "läser full Kombmatris med ordning",
      () => {
        const rows =
          parseResearchPairFinalOdds({
            market: "KOMB",

            payload: {
              id:
                "komb_2026-07-21_15_1",

              status: "results",

              pools: {
                komb: {
                  status: "results",

                  comboOdds: [
                    [0, 9122, 9884],
                    [5036, 0, 37830],
                    [36943, 77588, 0],
                  ],
                },
              },

              races: [
                {
                  pools: {
                    komb: {
                      result: {
                        winners: [
                          {
                            combination:
                              [2, 1],

                            odds: 5036,
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          });

        expect(rows).toHaveLength(6);

        expect(rows).toContainEqual({
          market: "KOMB",

          firstRunnerNumber: 1,
          secondRunnerNumber: 2,

          finalOddsDecimal: 91.22,

          isWinningPair: false,
          officialPayoutDecimal: null,

          sourceGameId:
            "komb_2026-07-21_15_1",

          sourceStatus: "results",
          sourceTimestamp: null,
        });

        expect(rows).toContainEqual({
          market: "KOMB",

          firstRunnerNumber: 2,
          secondRunnerNumber: 1,

          finalOddsDecimal: 50.36,

          isWinningPair: true,
          officialPayoutDecimal:
            50.36,

          sourceGameId:
            "komb_2026-07-21_15_1",

          sourceStatus: "results",
          sourceTimestamp: null,
        });
      },
    );

    it(
      "ignorerar nollor, samma häst och ogiltiga odds",
      () => {
        const rows =
          parseResearchPairFinalOdds({
            market: "KOMB",

            payload: {
              pools: {
                komb: {
                  comboOdds: [
                    [0, 9999],
                    [0, 0],
                  ],
                },
              },
            },
          });

        expect(rows).toEqual([]);
      },
    );
  },
);
