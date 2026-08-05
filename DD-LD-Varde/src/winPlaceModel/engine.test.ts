import { describe, expect, it } from "vitest";
import {
  SMALLKARAMELL_RULE_CONFIG_V1,
  WIN_PLACE_RULE_CONFIG_V1,
  isInWinPlaceFinalSignalWindow,
} from "./config";
import { evaluateWinPlaceModelAtLock } from "./engine";
import type { WinPlaceRunnerInput } from "./types";

const START_TIME = "2026-07-29T18:00:00.000Z";
const START_MS = Date.parse(START_TIME);
const LOCK_MS = START_MS - 90_000;

function makeRace(overrides = {}) {
  return {
    raceId: "race-1",
    date: "2026-07-29",
    trackId: 1,
    trackName: "Solvalla",
    raceNumber: 5,
    plannedStartTime: START_TIME,
    raceStatus: "scheduled",
    isMonte: false,
    startMethod: "AUTO",
    distanceMeters: 2140,
    starters: 10,
    ...overrides,
  };
}

function history(values: number[]) {
  const offsetsMinutes = [60, 45, 30, 15, 5, 1.5];

  return values.map((odds, index) => ({
    odds,
    timestamp:
      START_MS -
      (offsetsMinutes[index] ?? 1.5) * 60_000,
  }));
}

function runner(args: {
  number: number;
  values: number[];
  scratched?: boolean;
}): WinPlaceRunnerInput {
  return {
    number: args.number,
    name: `Häst ${args.number}`,
    horseId: 1000 + args.number,
    startLane: args.number,
    scratched: args.scratched ?? false,
    currentWinOddsDecimal:
      args.values[args.values.length - 1] ?? null,
    indicatorsGreen: ["KR", "ODD"],
    strength: 2,
    oddsHistory: history(args.values),
  };
}

function evaluate(runners: WinPlaceRunnerInput[], raceOverrides = {}) {
  return evaluateWinPlaceModelAtLock({
    race: makeRace(raceOverrides),
    runners,
    nowMs: LOCK_MS,
    config: WIN_PLACE_RULE_CONFIG_V1,
  });
}

