import {
  describe,
  expect,
  it,
} from "vitest";

import {
  extractRunnerStats,
  findLatestWinPercent,
  latestYearWinPercent,
  normalizeAtgMoneyPerStart,
  normalizeAtgPercent,
} from "./runnerStatistics";

describe(
  "normalizeAtgPercent",
  () => {
    it(
      "klarar decimalandel",
      () => {
        expect(
          normalizeAtgPercent(
            0.18,
          ),
        ).toBe(18);
      },
    );

    it(
      "klarar vanligt procenttal",
      () => {
        expect(
          normalizeAtgPercent(
            18,
          ),
        ).toBe(18);
      },
    );

    it(
      "klarar ATG:s hundradelsprocent",
      () => {
        expect(
          normalizeAtgPercent(
            952,
          ),
        ).toBeCloseTo(
          9.52,
          8,
        );

        expect(
          normalizeAtgPercent(
            1320,
          ),
        ).toBeCloseTo(
          13.2,
          8,
        );
      },
    );
  },
);

describe(
  "normalizeAtgMoneyPerStart",
  () => {
    it(
      "gör om öre till kronor",
      () => {
        expect(
          normalizeAtgMoneyPerStart(
            630476,
          ),
        ).toBeCloseTo(
          6304.76,
          8,
        );
      },
    );
  },
);

describe(
  "latestYearWinPercent",
  () => {
    it(
      "räknar från ATG:s årsobjekt",
      () => {
        const value =
          latestYearWinPercent({
            "2025": {
              starts: 1772,

              placement: {
                "1": 242,
              },
            },
          });

        expect(
          value,
        ).toBeCloseTo(
          (
            242 /
            1772
          ) * 100,
          8,
        );
      },
    );

    it(
      "väljer senaste året",
      () => {
        const value =
          latestYearWinPercent({
            "2024": {
              starts: 100,

              placement: {
                "1": 10,
              },
            },

            "2026": {
              starts: 200,

              placement: {
                "1": 30,
              },
            },
          });

        expect(
          value,
        ).toBeCloseTo(
          15,
          8,
        );
      },
    );

    it(
      "klarar äldre arrayform",
      () => {
        const value =
          latestYearWinPercent([
            {
              year: 2025,
              winPercentage: 0.18,
            },
          ]);

        expect(value).toBe(18);
      },
    );
  },
);

describe(
  "findLatestWinPercent",
  () => {
    it(
      "hittar statistik i alternativ säsongsstruktur",
      () => {
        const value =
          findLatestWinPercent({
            statistics: {
              seasons: {
                "2025": {
                  starts: 100,

                  placement: {
                    "1": 12,
                  },
                },

                "2026": {
                  starts: 120,

                  placement: {
                    "1": 18,
                  },
                },
              },
            },
          });

        expect(value).toBe(15);
      },
    );
  },
);

describe(
  "extractRunnerStats",
  () => {
    it(
      "normaliserar verklighetsnära ATG-värden",
      () => {
        const stats =
          extractRunnerStats({
            horse: {
              statistics: {
                life: {
                  earningsPerStart:
                    630476,

                  winPercentage:
                    952,

                  startPoints:
                    1100,
                },
              },
            },

            driver: {
              statistics: {
                seasons: {
                  "2026": {
                    starts: 200,

                    placement: {
                      "1": 24,
                    },
                  },
                },
              },
            },

            gallopPercent:
              1250,
          });

        expect(
          stats.earningsPerStart,
        ).toBeCloseTo(
          6304.76,
          8,
        );

        expect(
          stats.winPercent,
        ).toBeCloseTo(
          9.52,
          8,
        );

        expect(
          stats.driverWinPercent,
        ).toBeCloseTo(
          12,
          8,
        );

        expect(
          stats.startPoints,
        ).toBe(1100);

        expect(
          stats.gallopPercent,
        ).toBeCloseTo(
          12.5,
          8,
        );
      },
    );

    it(
      "använder inte hästens ST som falskt K",
      () => {
        const stats =
          extractRunnerStats({
            horse: {
              statistics: {
                life: {
                  winPercentage:
                    1500,
                },
              },
            },
          });

        expect(
          stats.winPercent,
        ).toBe(15);

        expect(
          stats.driverWinPercent,
        ).toBeNull();
      },
    );
  },
);
