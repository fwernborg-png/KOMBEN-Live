import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

import {
  evaluateSnigelKommer,
  isInSnigelKommerSignalWindow,
} from "./snigelKommer";

function runner(
  number: number,
  odds: number[],
  strength = 3,
): WinPlaceRunnerInput {
  return {
    number,
    name: `Häst ${number}`,
    horseId: number,
    startLane: number,
    scratched: false,
    currentWinOddsDecimal:
      odds[odds.length - 1] ?? null,
    indicatorsGreen: [],
    strength,
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

function nineRunners() {
  return [
    runner(
      1,
      [4.00, 4.02, 4.04, 4.06, 4.10],
      4,
    ),

    runner(
      2,
      [3.0, 3.6, 3.1, 3.8, 3.3],
    ),

    runner(
      3,
      [5.0, 4.3, 5.4, 4.2, 5.1],
    ),

    runner(
      4,
      [6.0, 5.0, 6.5, 5.2, 6.2],
    ),

    runner(
      5,
      [7.0, 5.8, 7.5, 6.0, 7.2],
    ),

    runner(
      6,
      [8.0, 6.5, 8.7, 6.9, 8.1],
    ),

    runner(
      7,
      [9.0, 7.2, 9.8, 7.5, 9.1],
    ),

    runner(
      8,
      [10.0, 8.0, 10.9, 8.3, 10.2],
    ),

    runner(
      9,
      [11.0, 8.7, 12.0, 9.0, 11.2],
    ),
  ];
}

describe(
  "Snigel kommer V1.0",
  () => {
    it(
      "väljer Jämnaste när 9 startar och dess odds har stigit",
      () => {
        const result =
          evaluateSnigelKommer({
            trackName:
              "Solvalla",
            isMonte: false,
            runners:
              nineRunners(),
          });

        expect(
          result.candidate
            ?.runnerNumber,
        ).toBe(1);

        expect(
          result.candidate
            ?.oddsDropPercent,
        ).toBeLessThan(0);
      },
    );

    it(
      "ger inget Snigel under 3,50 i vinnarodds",
      () => {
        const runners =
          nineRunners();

        runners[0] =
          runner(
            1,
            [3.20, 3.25, 3.30, 3.35, 3.40],
            4,
          );

        const result =
          evaluateSnigelKommer({
            trackName: "Solvalla",
            isMonte: false,
            runners,
          });

        expect(
          result.candidate,
        ).toBeNull();
      },
    );

    it(
      "ger ingen signal med 8 startande",
      () => {
        const result =
          evaluateSnigelKommer({
            trackName:
              "Solvalla",
            isMonte: false,
            runners:
              nineRunners().slice(
                0,
                8,
              ),
          });

        expect(
          result.candidate,
        ).toBeNull();
      },
    );

    it(
      "ger ingen signal om Jämnastes odds inte har stigit",
      () => {
        const runners =
          nineRunners();

        runners[0] =
          runner(
            1,
            [
              4.10,
              4.08,
              4.06,
              4.04,
              4.00,
            ],
            4,
          );

        const result =
          evaluateSnigelKommer({
            trackName:
              "Solvalla",
            isMonte: false,
            runners,
          });

        expect(
          result.candidate,
        ).toBeNull();
      },
    );

    it(
      "utesluter galopp",
      () => {
        const result =
          evaluateSnigelKommer({
            trackName:
              "Bro Park",
            isMonte: false,
            runners:
              nineRunners(),
          });

        expect(
          result.candidate,
        ).toBeNull();
      },
    );

    it(
      "använder signalfönstret 60–120 sekunder före start",
      () => {
        const start =
          Date.parse(
            "2026-08-10T12:00:00Z",
          );

        expect(
          isInSnigelKommerSignalWindow(
            "2026-08-10T12:00:00Z",
            start - 90_000,
          ),
        ).toBe(true);

        expect(
          isInSnigelKommerSignalWindow(
            "2026-08-10T12:00:00Z",
            start - 30_000,
          ),
        ).toBe(false);
      },
    );
  },
);
