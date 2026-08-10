import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

import {
  evaluateGrodan,
  getGrodanPlaceHitMaxOfficialFinishPosition,
  isGrodanProspectiveDate,
  isInGrodanSignalWindow,
} from "./grodan";

function runner(
  number: number,
  odds: number[],
  indicatorsGreen: string[] = [],
): WinPlaceRunnerInput {
  return {
    number,
    name: `Häst ${number}`,
    horseId: number,
    startLane: number,
    scratched: false,

    currentWinOddsDecimal:
      odds[odds.length - 1] ?? null,

    indicatorsGreen,
    strength:
      indicatorsGreen.length,

    oddsHistory:
      odds.map(
        (value, index) => ({
          odds: value,
          timestamp:
            1_000 +
            index * 60_000,
        }),
      ),
  };
}

function runners() {
  return [
    runner(
      1,
      [5.20, 5.15, 5.10, 5.05, 5.00],
      ["G"],
    ),
    runner(
      2,
      [6.0, 5.0, 6.4, 5.2, 6.1],
    ),
    runner(
      3,
      [7.0, 5.8, 7.4, 6.0, 7.2],
    ),
    runner(
      4,
      [8.0, 6.5, 8.5, 6.9, 8.1],
    ),
    runner(
      5,
      [9.0, 7.2, 9.7, 7.5, 9.1],
    ),
    runner(
      6,
      [10.0, 8.0, 10.8, 8.3, 10.2],
    ),
    runner(
      7,
      [11.0, 8.7, 11.9, 9.0, 11.2],
    ),
    runner(
      8,
      [12.0, 9.5, 12.8, 9.8, 12.1],
    ),
  ];
}

describe(
  "Grodan V1.0",
  () => {
    it(
      "startar prospektivt 2026-08-11",
      () => {
        expect(
          isGrodanProspectiveDate(
            "2026-08-10",
          ),
        ).toBe(false);

        expect(
          isGrodanProspectiveDate(
            "2026-08-11",
          ),
        ).toBe(true);
      },
    );

    it(
      "väljer Jämnaste för PLATS när G är grön och låsodds är 4,00–9,99",
      () => {
        const result =
          evaluateGrodan({
            raceDate:
              "2026-08-11",
            trackName:
              "Solvalla",
            isMonte: false,
            runners:
              runners(),
          });

        expect(
          result.candidate
            ?.runnerNumber,
        ).toBe(1);

        expect(
          result.candidate
            ?.currentWinOdds,
        ).toBe(5);

        expect(
          result.candidate
            ?.indicatorsGreen,
        ).toContain("G");
      },
    );

    it(
      "ger ingen signal när G inte är grön",
      () => {
        const list = runners();

        list[0] = runner(
          1,
          [5.20, 5.15, 5.10, 5.05, 5.00],
          ["KR"],
        );

        expect(
          evaluateGrodan({
            raceDate:
              "2026-08-11",
            trackName:
              "Solvalla",
            isMonte: false,
            runners: list,
          }).candidate,
        ).toBeNull();
      },
    );

    it(
      "accepterar gränserna 4,00 och 9,99",
      () => {
        for (
          const finalOdds of
            [4.00, 9.99]
        ) {
          const list = runners();

          list[0] = runner(
            1,
            [
              finalOdds + 0.04,
              finalOdds + 0.03,
              finalOdds + 0.02,
              finalOdds + 0.01,
              finalOdds,
            ],
            ["G"],
          );

          expect(
            evaluateGrodan({
              raceDate:
                "2026-08-11",
              trackName:
                "Solvalla",
              isMonte: false,
              runners: list,
            }).candidate
              ?.runnerNumber,
          ).toBe(1);
        }
      },
    );

    it(
      "avvisar odds under 4,00 och över 9,99",
      () => {
        for (
          const finalOdds of
            [3.99, 10.00]
        ) {
          const list = runners();

          list[0] = runner(
            1,
            [
              finalOdds + 0.04,
              finalOdds + 0.03,
              finalOdds + 0.02,
              finalOdds + 0.01,
              finalOdds,
            ],
            ["G"],
          );

          expect(
            evaluateGrodan({
              raceDate:
                "2026-08-11",
              trackName:
                "Solvalla",
              isMonte: false,
              runners: list,
            }).candidate,
          ).toBeNull();
        }
      },
    );

    it(
      "utesluter monté, Bro Park och galopp",
      () => {
        expect(
          evaluateGrodan({
            raceDate:
              "2026-08-11",
            trackName:
              "Solvalla",
            isMonte: true,
            runners:
              runners(),
          }).candidate,
        ).toBeNull();

        expect(
          evaluateGrodan({
            raceDate:
              "2026-08-11",
            trackName:
              "Bro Park",
            isMonte: false,
            runners:
              runners(),
          }).candidate,
        ).toBeNull();

        expect(
          evaluateGrodan({
            raceDate:
              "2026-08-11",
            trackName:
              "Göteborg Galopp",
            isMonte: false,
            runners:
              runners(),
          }).candidate,
        ).toBeNull();
      },
    );

    it(
      "använder samma T-90-fönster 60–120 sekunder före start",
      () => {
        const start =
          Date.parse(
            "2026-08-11T12:00:00Z",
          );

        expect(
          isInGrodanSignalWindow(
            "2026-08-11T12:00:00Z",
            start - 90_000,
          ),
        ).toBe(true);

        expect(
          isInGrodanSignalWindow(
            "2026-08-11T12:00:00Z",
            start - 30_000,
          ),
        ).toBe(false);
      },
    );

    it(
      "använder rätt antal betalda platser",
      () => {
        expect(
          getGrodanPlaceHitMaxOfficialFinishPosition(
            6,
          ),
        ).toBe(2);

        expect(
          getGrodanPlaceHitMaxOfficialFinishPosition(
            7,
          ),
        ).toBe(3);
      },
    );
  },
);
