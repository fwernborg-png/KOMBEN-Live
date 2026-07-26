import type { PlaceRuleConfig } from "./config";
import { getRaceCollectionStartMs, getRaceLockTimeMs } from "./config";
import type {
  OddsPoint,
  PlaceDecision,
  PlaceEvaluation,
  PlaceRaceInput,
  PlaceRuleCheck,
  PlaceRunnerInput,
  SmoothestCandidate,
} from "./types";

const INVALID_ODDS_DECIMALS = new Set([99.99]);

function isValidOddsDecimal(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) return false;
  if (value <= 0) return false;
  if (value > 200) return false;
  for (const invalid of INVALID_ODDS_DECIMALS) {
    if (Math.abs(value - invalid) < 0.001) return false;
  }
  return true;
}

function normalizeHistoryWindow(args: {
  history: OddsPoint[];
  startTimeIso: string;
  nowMs: number;
  config: PlaceRuleConfig;
}) {
  const { history, startTimeIso, config } = args;
  const lockTimeMs = getRaceLockTimeMs(startTimeIso, config);
  const collectionStartMs = getRaceCollectionStartMs(startTimeIso, config);

  return history
    .filter((point) => point.timestamp >= collectionStartMs && point.timestamp <= lockTimeMs)
    .filter((point) => isValidOddsDecimal(point.odds))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function cv(values: number[]) {
  if (values.length < 2) return null;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return (std / avg) * 100;
}

function buildSmoothestCandidates(args: {
  race: PlaceRaceInput;
  runners: PlaceRunnerInput[];
  nowMs: number;
  config: PlaceRuleConfig;
}) {
  const { race, runners, nowMs, config } = args;

  return runners
    .filter((runner) => !runner.scratched)
    .map((runner) => {
      const validHistory = normalizeHistoryWindow({
        history: runner.oddsHistory,
        startTimeIso: race.plannedStartTime,
        nowMs,
        config,
      });
      const values = validHistory.map((point) => point.odds);
      const cvRaw = cv(values);
      const startOdds = values[0] ?? null;
      const currentWinOdds = values[values.length - 1] ?? runner.currentWinOddsDecimal;
      const hasValidHistory =
        values.length >= config.minValidOddsPoints &&
        startOdds !== null &&
        currentWinOdds !== null &&
        cvRaw !== null;

      const oddsDropPercent =
        hasValidHistory && startOdds && currentWinOdds
          ? ((startOdds - currentWinOdds) / startOdds) * 100
          : 0;

      return {
        runner,
        validHistory,
        hasValidHistory,
        cvRaw,
        startOdds,
        currentWinOdds,
        oddsDropPercent,
      };
    })
    .filter((item) => item.hasValidHistory && item.cvRaw !== null && item.startOdds !== null && item.currentWinOdds !== null)
    .filter((item) => item.validHistory.every((point) => isValidOddsDecimal(point.odds)));
}

function tieBreak(a: SmoothestCandidate, b: SmoothestCandidate): number {
  if (a.strength !== b.strength) return b.strength - a.strength;
  if (a.currentWinOdds !== b.currentWinOdds) return a.currentWinOdds - b.currentWinOdds;
  if (a.oddsDropPercent !== b.oddsDropPercent) return b.oddsDropPercent - a.oddsDropPercent;
  return a.runnerNumber - b.runnerNumber;
}

function toReasons(checks: PlaceRuleCheck[]) {
  return checks.filter((check) => !check.passed).map((check) => check.message);
}

function containsCancelledStatus(status?: string) {
  if (!status) return false;
  return /install|inst[äa]lld|inst[äa]llt|cancel/i.test(status);
}

export function evaluatePlaceModelAtLock(args: {
  race: PlaceRaceInput;
  runners: PlaceRunnerInput[];
  nowMs: number;
  config: PlaceRuleConfig;
  alreadyLockedForVersion: boolean;
  appStartedAfterLock: boolean;
  hasCompleteIndicatorData?: boolean;
  incompleteIndicatorRunnerNumbers?: number[];
  hasCompleteOddsHistory?: boolean;
  incompleteOddsHistoryRunnerNumbers?: number[];
  hasFreshCurrentOddsPoint?: boolean;
}): PlaceEvaluation {
  const {
    race,
    runners,
    nowMs,
    config,
    alreadyLockedForVersion,
    appStartedAfterLock,
    hasCompleteIndicatorData = true,
    incompleteIndicatorRunnerNumbers = [],
    hasCompleteOddsHistory = true,
    incompleteOddsHistoryRunnerNumbers = [],
    hasFreshCurrentOddsPoint = true,
  } = args;
  const lockTimeMs = getRaceLockTimeMs(race.plannedStartTime, config);
  const lockedAtIso = new Date(Math.max(nowMs, lockTimeMs)).toISOString();

  const checks: PlaceRuleCheck[] = [];
  const excludedByMonte = config.excludeMonte && race.isMonte;
  const cancelled = containsCancelledStatus(race.raceStatus);
  const lockMissed = appStartedAfterLock;

  if (excludedByMonte) {
    checks.push({ key: "NOT_MONTE", passed: false, message: "EXKLUDERAT – MONTÉ" });
  }
  if (cancelled) {
    checks.push({ key: "NOT_CANCELLED", passed: false, message: "VOID – INSTÄLLT LOPP" });
  }
  if (lockMissed) {
    checks.push({ key: "NOT_LOCK_MISSED", passed: false, message: "INGET PLATSSPEL – LÅSTID PASSERAD" });
  }
  if (!hasCompleteIndicatorData) {
    checks.push({
      key: "INDICATOR_DATA_COMPLETE",
      passed: false,
      message: "INGET PLATSSPEL – OFULLSTÄNDIG INDIKATORDATA",
    });
  }
  if (!hasCompleteOddsHistory) {
    checks.push({
      key: "ODDS_HISTORY_COMPLETE",
      passed: false,
      message: "INGET PLATSSPEL – OTILLRÄCKLIG ODDHISTORIK",
    });
  }
  if (!hasFreshCurrentOddsPoint) {
    checks.push({
      key: "CURRENT_ODDS_POINT_AVAILABLE",
      passed: false,
      message: "INGET PLATSSPEL – AKTUELL ODDSPUNKT SAKNAS",
    });
  }

  if (
    excludedByMonte ||
    cancelled ||
    lockMissed ||
    !hasCompleteIndicatorData ||
    !hasCompleteOddsHistory ||
    !hasFreshCurrentOddsPoint
  ) {
    const decision: PlaceDecision = excludedByMonte ? "EXCLUDED" : cancelled ? "NO_PLAY" : "NO_PLAY";
    const nowIso = new Date(nowMs).toISOString();
    return {
      raceId: race.raceId,
      ruleVersion: config.ruleVersion,
      decision,
      reasons: toReasons(checks),
      race,
      lockedAt: lockedAtIso,
      lockTimeMs,
      configSnapshot: config,
      checks,
      smoothest: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      snapshot: {
        race,
        runnersCount: runners.length,
        alreadyLockedForVersion,
        incompleteIndicatorRunnerNumbers,
        incompleteOddsHistoryRunnerNumbers,
        runnerIndicators: runners.map((runner) => ({
          number: runner.number,
          horseId: runner.horseId ?? null,
          scratched: runner.scratched,
          strength: runner.strength,
          indicatorsGreen: runner.indicatorsGreen,
          gallopPercent: runner.gallopPercent ?? null,
          gallopSource: runner.gallopSource ?? null,
          gallopUpdatedAtMs: runner.gallopUpdatedAtMs ?? null,
          gallopIsFresh: runner.gallopIsFresh ?? false,
        })),
      },
    };
  }

  const smoothestCandidates = buildSmoothestCandidates({ race, runners, nowMs, config })
    .map((item) => ({
      runnerNumber: item.runner.number,
      runnerName: item.runner.name,
      startLane: item.runner.startLane,
      startOdds: item.startOdds as number,
      currentWinOdds: item.currentWinOdds as number,
      oddsDropPercent: item.oddsDropPercent,
      validOddsPoints: item.validHistory.length,
      cvRaw: item.cvRaw as number,
      cvDisplay: Number((item.cvRaw as number).toFixed(2)),
      strength: item.runner.strength,
      indicatorsGreen: item.runner.indicatorsGreen,
    }))
    .sort((a, b) => {
      if (a.cvRaw !== b.cvRaw) return a.cvRaw - b.cvRaw;
      return tieBreak(a, b);
    });

  const smoothest = smoothestCandidates[0] ?? null;

  if (!smoothest) {
    checks.push({
      key: "VALID_HISTORY",
      passed: false,
      message: "INGET PLATSSPEL – OTILLRÄCKLIG DATA",
    });

    const nowIso = new Date(nowMs).toISOString();
    return {
      raceId: race.raceId,
      ruleVersion: config.ruleVersion,
      decision: "INSUFFICIENT_DATA",
      reasons: toReasons(checks),
      race,
      lockedAt: lockedAtIso,
      lockTimeMs,
      configSnapshot: config,
      checks,
      smoothest: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      snapshot: {
        race,
        smoothestCandidates,
        runnersCount: runners.length,
      },
    };
  }

  const smoothestRunner = runners.find((runner) => runner.number === smoothest.runnerNumber) ?? null;

  const hasOddsDrop = smoothest.currentWinOdds < smoothest.startOdds;
  const hasMinStrength = smoothest.strength >= config.minStrength;
  const belowMaxOdds = smoothest.currentWinOdds < config.maxCurrentWinOddsExclusive;
  const hasMinPoints = smoothest.validOddsPoints >= config.minValidOddsPoints;
  const notScratched = smoothestRunner ? !smoothestRunner.scratched : false;

  checks.push({ key: "SMOOTHEST", passed: true, message: "Hasten ar loppets giltiga jamnaste" });
  checks.push({
    key: "ODDS_DROP",
    passed: !config.requireOddsDrop || hasOddsDrop,
    message: hasOddsDrop ? "Oddset har sjunkit" : "Oddset har inte sjunkit",
  });
  checks.push({
    key: "MIN_STRENGTH",
    passed: hasMinStrength,
    message: hasMinStrength
      ? `Styrka ${smoothest.strength}/6 godkand`
      : `Jamnaste hasten har endast ${smoothest.strength}/6 i styrka`,
  });
  checks.push({
    key: "MAX_WIN_ODDS",
    passed: belowMaxOdds,
    message: belowMaxOdds
      ? `Aktuellt vinnarodds ${smoothest.currentWinOdds.toFixed(2)} ar under ${config.maxCurrentWinOddsExclusive.toFixed(2)}`
      : `Aktuellt vinnarodds ar ${smoothest.currentWinOdds.toFixed(2)}`,
  });
  checks.push({
    key: "VALID_HISTORY",
    passed: hasMinPoints,
    message: hasMinPoints
      ? `${smoothest.validOddsPoints} giltiga oddsmatningar`
      : `Endast ${smoothest.validOddsPoints} giltiga oddsmatningar finns`,
  });
  checks.push({
    key: "NOT_SCRATCHED",
    passed: notScratched,
    message: notScratched ? "Hästen är inte struken" : "VOID – STRUKEN HÄST",
  });

  const decision: PlaceDecision = checks.every((check) => check.passed) ? "PLAY" : "NO_PLAY";
  const nowIso = new Date(nowMs).toISOString();

  return {
    raceId: race.raceId,
    ruleVersion: config.ruleVersion,
    decision,
    reasons: toReasons(checks),
    race,
    lockedAt: lockedAtIso,
    lockTimeMs,
    configSnapshot: config,
    checks,
    smoothest,
    createdAt: nowIso,
    updatedAt: nowIso,
    snapshot: {
      race,
      smoothest,
      smoothestCandidates,
      runnersCount: runners.length,
      alreadyLockedForVersion,
      runnerIndicators: runners.map((runner) => ({
        number: runner.number,
        horseId: runner.horseId ?? null,
        scratched: runner.scratched,
        strength: runner.strength,
        indicatorsGreen: runner.indicatorsGreen,
        gallopPercent: runner.gallopPercent ?? null,
        gallopSource: runner.gallopSource ?? null,
        gallopUpdatedAtMs: runner.gallopUpdatedAtMs ?? null,
        gallopIsFresh: runner.gallopIsFresh ?? false,
      })),
    },
  };
}
