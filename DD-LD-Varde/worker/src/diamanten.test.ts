import { describe, expect, it } from "vitest";

import {
  DIAMANTEN_RULE_VERSION,
  evaluateDiamanten,
  isInDiamantenSignalWindow,
  type DiamantenRunnerInput,
} from "./diamanten";

const plannedStartTime =
  "2026-08-11T20:00:00.000Z";

function runner(args: {
  number: number;
  strength?: number;
  lockOdds?: number;
  scratched?: boolean;
  indicatorDataComplete?: boolean;
  oddsDataComplete?: boolean;
}): DiamantenRunnerInput {
  const {
    number,
    strength = 2,
    lockOdds = 10,
    scratched = false,
    indicatorDataComplete = true,
    oddsDataComplete = true,
  } = args;

  const startMs =
    Date.parse(plannedStartTime);

  return {
    number,
    name: `Häst ${number}`,
    horseId: number,
    startLane: number,
    scratched,

    currentWinOddsDecimal:
      lockOdds,

    indicatorsGreen:
      strength === 3
        ? ["KR", "ST", "K"]
        : strength === 2
          ? ["KR", "ST"]
          : [],

    strength,

    indicatorDataComplete,
    oddsDataComplete,

    oddsHistory: [
      {
        odds: lockOdds + 2,
        timestamp:
          startMs - 59 * 60_000,
      },
      {
        odds: lockOdds + 1.5,
        timestamp:
          startMs - 45 * 60_000,
      },
      {
        odds: lockOdds + 1,
        timestamp:
          startMs - 30 * 60_000,
      },
      {
        odds: lockOdds + 0.5,
        timestamp:
          startMs - 15 * 60_000,
      },
      {
        odds: lockOdds,
        timestamp:
          startMs - 90_000,
      },
    ],
  };
}

function eightRunnerField(
  overrides: DiamantenRunnerInput[] = [],
) {
  const byNumber =
    new Map(
      overrides.map(
        (item) => [
          item.number,
          item,
        ],
      ),
    );

  return Array.from(
    { length: 8 },
    (_, index) => {
      const number =
        index + 1;

      return (
        byNumber.get(number) ??
        runner({
          number,
          strength: 2,
          lockOdds: 10,
        })
      );
    },
  );
}

function evaluate(args?: {
  raceDate?: string;
  distanceMeters?: number;
  isMonte?: boolean;
  trackName?: string;
  meetingName?: string | null;
  raceCategory?: string | null;
  runners?: DiamantenRunnerInput[];
}) {
  return evaluateDiamanten({
    raceDate:
      args?.raceDate ??
      "2026-08-11",

    trackName:
      args?.trackName ??
      "Åby",

    meetingName:
      args?.meetingName ??
      "Åby",

    raceCategory:
      args?.raceCategory ??
      null,

    raceStatus:
      "scheduled",

    isMonte:
      args?.isMonte ??
      false,

    distanceMeters:
      args?.distanceMeters ??
      2140,

    runners:
      args?.runners ??
      eightRunnerField(),
  });
}

