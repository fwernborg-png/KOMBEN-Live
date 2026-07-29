import {
  getWinPlaceCollectionStartMs,
  getWinPlacePlannedLockTimeMs,
} from "./config";
import type {
  WinPlaceCandidate,
  WinPlaceEvaluation,
  WinPlaceRuleCheck,
  WinPlaceRunnerInput,
} from "./types";
import type { WinPlaceRuleConfig } from "./config";

const INVALID_ODDS_DECIMALS = new Set([99.99]);

function isValidOddsDecimal(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) return false;
  if (value <= 0 || value > 200) return false;

  for (const invalid of INVALID_ODDS_DECIMALS) {
    if (Math.abs(value - invalid) < 0.001) return false;
  }

  return true;
}

function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return null;

  const average =
    values.reduce((sum, value) => sum + value, 0) / values.length;

  if (!Number.isFinite(average) || average <= 0) {
    return null;
  }

  const variance =
    values.reduce(
      (sum, value) => sum + (value - average) ** 2,
      0,
    ) / values.length;

  return (Math.sqrt(variance) / average) * 100;
}

function containsCancelledStatus(status?: string) {
  if (!status) return false;
  return /install|inst[äa]lld|inst[äa]llt|cancel/i.test(status);
}

function buildCandidates(args: {
  runners: WinPlaceRunnerInput[];
  plannedStartTime: string;
  nowMs: number;
  config: WinPlaceRuleConfig;
}) {
  const { runners, plannedStartTime, nowMs, config } = args;
  const collectionStartMs = getWinPlaceCollectionStartMs(
    plannedStartTime,
    config,
  );

  return runners
    .filter((runner) => !runner.scratched)
    .map((runner): WinPlaceCandidate | null => {
      const validHistory = runner.oddsHistory
        .filter(
          (point) =>
            point.timestamp >= collectionStartMs &&
            point.timestamp <= nowMs &&
            isValidOddsDecimal(point.odds),
        )
        .sort((a, b) => a.timestamp - b.timestamp);

      if (validHistory.length < config.minValidOddsPoints) {
        return null;
      }

      const values = validHistory.map((point) => point.odds);
      const startOdds = values[0];
      const latestHistoryOdds = values[values.length - 1];
      const currentWinOdds = isValidOddsDecimal(latestHistoryOdds)
        ? latestHistoryOdds
        : runner.currentWinOddsDecimal;

      if (
        !isValidOddsDecimal(startOdds) ||
        !isValidOddsDecimal(currentWinOdds)
      ) {
        return null;
      }

      const cvRaw = coefficientOfVariation(values);

      if (cvRaw === null) {
        return null;
      }

      const oddsDropPercent =
        ((startOdds - currentWinOdds) / startOdds) * 100;

      return {
        runnerNumber: runner.number,
        runnerName: runner.name,
        horseId: runner.horseId ?? null,
        startLane: runner.startLane,
        startOdds,
        currentWinOdds,
        oddsDropPercent,
        validOddsPoints: validHistory.length,
        cvRaw,
        cvDisplay: Number(cvRaw.toFixed(2)),
        strength: runner.strength,
        indicatorsGreen: runner.indicatorsGreen,
      };
    })
    .filter(
      (candidate): candidate is WinPlaceCandidate =>
        candidate !== null,
    )
    .sort((a, b) => {
      if (a.oddsDropPercent !== b.oddsDropPercent) {
        return b.oddsDropPercent - a.oddsDropPercent;
      }

      if (a.currentWinOdds !== b.currentWinOdds) {
        return a.currentWinOdds - b.currentWinOdds;
      }

      return a.runnerNumber - b.runnerNumber;
    });
}

function failedReasons(checks: WinPlaceRuleCheck[]) {
  return checks
    .filter((check) => !check.passed)
    .map((check) => check.message);
}

