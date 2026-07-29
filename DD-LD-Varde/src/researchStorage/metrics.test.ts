import { describe, expect, it } from "vitest";
import {
  computeNormalizedMarketShares,
  computeResearchRunnerMetrics,
  rankResearchRunnerMetrics,
} from "./metrics";
import type {
  ResearchRunnerMetricInput,
} from "./types";

const START_MS = Date.parse("2026-07-29T18:00:00.000Z");
const LOCK_MS = START_MS - 90_000;

function runner(
  runnerNumber: number,
  values: Array<[number, number]>,
): ResearchRunnerMetricInput {
  return {
    runnerNumber,
    horseId: 1000 + runnerNumber,
    horseName: `Häst ${runnerNumber}`,
    scratched: false,
    oddsHistory: values.map(
      ([secondsBeforeStart, odds]) => ({
        odds,
        timestamp:
          START_MS - secondsBeforeStart * 1_000,
      }),
    ),
  };
}

describe("researchStorage metrics", () => {
  it("räknar sänkning, jämnhet, rörelser och trend", () => {
    const metrics = computeResearchRunnerMetrics({
      runner: runner(1, [
        [3600, 10],
        [600, 9],
        [300, 8],
        [120, 7],
        [90, 7],
        [20, 6],
      ]),
      plannedStartTimeMs: START_MS,
      actualLockTimeMs: LOCK_MS,
    });

    expect(metrics.startOdds).toBe(10);
    expect(metrics.lockOdds).toBe(7);
    expect(metrics.finalOdds).toBe(6);

    expect(metrics.oddsDropToLockPercent).toBeCloseTo(
      30,
      8,
    );
    expect(metrics.oddsDropToFinalPercent).toBeCloseTo(
      40,
      8,
    );

    expect(metrics.validOddsPoints).toBe(6);
    expect(metrics.oddsDropsCount).toBe(4);
    expect(metrics.oddsRisesCount).toBe(0);
    expect(metrics.oddsUnchangedCount).toBe(1);

    expect(metrics.minimumOdds).toBe(6);
    expect(metrics.maximumOdds).toBe(10);
    expect(metrics.cvPercent).not.toBeNull();
    expect(metrics.trendSlopeOddsPerMinute).toBeLessThan(
      0,
    );
  });

  it("ignorerar ogiltiga odds utan att förstöra serien", () => {
    const metrics = computeResearchRunnerMetrics({
      runner: runner(2, [
        [3600, 12],
        [1800, 99.99],
        [600, 8],
        [90, 6],
      ]),
      plannedStartTimeMs: START_MS,
      actualLockTimeMs: LOCK_MS,
    });

    expect(metrics.validOddsPoints).toBe(3);
    expect(metrics.startOdds).toBe(12);
    expect(metrics.lockOdds).toBe(6);
    expect(metrics.oddsDropToLockPercent).toBeCloseTo(
      50,
      8,
    );
  });

  it("rankar mest sänkt, jämnast och favorit separat", () => {
    const base = [
      computeResearchRunnerMetrics({
        runner: runner(1, [
          [3600, 10],
          [600, 8],
          [90, 6],
        ]),
        plannedStartTimeMs: START_MS,
        actualLockTimeMs: LOCK_MS,
      }),
      computeResearchRunnerMetrics({
        runner: runner(2, [
          [3600, 9],
          [600, 8.5],
          [90, 8],
        ]),
        plannedStartTimeMs: START_MS,
        actualLockTimeMs: LOCK_MS,
      }),
      computeResearchRunnerMetrics({
        runner: runner(3, [
          [3600, 5],
          [600, 5],
          [90, 5],
        ]),
        plannedStartTimeMs: START_MS,
        actualLockTimeMs: LOCK_MS,
      }),
    ];

    const ranked = rankResearchRunnerMetrics(base);

    const first = ranked.find(
      (metric) => metric.runnerNumber === 1,
    );
    const third = ranked.find(
      (metric) => metric.runnerNumber === 3,
    );

    expect(first?.isMostShortened).toBe(true);
    expect(first?.oddsDropRank).toBe(1);
    expect(first?.topOddsDropGapToSecond).toBeGreaterThan(
      0,
    );

    expect(third?.isSmoothest).toBe(true);
    expect(third?.isFavoriteAtLock).toBe(true);
    expect(third?.smoothnessRank).toBe(1);
    expect(third?.lockMarketRank).toBe(1);
  });

  it("normaliserar marknadsandelarna till ett", () => {
    const shares = computeNormalizedMarketShares([
      { runnerNumber: 1, oddsDecimal: 2 },
      { runnerNumber: 2, oddsDecimal: 4 },
      { runnerNumber: 3, oddsDecimal: 8 },
    ]);

    const total = shares.reduce(
      (sum, share) =>
        sum + share.normalizedMarketShare,
      0,
    );

    expect(total).toBeCloseTo(1, 12);
    expect(shares[0].runnerNumber).toBe(1);
    expect(shares[0].marketRank).toBe(1);
  });
});

describe("researchStorage tidsfönster", () => {
  it("räknar inte sista tio minuterna från en avlägsen punkt", () => {
    const metrics = computeResearchRunnerMetrics({
      runner: runner(9, [
        [3600, 10],
        [20, 6],
      ]),
      plannedStartTimeMs: START_MS,
      actualLockTimeMs: LOCK_MS,
    });

    expect(
      metrics.oddsDropLast10MinutesPercent,
    ).toBeNull();

    expect(
      metrics.oddsDropLast5MinutesPercent,
    ).toBeNull();

    expect(
      metrics.oddsDropLast2MinutesPercent,
    ).toBeNull();
  });
});
