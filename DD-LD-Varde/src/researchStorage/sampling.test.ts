import { describe, expect, it } from "vitest";
import {
  combineResearchOddsObservations,
  compactResearchOddsHistory,
  isValidResearchOdds,
} from "./sampling";
import type {
  ResearchRawOddsObservation,
} from "./types";

const START_MS = Date.parse("2026-07-29T18:00:00.000Z");

function observation(args: {
  secondsBeforeStart: number;
  market: "WIN" | "PLACE";
  odds: number | null;
}): ResearchRawOddsObservation {
  return {
    runnerNumber: 4,
    horseId: 4004,
    horseName: "Forskningshästen",
    market: args.market,
    oddsDecimal: args.odds,
    timestampMs:
      START_MS - args.secondsBeforeStart * 1_000,
    scratched: false,
    source: "ATG",
  };
}

describe("researchStorage sampling", () => {
  it("accepterar normala odds men stoppar ogiltiga värden", () => {
    expect(isValidResearchOdds(6.25)).toBe(true);
    expect(isValidResearchOdds(0)).toBe(false);
    expect(isValidResearchOdds(-2)).toBe(false);
    expect(isValidResearchOdds(99.99)).toBe(false);
    expect(isValidResearchOdds(201)).toBe(false);
    expect(isValidResearchOdds(null)).toBe(false);
  });

  it("samlar WIN och PLACE på samma tidsrad", () => {
    const combined = combineResearchOddsObservations({
      observations: [
        observation({
          secondsBeforeStart: 600,
          market: "WIN",
          odds: 7.2,
        }),
        observation({
          secondsBeforeStart: 600,
          market: "PLACE",
          odds: 2.1,
        }),
      ],
    });

    expect(combined).toHaveLength(1);
    expect(combined[0].winOddsDecimal).toBe(7.2);
    expect(combined[0].placeOddsDecimal).toBe(2.1);
  });

  it("skapar permanent start-, slut- och sista-tio-minutersserie", () => {
    const targets = [
      3600,
      1800,
      900,
      600,
      540,
      480,
      420,
      360,
      300,
      240,
      180,
      120,
      90,
      60,
      20,
    ];

    const observations = targets.flatMap(
      (secondsBeforeStart, index) => [
        observation({
          secondsBeforeStart,
          market: "WIN",
          odds: 12 - index * 0.35,
        }),
        observation({
          secondsBeforeStart,
          market: "PLACE",
          odds: 3.5 - index * 0.05,
        }),
      ],
    );

    const compacted = compactResearchOddsHistory({
      observations,
      plannedStartTimeMs: START_MS,
      actualLockTimeMs: START_MS - 90_000,
    });

    const captureTypes = compacted.map(
      (point) => point.captureType,
    );

    expect(captureTypes).toContain("START");
    expect(captureTypes).toContain("T30");
    expect(captureTypes).toContain("T15");
    expect(captureTypes).toContain("T10");
    expect(captureTypes).toContain("T5");
    expect(captureTypes).toContain("T2");
    expect(captureTypes).toContain("LOCK");
    expect(captureTypes).toContain("T1");
    expect(captureTypes).toContain("FINAL");

    const lock = compacted.find(
      (point) => point.captureType === "LOCK",
    );

    expect(lock?.secondsBeforeStart).toBe(90);
    expect(lock?.winOddsDecimal).not.toBeNull();
    expect(lock?.placeOddsDecimal).not.toBeNull();

    const final = compacted.find(
      (point) => point.captureType === "FINAL",
    );

    expect(final?.secondsBeforeStart).toBe(20);
  });

  it("använder aldrig en oddspunkt efter faktisk låstid som LOCK", () => {
    const observations = [
      observation({
        secondsBeforeStart: 100,
        market: "WIN",
        odds: 6.5,
      }),
      observation({
        secondsBeforeStart: 80,
        market: "WIN",
        odds: 5.5,
      }),
    ];

    const compacted = compactResearchOddsHistory({
      observations,
      plannedStartTimeMs: START_MS,
      actualLockTimeMs: START_MS - 90_000,
    });

    const lock = compacted.find(
      (point) => point.captureType === "LOCK",
    );

    expect(lock?.secondsBeforeStart).toBe(100);
    expect(lock?.winOddsDecimal).toBe(6.5);
  });
});

describe("researchStorage LOCK-datakvalitet", () => {
  it("använder inte en gammal punkt som låspunkt", () => {
    const observations = [
      observation({
        secondsBeforeStart: 600,
        market: "WIN",
        odds: 8,
      }),
    ];

    const compacted = compactResearchOddsHistory({
      observations,
      plannedStartTimeMs: START_MS,
      actualLockTimeMs: START_MS - 90_000,
    });

    expect(
      compacted.find(
        (point) => point.captureType === "LOCK",
      ),
    ).toBeUndefined();
  });
});
