import {
  describe,
  expect,
  it,
} from "vitest";
import {
  runResearchProductBackfill,
  type ResearchProductBackfillAdapter,
  type ResearchProductBackfillRaceRow,
} from "./researchProductBackfill";

function race(
  raceNumber: number,
): ResearchProductBackfillRaceRow {
  return {
    race_key:
      `ATG:2026-08-07:19:${raceNumber}:2026-08-07_19_${raceNumber}`,
    source_race_id:
      `2026-08-07_19_${raceNumber}`,
    race_date:
      "2026-08-07",
    race_number:
      raceNumber,
    country_code:
      "SE",
    currency_code:
      "SEK",
    parser_version:
      "RESEARCH_PARSER_V1.0",
  };
}

describe(
  "researchProductBackfill",
  () => {
    it(
      "kopplar äldre lopp till calendar.games",
      async () => {
        const replaced:
          Array<{
            raceNumber: number;
            products:
              Array<{
                code: string;
                leg: number | null;
              }>;
          }> = [];

        const marked:
          string[] = [];

        const adapter:
          ResearchProductBackfillAdapter = {
            async listPendingRaces() {
              return [
                race(4),
                race(6),
              ];
            },

            async replaceRaceProducts(
              {
                race:
                  raceRow,
                products,
              },
            ) {
              replaced.push({
                raceNumber:
                  raceRow.race_number,
                products:
                  products.map(
                    (product) => ({
                      code:
                        product.productCode,
                      leg:
                        product.legNumber,
                    }),
                  ),
              });
            },

            async markRaceProcessed(
              {
                raceKey,
              },
            ) {
              marked.push(
                raceKey,
              );
            },
          };

        const summary =
          await runResearchProductBackfill({
            enabled: true,
            parserVersion:
              "RESEARCH_PARSER_V1.1",
            nowIso:
              "2026-08-07T20:00:00.000Z",
            maxRaces: 5,
            adapter,

            async fetchCalendar() {
              return {
                games: {
                  V64: [
                    {
                      id:
                        "V64_2026-08-07_19_4",
                      races: [
                        "2026-08-07_19_4",
                        "2026-08-07_19_5",
                        "2026-08-07_19_6",
                        "2026-08-07_19_7",
                        "2026-08-07_19_8",
                        "2026-08-07_19_9",
                      ],
                    },
                  ],

                  V4: [
                    {
                      id:
                        "V4_2026-08-07_19_6",
                      races: [
                        "2026-08-07_19_6",
                        "2026-08-07_19_7",
                        "2026-08-07_19_8",
                        "2026-08-07_19_9",
                      ],
                    },
                  ],
                },
              };
            },
          });

        expect(
          replaced[0],
        ).toEqual({
          raceNumber: 4,
          products: [
            {
              code: "V64",
              leg: 1,
            },
          ],
        });

        expect(
          replaced[1],
        ).toEqual({
          raceNumber: 6,
          products: [
            {
              code: "V64",
              leg: 3,
            },
            {
              code: "V4",
              leg: 1,
            },
          ],
        });

        expect(
          marked,
        ).toHaveLength(2);

        expect(summary).toEqual(
          expect.objectContaining({
            racesSelected: 2,
            racesProcessed: 2,
            racesWithCalendarProducts:
              2,
            productsUpserted: 3,
            failures: 0,
          }),
        );
      },
    );

    it(
      "markerar även lopp som saknar spelprodukt",
      async () => {
        let marked = 0;

        const adapter:
          ResearchProductBackfillAdapter = {
            async listPendingRaces() {
              return [
                race(1),
              ];
            },

            async replaceRaceProducts(
              {
                products,
              },
            ) {
              expect(
                products,
              ).toEqual([]);
            },

            async markRaceProcessed() {
              marked += 1;
            },
          };

        const summary =
          await runResearchProductBackfill({
            enabled: true,
            parserVersion:
              "RESEARCH_PARSER_V1.1",
            nowIso:
              "2026-08-07T20:00:00.000Z",
            adapter,

            async fetchCalendar() {
              return {
                games: {
                  V64: [],
                },
              };
            },
          });

        expect(marked).toBe(1);
        expect(
          summary.racesProcessed,
        ).toBe(1);
      },
    );

    it(
      "markerar inte lopp om kalenderhämtningen misslyckas",
      async () => {
        let marked = 0;

        const adapter:
          ResearchProductBackfillAdapter = {
            async listPendingRaces() {
              return [
                race(4),
              ];
            },

            async replaceRaceProducts() {
              throw new Error(
                "ska inte köras",
              );
            },

            async markRaceProcessed() {
              marked += 1;
            },
          };

        const summary =
          await runResearchProductBackfill({
            enabled: true,
            parserVersion:
              "RESEARCH_PARSER_V1.1",
            nowIso:
              "2026-08-07T20:00:00.000Z",
            adapter,

            async fetchCalendar() {
              throw new Error(
                "ATG nere",
              );
            },
          });

        expect(marked).toBe(0);
        expect(
          summary.failures,
        ).toBe(1);
      },
    );
  },
);
