import {
  RESEARCH_STORAGE_CONFIG_V1,
  type ResearchStorageConfig,
} from "./config";
import type {
  ResearchCaptureTarget,
  ResearchCombinedOddsPoint,
  ResearchCompactedOddsPoint,
  ResearchRawOddsObservation,
} from "./types";

const EPSILON = 0.001;

export function isValidResearchOdds(
  value: unknown,
  config: ResearchStorageConfig = RESEARCH_STORAGE_CONFIG_V1,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }

  if (value <= 0 || value > config.maxValidOddsDecimal) {
    return false;
  }

  return !config.invalidOddsDecimals.some(
    (invalid) => Math.abs(value - invalid) < EPSILON,
  );
}

export function combineResearchOddsObservations(args: {
  observations: ResearchRawOddsObservation[];
  config?: ResearchStorageConfig;
}): ResearchCombinedOddsPoint[] {
  const {
    observations,
    config = RESEARCH_STORAGE_CONFIG_V1,
  } = args;

  const grouped = new Map<
    string,
    ResearchCombinedOddsPoint
  >();

  const sorted = [...observations].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  for (const observation of sorted) {
    if (
      !Number.isFinite(observation.timestampMs) ||
      observation.timestampMs <= 0
    ) {
      continue;
    }

    if (!isValidResearchOdds(observation.oddsDecimal, config)) {
      continue;
    }

    const key = `${observation.runnerNumber}:${observation.timestampMs}`;
    const current = grouped.get(key) ?? {
      runnerNumber: observation.runnerNumber,
      horseId: observation.horseId,
      horseName: observation.horseName,
      timestampMs: observation.timestampMs,
      winOddsDecimal: null,
      placeOddsDecimal: null,
      scratched: observation.scratched,
      source: observation.source,
    };

    if (observation.market === "WIN") {
      current.winOddsDecimal = observation.oddsDecimal;
    } else {
      current.placeOddsDecimal = observation.oddsDecimal;
    }

    current.scratched =
      current.scratched || observation.scratched;

    if (current.horseId === null && observation.horseId !== null) {
      current.horseId = observation.horseId;
    }

    grouped.set(key, current);
  }

  return [...grouped.values()].sort(
    (a, b) =>
      a.runnerNumber - b.runnerNumber ||
      a.timestampMs - b.timestampMs,
  );
}

function selectNearestPoint(args: {
  points: ResearchCombinedOddsPoint[];
  targetTimestampMs: number;
  toleranceSeconds: number;
}): ResearchCombinedOddsPoint | null {
  const {
    points,
    targetTimestampMs,
    toleranceSeconds,
  } = args;

  const toleranceMs = toleranceSeconds * 1_000;

  const candidates = points
    .map((point) => ({
      point,
      differenceMs: Math.abs(
        point.timestampMs - targetTimestampMs,
      ),
      isBeforeOrAtTarget:
        point.timestampMs <= targetTimestampMs,
    }))
    .filter((candidate) => candidate.differenceMs <= toleranceMs)
    .sort((a, b) => {
      if (a.differenceMs !== b.differenceMs) {
        return a.differenceMs - b.differenceMs;
      }

      if (a.isBeforeOrAtTarget !== b.isBeforeOrAtTarget) {
        return a.isBeforeOrAtTarget ? -1 : 1;
      }

      return b.point.timestampMs - a.point.timestampMs;
    });

  return candidates[0]?.point ?? null;
}

function selectLatestAtOrBefore(args: {
  points: ResearchCombinedOddsPoint[];
  timestampMs: number;
  toleranceSeconds: number;
}): ResearchCombinedOddsPoint | null {
  const {
    points,
    timestampMs,
    toleranceSeconds,
  } = args;

  const toleranceMs = toleranceSeconds * 1_000;

  return (
    [...points]
      .filter((point) => point.timestampMs <= timestampMs)
      .filter(
        (point) =>
          timestampMs - point.timestampMs <= toleranceMs,
      )
      .sort((a, b) => b.timestampMs - a.timestampMs)[0] ??
    null
  );
}

