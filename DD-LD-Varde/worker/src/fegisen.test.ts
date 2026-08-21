import { describe, expect, it } from "vitest";
import {
  evaluateFegisen,
  isInFegisenSignalWindow,
} from "./fegisen";
import type {
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

const START_TIME = "2026-08-21T18:00:00.000Z";
const START_MS = Date.parse(START_TIME);

function runner(
  number: number,
  odds: number,
  scratched = false,
): WinPlaceRunnerInput {
  return {
    number,
    name: `Häst ${number}`,
    horseId: 1000 + number,
    startLane: number,
    scratched,
    currentWinOddsDecimal: odds,
    indicatorsGreen: [],
    strength: 3,
    oddsHistory: [
      {
        odds: odds + 0.2,
        timestamp: START_MS - 10 * 60_000,
      },
      {
        odds,
        timestamp: START_MS - 90_000,
      },
    ],
  };
}

function field(
  count = 12,
  favoriteOdds = 2.45,
) {
  return Array.from(
    { length: count },
    (_, index) =>
      runner(
        index + 1,
        index === 2
          ? favoriteOdds
          : 3.5 + index * 0.2,
      ),
  );
}

describe("FEGISEN_V1.0", () => {
  it("väljer favoriten i oddsintervallet", () => {
    const result = evaluateFegisen({
      startMethod: "AUTO",
      isMonte: false,
      runners: field(12, 2.45),
    });

    expect(result.candidate?.runnerNumber).toBe(3);
    expect(result.candidate?.currentWinOdds).toBe(2.45);
    expect(result.excludedReason).toBeNull();
  });

  it("underkänner odds under 2,00", () => {
    expect(
      evaluateFegisen({
        startMethod: "AUTO",
        isMonte: false,
        runners: field(12, 1.99),
      }).candidate,
    ).toBeNull();
  });

  it("underkänner odds 3,00", () => {
    expect(
      evaluateFegisen({
        startMethod: "AUTO",
        isMonte: false,
        runners: field(12, 3),
      }).candidate,
    ).toBeNull();
  });

  it("underkänner galopp", () => {
    const result = evaluateFegisen({
      startMethod: "AUTO",
      isMonte: false,
      isGallop: true,
      runners: field(),
    });

    expect(result.active).toBe(false);
    expect(result.excludedReason).toBe("Galopplopp");
  });

  it("underkänner voltstart", () => {
    expect(
      evaluateFegisen({
        startMethod: "VOLT",
        isMonte: false,
        runners: field(),
      }).active,
    ).toBe(false);
  });

  it("underkänner strykning", () => {
    const runners = field();
    runners[8] = {
      ...runners[8],
      scratched: true,
    };

    const result = evaluateFegisen({
      startMethod: "AUTO",
      isMonte: false,
      runners,
    });

    expect(result.candidate).toBeNull();
    expect(result.excludedReason).toMatch(/Struken/);
  });

  it("kräver 10 till 12 hästar", () => {
    expect(
      evaluateFegisen({
        startMethod: "AUTO",
        isMonte: false,
        runners: field(9),
      }).candidate,
    ).toBeNull();

    expect(
      evaluateFegisen({
        startMethod: "AUTO",
        isMonte: false,
        runners: field(13),
      }).candidate,
    ).toBeNull();
  });

  it("använder T-120 till T-60", () => {
    expect(
      isInFegisenSignalWindow(
        START_TIME,
        START_MS - 90_000,
      ),
    ).toBe(true);

    expect(
      isInFegisenSignalWindow(
        START_TIME,
        START_MS - 130_000,
      ),
    ).toBe(false);

    expect(
      isInFegisenSignalWindow(
        START_TIME,
        START_MS - 50_000,
      ),
    ).toBe(false);
  });
});