describe(
  DIAMANTEN_RULE_VERSION,
  () => {
    it(
      "väljer en häst med exakt styrka 3/6 och låsodds 6–25",
      () => {
        const candidate =
          runner({
            number: 3,
            strength: 3,
            lockOdds: 12,
          });

        const result =
          evaluate({
            runners:
              eightRunnerField([
                candidate,
              ]),
          });

        expect(
          result.active,
        ).toBe(true);

        expect(
          result.candidates,
        ).toHaveLength(1);

        expect(
          result.candidates[0]
            ?.runnerNumber,
        ).toBe(3);

        expect(
          result.excludedReason,
        ).toBeNull();
      },
    );

    it(
      "behåller alla kvalificerade hästar i samma lopp",
      () => {
        const result =
          evaluate({
            runners:
              eightRunnerField([
                runner({
                  number: 2,
                  strength: 3,
                  lockOdds: 7,
                }),

                runner({
                  number: 6,
                  strength: 3,
                  lockOdds: 22,
                }),
              ]),
          });

        expect(
          result.candidates.map(
            (candidate) =>
              candidate.runnerNumber,
          ),
        ).toEqual([2, 6]);
      },
    );

    it(
      "kräver exakt styrka 3/6",
      () => {
        const result =
          evaluate({
            runners:
              eightRunnerField([
                runner({
                  number: 2,
                  strength: 2,
                  lockOdds: 10,
                }),

                runner({
                  number: 3,
                  strength: 4,
                  lockOdds: 10,
                }),
              ]),
          });

        expect(
          result.candidates,
        ).toHaveLength(0);
      },
    );

    it(
      "godkänner oddsgränserna 6,00 och 25,00",
      () => {
        const result =
          evaluate({
            runners:
              eightRunnerField([
                runner({
                  number: 1,
                  strength: 3,
                  lockOdds: 6,
                }),

                runner({
                  number: 2,
                  strength: 3,
                  lockOdds: 25,
                }),
              ]),
          });

        expect(
          result.candidates.map(
            (candidate) =>
              candidate.runnerNumber,
          ),
        ).toEqual([1, 2]);
      },
    );

    it(
      "avvisar odds under 6 och över 25",
      () => {
        const result =
          evaluate({
            runners:
              eightRunnerField([
                runner({
                  number: 1,
                  strength: 3,
                  lockOdds: 5.99,
                }),

                runner({
                  number: 2,
                  strength: 3,
                  lockOdds: 25.01,
                }),
              ]),
          });

        expect(
          result.candidates,
        ).toHaveLength(0);
      },
    );

    it(
      "kräver komplett indikator- och oddsdata för kandidaten",
      () => {
        const result =
          evaluate({
            runners:
              eightRunnerField([
                runner({
                  number: 1,
                  strength: 3,
                  lockOdds: 10,
                  indicatorDataComplete:
                    false,
                }),

                runner({
                  number: 2,
                  strength: 3,
                  lockOdds: 10,
                  oddsDataComplete:
                    false,
                }),

                runner({
                  number: 3,
                  strength: 3,
                  lockOdds: 10,
                  indicatorDataComplete:
                    true,
                  oddsDataComplete:
                    true,
                }),
              ]),
          });

        expect(
          result.candidates.map(
            (candidate) =>
              candidate.runnerNumber,
          ),
        ).toEqual([3]);
      },
    );

    it(
      "kräver 7–10 aktiva startande",
      () => {
        const six =
          Array.from(
            { length: 6 },
            (_, index) =>
              runner({
                number:
                  index + 1,
                strength:
                  index === 0
                    ? 3
                    : 2,
              }),
          );

        const eleven =
          Array.from(
            { length: 11 },
            (_, index) =>
              runner({
                number:
                  index + 1,
                strength:
                  index === 0
                    ? 3
                    : 2,
              }),
          );

        expect(
          evaluate({
            runners: six,
          }).active,
        ).toBe(false);

        expect(
          evaluate({
            runners: eleven,
          }).active,
        ).toBe(false);
      },
    );

    it(
      "kräver exakt 2140 meter",
      () => {
        expect(
          evaluate({
            distanceMeters:
              1640,
          }).active,
        ).toBe(false);

        expect(
          evaluate({
            distanceMeters:
              2640,
          }).active,
        ).toBe(false);
      },
    );

    it(
      "exkluderar monté och galopp",
      () => {
        expect(
          evaluate({
            isMonte: true,
          }).active,
        ).toBe(false);

        expect(
          evaluate({
            trackName:
              "Bro Park",
          }).active,
        ).toBe(false);

        expect(
          evaluate({
            trackName:
              "Jägersro Galopp",
          }).active,
        ).toBe(false);

        expect(
          evaluate({
            trackName:
              "Åby",
            raceCategory:
              "Galopp",
          }).active,
        ).toBe(false);
      },
    );

    it(
      "är inte aktiv före 11 augusti 2026",
      () => {
        expect(
          evaluate({
            raceDate:
              "2026-08-10",
          }).active,
        ).toBe(false);

        expect(
          evaluate({
            raceDate:
              "2026-08-11",
          }).active,
        ).toBe(true);
      },
    );

    it(
      "använder T-90-fönstret 60–120 sekunder före start",
      () => {
        expect(
          isInDiamantenSignalWindow(
            plannedStartTime,
            Date.parse(
              "2026-08-11T19:58:30.000Z",
            ),
          ),
        ).toBe(true);

        expect(
          isInDiamantenSignalWindow(
            plannedStartTime,
            Date.parse(
              "2026-08-11T19:57:30.000Z",
            ),
          ),
        ).toBe(false);

        expect(
          isInDiamantenSignalWindow(
            plannedStartTime,
            Date.parse(
              "2026-08-11T19:59:30.000Z",
            ),
          ),
        ).toBe(false);
      },
    );
  },
);