function compactScheduledTarget(args: {
  points: ResearchCombinedOddsPoint[];
  plannedStartTimeMs: number;
  target: ResearchCaptureTarget;
  actualLockTimeMs: number | null;
}): ResearchCompactedOddsPoint | null {
  const {
    points,
    plannedStartTimeMs,
    target,
    actualLockTimeMs,
  } = args;

  const targetTimestampMs =
    plannedStartTimeMs -
    target.targetSecondsBeforeStart * 1_000;

  const point =
    target.captureType === "LOCK" &&
    actualLockTimeMs !== null
      ? selectLatestAtOrBefore({
          points,
          timestampMs: actualLockTimeMs,
          toleranceSeconds: target.toleranceSeconds,
        })
      : selectNearestPoint({
          points,
          targetTimestampMs,
          toleranceSeconds: target.toleranceSeconds,
        });

  if (!point || point.timestampMs >= plannedStartTimeMs) {
    return null;
  }

  const actualSecondsBeforeStart =
    (plannedStartTimeMs - point.timestampMs) / 1_000;

  return {
    runnerNumber: point.runnerNumber,
    horseId: point.horseId,
    horseName: point.horseName,
    captureType: target.captureType,
    targetSecondsBeforeStart:
      target.targetSecondsBeforeStart,
    pointTimestampMs: point.timestampMs,
    secondsBeforeStart: actualSecondsBeforeStart,
    sourceTimestampDeltaSeconds:
      actualSecondsBeforeStart -
      target.targetSecondsBeforeStart,
    winOddsDecimal: point.winOddsDecimal,
    placeOddsDecimal: point.placeOddsDecimal,
    scratched: point.scratched,
    source: point.source,
  };
}

export function compactResearchOddsHistory(args: {
  observations: ResearchRawOddsObservation[];
  plannedStartTimeMs: number;
  actualLockTimeMs?: number | null;
  config?: ResearchStorageConfig;
}): ResearchCompactedOddsPoint[] {
  const {
    observations,
    plannedStartTimeMs,
    actualLockTimeMs = null,
    config = RESEARCH_STORAGE_CONFIG_V1,
  } = args;

  if (!Number.isFinite(plannedStartTimeMs)) {
    return [];
  }

  const combined = combineResearchOddsObservations({
    observations,
    config,
  });

  const runnerNumbers = [
    ...new Set(combined.map((point) => point.runnerNumber)),
  ].sort((a, b) => a - b);

  const compacted: ResearchCompactedOddsPoint[] = [];

  for (const runnerNumber of runnerNumbers) {
    const runnerPoints = combined
      .filter((point) => point.runnerNumber === runnerNumber)
      .filter((point) => point.timestampMs < plannedStartTimeMs)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    if (!runnerPoints.length) {
      continue;
    }

    for (const target of config.permanentCaptureTargets) {
      const capture = compactScheduledTarget({
        points: runnerPoints,
        plannedStartTimeMs,
        target,
        actualLockTimeMs,
      });

      if (capture) {
        compacted.push(capture);
      }
    }

    const finalPoint = runnerPoints.at(-1);

    if (finalPoint) {
      compacted.push({
        runnerNumber: finalPoint.runnerNumber,
        horseId: finalPoint.horseId,
        horseName: finalPoint.horseName,
        captureType: "FINAL",
        targetSecondsBeforeStart: 0,
        pointTimestampMs: finalPoint.timestampMs,
        secondsBeforeStart:
          (plannedStartTimeMs - finalPoint.timestampMs) /
          1_000,
        sourceTimestampDeltaSeconds: null,
        winOddsDecimal: finalPoint.winOddsDecimal,
        placeOddsDecimal: finalPoint.placeOddsDecimal,
        scratched: finalPoint.scratched,
        source: finalPoint.source,
      });
    }
  }

  const captureOrder = new Map(
    [
      "START",
      "T30",
      "T15",
      "T10",
      "T9",
      "T8",
      "T7",
      "T6",
      "T5",
      "T4",
      "T3",
      "T2",
      "LOCK",
      "T1",
      "FINAL",
    ].map((captureType, index) => [captureType, index]),
  );

  return compacted.sort(
    (a, b) =>
      a.runnerNumber - b.runnerNumber ||
      (captureOrder.get(a.captureType) ?? 999) -
        (captureOrder.get(b.captureType) ?? 999) ||
      a.pointTimestampMs - b.pointTimestampMs,
  );
}