describe("WIN_PLACE_V1.0", () => {
  it("godkänner exakt 30 procent sänkning och odds 6,00", () => {
    const result = evaluate([
      runner({
        number: 1,
        values: [8.5714285714, 8.2, 7.8, 7.2, 6.5, 6],
      }),
      runner({
        number: 2,
        values: [10, 9.8, 9.6, 9.4, 9.2, 9],
      }),
    ]);

    expect(result.decision).toBe("PLAY");
    expect(result.mostShortened?.runnerNumber).toBe(1);
    expect(result.mostShortened?.currentWinOdds).toBe(6);
    expect(result.mostShortened?.oddsDropPercent).toBeCloseTo(
      30,
      5,
    );
  });

  it("underkänner 29,9 procent sänkning", () => {
    const result = evaluate([
      runner({
        number: 1,
        values: [10, 9.5, 9, 8.2, 7.5, 7.01],
      }),
    ]);

    expect(result.decision).toBe("NO_PLAY");
    expect(result.mostShortened?.oddsDropPercent).toBeCloseTo(
      29.9,
      5,
    );
  });

  it("underkänner odds 6,01", () => {
    const result = evaluate([
      runner({
        number: 1,
        values: [10, 9, 8, 7, 6.5, 6.01],
      }),
    ]);

    expect(result.decision).toBe("NO_PLAY");
    expect(result.reasons.join(" ")).toMatch(/6\.01/);
  });

  it("väljer inte näst mest sänkta när mest sänkta har för högt odds", () => {
    const result = evaluate([
      runner({
        number: 1,
        values: [12, 11, 10, 9, 8, 6.5],
      }),
      runner({
        number: 2,
        values: [8, 7.5, 7, 6.5, 5.8, 5.2],
      }),
    ]);

    expect(result.mostShortened?.runnerNumber).toBe(1);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("tar bort struken häst före rangordningen", () => {
    const result = evaluate([
      runner({
        number: 1,
        values: [12, 10, 8, 7, 6, 5],
        scratched: true,
      }),
      runner({
        number: 2,
        values: [8, 7.5, 7, 6.5, 6, 5.5],
      }),
    ]);

    expect(result.mostShortened?.runnerNumber).toBe(2);
    expect(result.decision).toBe("PLAY");
  });

  it("ignorerar ogiltigt odds 99,99", () => {
    const result = evaluate([
      runner({
        number: 1,
        values: [99.99, 99.99, 99.99, 99.99, 99.99, 5],
      }),
      runner({
        number: 2,
        values: [10, 9, 8, 7, 6.5, 6],
      }),
    ]);

    expect(result.mostShortened?.runnerNumber).toBe(2);
    expect(result.decision).toBe("PLAY");
  });

  it("utesluter montélopp", () => {
    const result = evaluate(
      [
        runner({
          number: 1,
          values: [10, 9, 8, 7, 6, 5],
        }),
      ],
      { isMonte: true },
    );

    expect(result.decision).toBe("EXCLUDED");
  });

  it("blockerar när hela oddshistoriken inte är komplett", () => {
    const result = evaluateWinPlaceModelAtLock({
      race: makeRace(),
      runners: [
        runner({
          number: 1,
          values: [10, 9, 8, 7, 6, 5],
        }),
      ],
      nowMs: LOCK_MS,
      config: WIN_PLACE_RULE_CONFIG_V1,
      hasCompleteOddsHistory: false,
    });

    expect(result.decision).toBe("NO_PLAY");
  });

  it("öppnar slutligt signalfönster mellan 120 och 60 sekunder", () => {
    expect(
      isInWinPlaceFinalSignalWindow(
        START_TIME,
        START_MS - 121_000,
      ),
    ).toBe(false);

    expect(
      isInWinPlaceFinalSignalWindow(
        START_TIME,
        START_MS - 120_000,
      ),
    ).toBe(true);

    expect(
      isInWinPlaceFinalSignalWindow(
        START_TIME,
        START_MS - 90_000,
      ),
    ).toBe(true);

    expect(
      isInWinPlaceFinalSignalWindow(
        START_TIME,
        START_MS - 60_000,
      ),
    ).toBe(true);

    expect(
      isInWinPlaceFinalSignalWindow(
        START_TIME,
        START_MS - 59_000,
      ),
    ).toBe(false);
  });
});


describe("SMALLKARAMELL_S2_V1.0", () => {
  function evaluateSmall(runners: WinPlaceRunnerInput[]) {
    return evaluateWinPlaceModelAtLock({
      race: makeRace(),
      runners,
      nowMs: LOCK_MS,
      config: SMALLKARAMELL_RULE_CONFIG_V1,
    });
  }

  it("väljer exakt S2 och godkänner odds 7,00", () => {
    const result = evaluateSmall([
      runner({ number: 1, values: [20, 18, 16, 14, 12, 10] }),
      runner({ number: 2, values: [10, 9.5, 9, 8, 7.5, 7] }),
      runner({ number: 3, values: [10, 9.9, 9.8, 9.7, 9.5, 9.4] }),
    ]);

    expect(result.decision).toBe("PLAY");
    expect(result.mostShortened?.runnerNumber).toBe(1);
    expect(result.selectedCandidate?.runnerNumber).toBe(2);
    expect(result.selectedCandidate?.currentWinOdds).toBe(7);
  });

  it("underkänner S2 på odds 7,01 utan att byta till en annan häst", () => {
    const result = evaluateSmall([
      runner({ number: 1, values: [20, 18, 16, 14, 12, 10] }),
      runner({ number: 2, values: [10, 9.5, 9, 8, 7.5, 7.01] }),
      runner({ number: 3, values: [10, 9.9, 9.8, 9.7, 9.5, 9.4] }),
    ]);

    expect(result.selectedCandidate?.runnerNumber).toBe(2);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("tar bort struken häst före S2-rangordningen", () => {
    const result = evaluateSmall([
      runner({
        number: 1,
        values: [20, 16, 12, 10, 8, 6],
        scratched: true,
      }),
      runner({ number: 2, values: [12, 11, 10, 9, 8, 6] }),
      runner({ number: 3, values: [10, 9.7, 9.2, 8.7, 8.2, 7] }),
    ]);

    expect(result.mostShortened?.runnerNumber).toBe(2);
    expect(result.selectedCandidate?.runnerNumber).toBe(3);
    expect(result.decision).toBe("PLAY");
  });

  it("skapar ingen S2 när hela aktiva fältet inte har giltig historik", () => {
    const incomplete = runner({ number: 3, values: [10, 9, 8, 7] });
    const result = evaluateSmall([
      runner({ number: 1, values: [20, 18, 16, 14, 12, 10] }),
      runner({ number: 2, values: [10, 9.5, 9, 8, 7.5, 7] }),
      incomplete,
    ]);

    expect(result.decision).toBe("INSUFFICIENT_DATA");
    expect(result.selectedCandidate).toBeNull();
  });
});
