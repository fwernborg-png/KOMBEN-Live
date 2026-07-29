import {
  RESEARCH_STORAGE_CONFIG_V1,
  type ResearchStorageConfig,
} from "./config";
import { isValidResearchOdds } from "./sampling";
import type {
  ResearchMarketShare,
  ResearchRunnerMetricInput,
  ResearchRunnerOddsMetrics,
  ResearchWinOddsPoint,
} from "./types";

function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function coefficientOfVariationPercent(
  values: number[],
): number | null {
  if (values.length < 2) {
    return null;
  }

  const mean = average(values);

  if (mean === null || mean <= 0) {
    return null;
  }

  const variance =
    values.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0,
    ) / values.length;

  return (Math.sqrt(variance) / mean) * 100;
}

function percentDrop(
  startOdds: number | null,
  endOdds: number | null,
): number | null {
  if (
    startOdds === null ||
    endOdds === null ||
    startOdds <= 0
  ) {
    return null;
  }

  return ((startOdds - endOdds) / startOdds) * 100;
}

function impliedProbability(
  odds: number | null,
): number | null {
  if (odds === null || odds <= 0) {
    return null;
  }

  return 1 / odds;
}

function latestAtOrBefore(
  points: ResearchWinOddsPoint[],
  timestampMs: number,
): ResearchWinOddsPoint | null {
  return (
    [...points]
      .filter((point) => point.timestamp <= timestampMs)
      .sort((a, b) => b.timestamp - a.timestamp)[0] ??
    null
  );
}

function nearestPoint(
  points: ResearchWinOddsPoint[],
  timestampMs: number,
  toleranceSeconds: number,
): ResearchWinOddsPoint | null {
  const toleranceMs = toleranceSeconds * 1_000;

  return (
    [...points]
      .map((point) => ({
        point,
        distance: Math.abs(point.timestamp - timestampMs),
        before: point.timestamp <= timestampMs,
      }))
      .filter(
        (candidate) =>
          candidate.distance <= toleranceMs,
      )
      .sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }

        if (a.before !== b.before) {
          return a.before ? -1 : 1;
        }

        return b.point.timestamp - a.point.timestamp;
      })[0]?.point ?? null
  );
}

function linearRegressionSlopePerMinute(
  points: ResearchWinOddsPoint[],
): number | null {
  if (points.length < 2) {
    return null;
  }

  const firstTimestamp = points[0].timestamp;

  const pairs = points.map((point) => ({
    x: (point.timestamp - firstTimestamp) / 60_000,
    y: point.odds,
  }));

  const meanX = average(pairs.map((pair) => pair.x));
  const meanY = average(pairs.map((pair) => pair.y));

  if (meanX === null || meanY === null) {
    return null;
  }

  const numerator = pairs.reduce(
    (sum, pair) =>
      sum + (pair.x - meanX) * (pair.y - meanY),
    0,
  );

  const denominator = pairs.reduce(
    (sum, pair) => sum + (pair.x - meanX) ** 2,
    0,
  );

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function calculateStepMetrics(
  points: ResearchWinOddsPoint[],
) {
  let drops = 0;
  let rises = 0;
  let unchanged = 0;

  let largestDrop: number | null = null;
  let largestRise: number | null = null;
  let largestRebound: number | null = null;

  let runningMinimum: number | null = null;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index].odds;

    runningMinimum =
      runningMinimum === null
        ? current
        : Math.min(runningMinimum, current);

    if (runningMinimum > 0 && current > runningMinimum) {
      const rebound =
        ((current - runningMinimum) / runningMinimum) * 100;

      largestRebound =
        largestRebound === null
          ? rebound
          : Math.max(largestRebound, rebound);
    }

    if (index === 0) {
      continue;
    }

    const previous = points[index - 1].odds;
    const difference = current - previous;

    if (Math.abs(difference) < 0.000001) {
      unchanged += 1;
      continue;
    }

    if (difference < 0) {
      drops += 1;
      const dropPercent =
        ((previous - current) / previous) * 100;

      largestDrop =
        largestDrop === null
          ? dropPercent
          : Math.max(largestDrop, dropPercent);
    } else {
      rises += 1;
      const risePercent =
        ((current - previous) / previous) * 100;

      largestRise =
        largestRise === null
          ? risePercent
          : Math.max(largestRise, risePercent);
    }
  }

  return {
    drops,
    rises,
    unchanged,
    largestDrop,
    largestRise,
    largestRebound,
  };
}