export function evaluateWinPlaceModelAtLock(args: {
  race: WinPlaceEvaluation["race"];
  runners: WinPlaceRunnerInput[];
  nowMs: number;
  config: WinPlaceRuleConfig;
  hasCompleteOddsHistory?: boolean;
  hasFreshCurrentOddsPoint?: boolean;
}): WinPlaceEvaluation {
  const {
    race,
    runners,
    nowMs,
    config,
    hasCompleteOddsHistory = true,
    hasFreshCurrentOddsPoint = true,
  } = args;

  const nowIso = new Date(nowMs).toISOString();
  const startMs = Date.parse(race.plannedStartTime);
  const plannedLockTimeMs = getWinPlacePlannedLockTimeMs(
    race.plannedStartTime,
    config,
  );
  const secondsBeforeStartAtLock = Number.isFinite(startMs)
    ? Math.max(0, (startMs - nowMs) / 1_000)
    : 0;

  const checks: WinPlaceRuleCheck[] = [];
  const excludedByMonte = config.excludeMonte && race.isMonte;
  const cancelled = containsCancelledStatus(race.raceStatus);

  checks.push({
    key: "NOT_MONTE",
    passed: !excludedByMonte,
    message: excludedByMonte
      ? "INGET SPEL – MONTÉLOPP"
      : "Loppet är inte monté",
  });

  checks.push({
    key: "NOT_CANCELLED",
    passed: !cancelled,
    message: cancelled
      ? "INGET SPEL – INSTÄLLT LOPP"
      : "Loppet är aktivt",
  });

  checks.push({
    key: "ODDS_HISTORY_COMPLETE",
    passed: hasCompleteOddsHistory,
    message: hasCompleteOddsHistory
      ? "Oddshistoriken är komplett"
      : "INGET SPEL – OFULLSTÄNDIG ODDHISTORIK",
  });

  checks.push({
    key: "CURRENT_ODDS_POINT_AVAILABLE",
    passed: hasFreshCurrentOddsPoint,
    message: hasFreshCurrentOddsPoint
      ? "Aktuell oddspunkt finns"
      : "INGET SPEL – AKTUELL ODDSPUNKT SAKNAS",
  });

  if (
    excludedByMonte ||
    cancelled ||
    !hasCompleteOddsHistory ||
    !hasFreshCurrentOddsPoint
  ) {
    return {
      raceId: race.raceId,
      ruleVersion: config.ruleVersion,
      decision: excludedByMonte ? "EXCLUDED" : "NO_PLAY",
      reasons: failedReasons(checks),
      race,
      plannedLockTimeMs,
      actualLockTimeMs: nowMs,
      lockedAt: nowIso,
      secondsBeforeStartAtLock,
      configSnapshot: config,
      checks,
      mostShortened: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      snapshot: {
        runnersCount: runners.length,
      },
    };
  }

  const candidates = buildCandidates({
    runners,
    plannedStartTime: race.plannedStartTime,
    nowMs,
    config,
  });

  const mostShortened = candidates[0] ?? null;

  checks.push({
    key: "MOST_SHORTENED_FOUND",
    passed: mostShortened !== null,
    message: mostShortened
      ? `Mest sänkt är nummer ${mostShortened.runnerNumber}`
      : "INGET SPEL – INGEN GILTIG MEST SÄNKT HÄST",
  });

  if (!mostShortened) {
    return {
      raceId: race.raceId,
      ruleVersion: config.ruleVersion,
      decision: "INSUFFICIENT_DATA",
      reasons: failedReasons(checks),
      race,
      plannedLockTimeMs,
      actualLockTimeMs: nowMs,
      lockedAt: nowIso,
      secondsBeforeStartAtLock,
      configSnapshot: config,
      checks,
      mostShortened: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      snapshot: {
        candidates,
        runnersCount: runners.length,
      },
    };
  }

  const originalRunner =
    runners.find(
      (runner) => runner.number === mostShortened.runnerNumber,
    ) ?? null;

  // Skyddar exakta gränsvärden mot binär avrundning,
  // utan att verkliga värden under 30 % godkänns.
  const hasMinimumDrop =
    mostShortened.oddsDropPercent + 1e-9 >=
    config.minOddsDropPercentInclusive;

  const belowOrEqualMaximumOdds =
    mostShortened.currentWinOdds <=
    config.maxCurrentWinOddsInclusive + Number.EPSILON;

  const notScratched = originalRunner?.scratched === false;

  const enoughPoints =
    mostShortened.validOddsPoints >= config.minValidOddsPoints;

  checks.push({
    key: "MIN_ODDS_DROP",
    passed: hasMinimumDrop,
    message: hasMinimumDrop
      ? `Sänkning ${mostShortened.oddsDropPercent.toFixed(1)} % är godkänd`
      : `Sänkningen är endast ${mostShortened.oddsDropPercent.toFixed(1)} %`,
  });

  checks.push({
    key: "MAX_WIN_ODDS",
    passed: belowOrEqualMaximumOdds,
    message: belowOrEqualMaximumOdds
      ? `Vinnarodds ${mostShortened.currentWinOdds.toFixed(2)} är godkänt`
      : `Vinnaroddset är ${mostShortened.currentWinOdds.toFixed(2)}`,
  });

  checks.push({
    key: "NOT_SCRATCHED",
    passed: notScratched,
    message: notScratched
      ? "Hästen är inte struken"
      : "INGET SPEL – HÄSTEN ÄR STRUKEN",
  });

  checks.push({
    key: "MIN_VALID_POINTS",
    passed: enoughPoints,
    message: enoughPoints
      ? `${mostShortened.validOddsPoints} giltiga oddspunkter`
      : "INGET SPEL – FÖR FÅ ODDSPUNKTER",
  });

  const decision = checks.every((check) => check.passed)
    ? "PLAY"
    : "NO_PLAY";

  return {
    raceId: race.raceId,
    ruleVersion: config.ruleVersion,
    decision,
    reasons: failedReasons(checks),
    race,
    plannedLockTimeMs,
    actualLockTimeMs: nowMs,
    lockedAt: nowIso,
    secondsBeforeStartAtLock,
    configSnapshot: config,
    checks,
    mostShortened,
    createdAt: nowIso,
    updatedAt: nowIso,
    snapshot: {
      mostShortened,
      candidates,
      runnersCount: runners.length,
    },
  };
}
