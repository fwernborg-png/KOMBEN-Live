import { describe, expect, it } from "vitest";

import type { WinPlaceRunnerInput } from "../../src/winPlaceModel/types";

import {
  ENSAMVARGEN_RULE_VERSION,
  evaluateEnsamvargen,
  isInEnsamvargenSignalWindow,
} from "./ensamvargen";

const plannedStartTime = "2026-08-10T20:00:00.000Z";

const nowMs = Date.parse("2026-08-10T19:58:30.000Z");

function runner(args: {
  number: number;
  startOdds: number;
  lockOdds: number;
  points?: number;
  scratched?: boolean;
}): WinPlaceRunnerInput {
  const { number, startOdds, lockOdds, points = 2, scratched = false } = args;

  const history =
    points === 1
      ? [
          {
            odds: lockOdds,
            timestamp: nowMs,
          },
        ]
      : [
          {
            odds: startOdds,
            timestamp: Date.parse(plannedStartTime) - 59 * 60_000,
          },
          {
            odds: lockOdds,
            timestamp: nowMs,
          },
        ];

  return {
    number,
    name: `Häst ${number}`,
    horseId: number,
    startLane: number,
    scratched,
    currentWinOddsDecimal: lockOdds,
    indicatorsGreen: [],
    strength: 0,
    oddsHistory: history,
  };
}

describe(ENSAMVARGEN_RULE_VERSION, () => {
  it("spelar när exakt en häst sänks 5–9,99 procent och odds är minst 6", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      raceStatus: "scheduled",
      isMonte: false,
      nowMs,
      runners: [
        runner({
          number: 1,
          startOdds: 10,
          lockOdds: 9.4,
        }),
        runner({
          number: 2,
          startOdds: 5,
          lockOdds: 5.1,
        }),
        runner({
          number: 3,
          startOdds: 8,
          lockOdds: 7.1,
        }),
      ],
    });

    expect(result.candidate?.runnerNumber).toBe(1);

    expect(result.qualifyingCandidates).toHaveLength(1);

    expect(result.excludedReason).toBeNull();
  });

  it("avstår när två hästar ligger i intervallet", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      isMonte: false,
      nowMs,
      runners: [
        runner({
          number: 1,
          startOdds: 10,
          lockOdds: 9.4,
        }),
        runner({
          number: 2,
          startOdds: 8,
          lockOdds: 7.5,
        }),
      ],
    });

    expect(result.candidate).toBeNull();

    expect(result.qualifyingCandidates).toHaveLength(2);
  });

  it("kräver låsodds minst 6", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      isMonte: false,
      nowMs,
      runners: [
        runner({
          number: 1,
          startOdds: 6,
          lockOdds: 5.6,
        }),
        runner({
          number: 2,
          startOdds: 5,
          lockOdds: 5.2,
        }),
      ],
    });

    expect(result.candidate).toBeNull();

    expect(result.excludedReason).toContain("under 6,00");
  });

  it("5,00 procent är godkänt", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      isMonte: false,
      nowMs,
      runners: [
        runner({
          number: 1,
          startOdds: 10,
          lockOdds: 9.5,
        }),
        runner({
          number: 2,
          startOdds: 5,
          lockOdds: 5.2,
        }),
      ],
    });

    expect(result.candidate?.runnerNumber).toBe(1);
  });

  it("10,00 procent är inte med i intervallet", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      isMonte: false,
      nowMs,
      runners: [
        runner({
          number: 1,
          startOdds: 10,
          lockOdds: 9,
        }),
        runner({
          number: 2,
          startOdds: 5,
          lockOdds: 5.2,
        }),
      ],
    });

    expect(result.candidate).toBeNull();

    expect(result.qualifyingCandidates).toHaveLength(0);
  });

  it("avstår om hela startfältets oddshistorik inte kan bedömas", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      isMonte: false,
      nowMs,
      runners: [
        runner({
          number: 1,
          startOdds: 10,
          lockOdds: 9.4,
        }),
        runner({
          number: 2,
          startOdds: 5,
          lockOdds: 5,
          points: 1,
        }),
      ],
    });

    expect(result.candidate).toBeNull();

    expect(result.excludedReason).toContain("hela startfältet");
  });

  it("är inte aktiv före prospektivt startdatum", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-09",
      plannedStartTime,
      isMonte: false,
      nowMs,
      runners: [],
    });

    expect(result.active).toBe(false);
  });

  it("exkluderar monté", () => {
    const result = evaluateEnsamvargen({
      raceDate: "2026-08-10",
      plannedStartTime,
      isMonte: true,
      nowMs,
      runners: [],
    });

    expect(result.active).toBe(false);
  });

  it("använder T-90-fönstret 60–120 sekunder före start", () => {
    expect(
      isInEnsamvargenSignalWindow(
        plannedStartTime,
        Date.parse("2026-08-10T19:58:30.000Z"),
      ),
    ).toBe(true);

    expect(
      isInEnsamvargenSignalWindow(
        plannedStartTime,
        Date.parse("2026-08-10T19:57:30.000Z"),
      ),
    ).toBe(false);

    expect(
      isInEnsamvargenSignalWindow(
        plannedStartTime,
        Date.parse("2026-08-10T19:59:30.000Z"),
      ),
    ).toBe(false);
  });
});