function dropFromWindow(args: {
  points: ResearchWinOddsPoint[];
  plannedStartTimeMs: number;
  finalOdds: number | null;
  minutes: number;
}): number | null {
  const {
    points,
    plannedStartTimeMs,
    finalOdds,
    minutes,
  } = args;

  const target = nearestPoint(
    points,
    plannedStartTimeMs - minutes * 60_000,
    90,
  );

  return percentDrop(target?.odds ?? null, finalOdds);
}

export function computeResearchRunnerMetrics(args: {
  runner: ResearchRunnerMetricInput;
  plannedStartTimeMs: number;
  actualLockTimeMs: number;
  config?: ResearchStorageConfig;
}): ResearchRunnerOddsMetrics {
  const {
    runner,
    plannedStartTimeMs,
    actualLockTimeMs,
    config = RESEARCH_STORAGE_CONFIG_V1,
  } = args;

  const points = [...runner.oddsHistory]
    .filter(
      (point) =>
        point.timestamp < plannedStartTimeMs &&
        isValidResearchOdds(point.odds, config),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const startPoint = points[0] ?? null;
  const lockPoint = latestAtOrBefore(
    points,
    actualLockTimeMs,
  );
  const finalPoint = points.at(-1) ?? null;

  const values = points.map((point) => point.odds);
  const last10Values = points
    .filter(
      (point) =>
        point.timestamp >=
        plannedStartTimeMs - 10 * 60_000,
    )
    .map((point) => point.odds);

  const stepMetrics = calculateStepMetrics(points);

  return {
    runnerNumber: runner.runnerNumber,
    horseId: runner.horseId,
    horseName: runner.horseName,

    validOddsPoints: points.length,

    startOdds: startPoint?.odds ?? null,
    lockOdds: lockPoint?.odds ?? null,
    finalOdds: finalPoint?.odds ?? null,

    startOddsTimestampMs: startPoint?.timestamp ?? null,
    lockOddsTimestampMs: lockPoint?.timestamp ?? null,
    finalOddsTimestampMs: finalPoint?.timestamp ?? null,

    oddsDropToLockPercent: percentDrop(
      startPoint?.odds ?? null,
      lockPoint?.odds ?? null,
    ),
    oddsDropToFinalPercent: percentDrop(
      startPoint?.odds ?? null,
      finalPoint?.odds ?? null,
    ),
    oddsDropLast10MinutesPercent: dropFromWindow({
      points,
      plannedStartTimeMs,
      finalOdds: finalPoint?.odds ?? null,
      minutes: 10,
    }),
    oddsDropLast5MinutesPercent: dropFromWindow({
      points,
      plannedStartTimeMs,
      finalOdds: finalPoint?.odds ?? null,
      minutes: 5,
    }),
    oddsDropLast2MinutesPercent: dropFromWindow({
      points,
      plannedStartTimeMs,
      finalOdds: finalPoint?.odds ?? null,
      minutes: 2,
    }),

    minimumOdds: values.length ? Math.min(...values) : null,
    maximumOdds: values.length ? Math.max(...values) : null,
    meanOdds: average(values),

    cvPercent: coefficientOfVariationPercent(values),
    cvLast10MinutesPercent:
      coefficientOfVariationPercent(last10Values),

    oddsDropsCount: stepMetrics.drops,
    oddsRisesCount: stepMetrics.rises,
    oddsUnchangedCount: stepMetrics.unchanged,

    largestSingleDropPercent:
      stepMetrics.largestDrop,
    largestSingleRisePercent:
      stepMetrics.largestRise,
    largestReboundPercent:
      stepMetrics.largestRebound,

    trendSlopeOddsPerMinute:
      linearRegressionSlopePerMinute(points),

    impliedProbabilityStart:
      impliedProbability(startPoint?.odds ?? null),
    impliedProbabilityLock:
      impliedProbability(lockPoint?.odds ?? null),
    impliedProbabilityFinal:
      impliedProbability(finalPoint?.odds ?? null),

    oddsDropRank: null,
    smoothnessRank: null,
    lockMarketRank: null,

    isMostShortened: false,
    isSmoothest: false,
    isFavoriteAtLock: false,

    topOddsDropGapToSecond: null,
    topSmoothnessGapToSecond: null,
  };
}

export function computeNormalizedMarketShares(
  runners: Array<{
    runnerNumber: number;
    oddsDecimal: number | null;
  }>,
  config: ResearchStorageConfig =
    RESEARCH_STORAGE_CONFIG_V1,
): ResearchMarketShare[] {
  const valid = runners
    .filter(
      (
        runner,
      ): runner is {
        runnerNumber: number;
        oddsDecimal: number;
      } =>
        isValidResearchOdds(
          runner.oddsDecimal,
          config,
        ),
    )
    .map((runner) => ({
      ...runner,
      rawImpliedProbability: 1 / runner.oddsDecimal,
    }));

  const total = valid.reduce(
    (sum, runner) =>
      sum + runner.rawImpliedProbability,
    0,
  );

  if (total <= 0) {
    return [];
  }

  return valid
    .sort(
      (a, b) =>
        a.oddsDecimal - b.oddsDecimal ||
        a.runnerNumber - b.runnerNumber,
    )
    .map((runner, index) => ({
      runnerNumber: runner.runnerNumber,
      oddsDecimal: runner.oddsDecimal,
      rawImpliedProbability:
        runner.rawImpliedProbability,
      normalizedMarketShare:
        runner.rawImpliedProbability / total,
      marketRank: index + 1,
    }));
}

export function rankResearchRunnerMetrics(
  metrics: ResearchRunnerOddsMetrics[],
): ResearchRunnerOddsMetrics[] {
  const dropRanking = metrics
    .filter(
      (
        metric,
      ): metric is ResearchRunnerOddsMetrics & {
        oddsDropToLockPercent: number;
      } => metric.oddsDropToLockPercent !== null,
    )
    .sort(
      (a, b) =>
        b.oddsDropToLockPercent -
          a.oddsDropToLockPercent ||
        (a.lockOdds ?? Number.POSITIVE_INFINITY) -
          (b.lockOdds ?? Number.POSITIVE_INFINITY) ||
        a.runnerNumber - b.runnerNumber,
    );

  const smoothnessRanking = metrics
    .filter(
      (
        metric,
      ): metric is ResearchRunnerOddsMetrics & {
        cvPercent: number;
      } => metric.cvPercent !== null,
    )
    .sort(
      (a, b) =>
        a.cvPercent - b.cvPercent ||
        a.runnerNumber - b.runnerNumber,
    );

  const marketRanking = metrics
    .filter(
      (
        metric,
      ): metric is ResearchRunnerOddsMetrics & {
        lockOdds: number;
      } => metric.lockOdds !== null,
    )
    .sort(
      (a, b) =>
        a.lockOdds - b.lockOdds ||
        a.runnerNumber - b.runnerNumber,
    );

  const dropRankByRunner = new Map(
    dropRanking.map((metric, index) => [
      metric.runnerNumber,
      index + 1,
    ]),
  );

  const smoothnessRankByRunner = new Map(
    smoothnessRanking.map((metric, index) => [
      metric.runnerNumber,
      index + 1,
    ]),
  );

  const marketRankByRunner = new Map(
    marketRanking.map((metric, index) => [
      metric.runnerNumber,
      index + 1,
    ]),
  );

  const topDropGap =
    dropRanking.length >= 2
      ? dropRanking[0].oddsDropToLockPercent -
        dropRanking[1].oddsDropToLockPercent
      : null;

  const topSmoothnessGap =
    smoothnessRanking.length >= 2
      ? smoothnessRanking[1].cvPercent -
        smoothnessRanking[0].cvPercent
      : null;

  return metrics
    .map((metric) => {
      const oddsDropRank =
        dropRankByRunner.get(metric.runnerNumber) ?? null;

      const smoothnessRank =
        smoothnessRankByRunner.get(
          metric.runnerNumber,
        ) ?? null;

      const lockMarketRank =
        marketRankByRunner.get(
          metric.runnerNumber,
        ) ?? null;

      return {
        ...metric,
        oddsDropRank,
        smoothnessRank,
        lockMarketRank,
        isMostShortened: oddsDropRank === 1,
        isSmoothest: smoothnessRank === 1,
        isFavoriteAtLock: lockMarketRank === 1,
        topOddsDropGapToSecond: topDropGap,
        topSmoothnessGapToSecond:
          topSmoothnessGap,
      };
    })
    .sort(
      (a, b) => a.runnerNumber - b.runnerNumber,
    );
}
