import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

import {
  evaluateJupiter,
  getJupiterPlaceHitMaxOfficialFinishPosition,
  isInJupiterSignalWindow,
} from "./jupiter";

function runner(
  number: number,
  odds: number[],
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
    strength: 3,
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
      [3.80, 3.75, 3.70, 3.65, 3.60],
    ),
    runner(
      2,
      [5.0, 4.2, 5.3, 4.4, 5.1],
    ),
    runner(
      3,
      [6.0, 5.0, 6.4, 5.2, 6.1],
    ),
    runner(
      4,
      [7.0, 5.8, 7.4, 6.0, 7.2],
    ),
    runner(
      5,
      [8.0, 6.5, 8.5, 6.9, 8.1],
    ),
    runner(
      6,
      [9.0, 7.2, 9.7, 7.5, 9.1],
    ),
    runner(
      7,
      [10.0, 8.0, 10.8, 8.3, 10.2],
    ),
    runner(
      8,
      [11.0, 8.7, 11.9, 9.0, 11.2],
    ),
  ];
}

describe(
  "Jupiter V1.0",
  () => {
    it(
      "använder rätt antal betalda platser",
      () => {
        expect(
          getJupiterPlaceHitMaxOfficialFinishPosition(
            6,
          ),
        ).toBe(2);

        expect(
          getJupiterPlaceHitMaxOfficialFinishPosition(
            7,
          ),
        ).toBe(3);

        expect(
          getJupiterPlaceHitMaxOfficialFinishPosition(
            12,
          ),
        ).toBe(3);
      },
    );

    it(
      "väljer Jämnaste för PLATS när låsodds är 3,00–3,99 och oddset inte stigit",
      () => {
        const result =
          evaluateJupiter({
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
        ).toBe(3.60);

        expect(
          result.candidate
            ?.oddsDropPercent,
        ).toBeGreaterThanOrEqual(0);
      },
    );

    it(
      "ger ingen signal under låsodds 3,00",
      () => {
        const list = runners();

        list[0] = runner(
          1,
          [3.20, 3.10, 3.05, 2.95, 2.90],
        );

        expect(
          evaluateJupiter({
            trackName: "Solvalla",
            isMonte: false,
            runners: list,
          }).candidate,
        ).toBeNull();
      },
    );

    it(
      "ger ingen signal vid låsodds 4,00 eller högre",
      () => {
        const list = runners();

        list[0] = runner(
          1,
          [4.30, 4.20, 4.10, 4.05, 4.00],
        );

        expect(
          evaluateJupiter({
            trackName: "Solvalla",
            isMonte: false,
            runners: list,
          }).candidate,
        ).toBeNull();
      },
    );

    it(
      "ger ingen signal när Jämnastes odds har stigit",
      () => {
        const list = runners();

        list[0] = runner(
          1,
          [3.40, 3.45, 3.50, 3.55, 3.60],
        );

        expect(
          evaluateJupiter({
            trackName: "Solvalla",
            isMonte: false,
            runners: list,
          }).candidate,
        ).toBeNull();
      },
    );

    it(
      "utesluter Bro Park och galopp",
      () => {
        expect(
          evaluateJupiter({
            trackName: "Bro Park",
            isMonte: false,
            runners: runners(),
          }).candidate,
        ).toBeNull();

        expect(
          evaluateJupiter({
            trackName: "Jägersro Galopp",
            isMonte: false,
            runners: runners(),
          }).candidate,
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
          isInJupiterSignalWindow(
            "2026-08-10T12:00:00Z",
            start - 90_000,
          ),
        ).toBe(true);

        expect(
          isInJupiterSignalWindow(
            "2026-08-10T12:00:00Z",
            start - 30_000,
          ),
        ).toBe(false);
      },
    );
  },
);
