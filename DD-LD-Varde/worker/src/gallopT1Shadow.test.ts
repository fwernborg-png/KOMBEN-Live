import {
  describe,
  expect,
  it,
} from "vitest";
import {
  evaluateGallopT1Shadow,
  type GallopT1ShadowPoint,
} from "./gallopT1Shadow";
import {
  GALLOP_T1_LIVE_DECISIONS_ENABLED,
  shouldUseGallopT1PreciseSampling,
} from "../../src/gallop/gallopT1ShadowConfig";

const START_MS =
  Date.parse(
    "2026-08-20T12:00:00.000Z",
  );

function point(
  runnerNumber: number,
  secondsBeforeStart: number,
  odds: number,
): GallopT1ShadowPoint {
  return {
    runnerNumber,
    odds,
    timestampMs:
      START_MS -
      secondsBeforeStart *
        1_000,
  };
}

describe(
  "gallop T1 shadow",
  () => {
    it(
      "samlar exakt endast svensk galopp under sista tre minuterna",
      () => {
        expect(
          GALLOP_T1_LIVE_DECISIONS_ENABLED,
        ).toBe(false);

        expect(
          shouldUseGallopT1PreciseSampling({
            date:
              "2026-08-20",
            countryCode:
              "SE",
            sport:
              "GALLOP",
            plannedStartTimeMs:
              START_MS,
            nowMs:
              START_MS -
              180_000,
          }),
        ).toBe(true);

        expect(
          shouldUseGallopT1PreciseSampling({
            date:
              "2026-08-20",
            countryCode:
              "SE",
            sport:
              "GALLOP",
            plannedStartTimeMs:
              START_MS,
            nowMs:
              START_MS -
              181_000,
          }),
        ).toBe(false);

        expect(
          shouldUseGallopT1PreciseSampling({
            date:
              "2026-08-20",
            countryCode:
              "NO",
            sport:
              "GALLOP",
            plannedStartTimeMs:
              START_MS,
            nowMs:
              START_MS -
              60_000,
          }),
        ).toBe(false);
      },
    );

    it(
      "rankar T2, T1 och sista minuten separat",
      () => {
        const result =
          evaluateGallopT1Shadow({
            plannedStartTimeMs:
              START_MS,

            runners: [
              {
                number: 1,
                name: "T2-ledaren",
                scratched: false,
              },
              {
                number: 2,
                name: "T1-ledaren",
                scratched: false,
              },
            ],

            points: [
              point(1, 3600, 10),
              point(1, 1800, 9),
              point(1, 900, 8),
              point(1, 300, 7.5),
              point(1, 120, 7),
              point(1, 60, 6.8),

              point(2, 3600, 8),
              point(2, 1800, 7.5),
              point(2, 900, 7),
              point(2, 300, 6.5),
              point(2, 120, 6),
              point(2, 60, 4.9),
            ],
          });

        expect(
          result.dataComplete,
        ).toBe(true);

        expect(
          result.t2LeaderRunnerNumber,
        ).toBe(1);

        expect(
          result.candidate
            ?.runnerNumber,
        ).toBe(2);

        expect(
          result
            .leaderChangedLastMinute,
        ).toBe(true);

        expect(
          result.candidate
            ?.lastMinuteDropRank,
        ).toBe(1);

        expect(
          result.qualifies,
        ).toBe(true);
      },
    );

    it(
      "accepterar minutpunkter strax efter planerade T2 och T1",
      () => {
        const result =
          evaluateGallopT1Shadow({
            plannedStartTimeMs:
              START_MS,

            runners: [
              {
                number: 1,
                name: "Efter T1",
                scratched: false,
              },
            ],

            points: [
              point(1, 3600, 10),
              point(1, 1800, 9.5),
              point(1, 900, 9),
              point(1, 300, 8.5),
              point(1, 115, 8),
              point(1, 55, 7.4),
            ],
          });

        expect(
          result.dataComplete,
        ).toBe(true);

        expect(
          result.candidate
            ?.t2Odds,
        ).toBe(8);

        expect(
          result.candidate
            ?.t1Odds,
        ).toBe(7.4);

        expect(
          result.candidate
            ?.lockPointMs,
        ).toBe(
          START_MS -
            55_000,
        );

        expect(
          result.qualifies,
        ).toBe(true);
      },
    );

    it(
      "vägrar skapa jämförelse när en aktiv häst saknar säker T1-punkt",
      () => {
        const result =
          evaluateGallopT1Shadow({
            plannedStartTimeMs:
              START_MS,

            runners: [
              {
                number: 1,
                name: "Komplett",
                scratched: false,
              },
              {
                number: 2,
                name: "Saknar T1",
                scratched: false,
              },
            ],

            points: [
              point(1, 3600, 10),
              point(1, 1800, 9),
              point(1, 900, 8),
              point(1, 300, 7),
              point(1, 120, 6.5),
              point(1, 60, 6),

              point(2, 3600, 8),
              point(2, 1800, 8),
              point(2, 900, 7.8),
              point(2, 300, 7.5),
              point(2, 120, 7),
            ],
          });

        expect(
          result.dataComplete,
        ).toBe(false);

        expect(
          result.candidate,
        ).toBeNull();

        expect(
          result.qualifies,
        ).toBe(false);
      },
    );
  },
);
