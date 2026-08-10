import {
  getWinPlaceCollectionStartMs,
  getWinPlacePlannedLockTimeMs,
} from "./config";
import type { WinPlaceRuleConfig } from "./config";
import type {
  WinPlaceCandidate,
  WinPlaceEvaluation,
  WinPlaceRuleCheck,
  WinPlaceRunnerInput,
} from "./types";

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

export function rankWinPlaceCandidates(
  candidates: WinPlaceCandidate[],
) {
  return [...candidates].sort((a, b) => {
    if (a.oddsDropPercent !== b.oddsDropPercent) {
      return b.oddsDropPercent - a.oddsDropPercent;
    }

    if (a.currentWinOdds !== b.currentWinOdds) {
      return a.currentWinOdds - b.currentWinOdds;
    }

    return a.runnerNumber - b.runnerNumber;
  });
}

export function selectWinPlaceCandidate(
  candidates: WinPlaceCandidate[],
  selectionRank: 1 | 2,
) {
  return rankWinPlaceCandidates(candidates)[selectionRank - 1] ?? null;
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

  const activeRunners = runners.filter((runner) => !runner.scratched);

  const candidates = activeRunners
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
    );

  // Den befintliga S1-regeln behåller tidigare beteende.
  // För S2 krävs däremot ett komplett aktivt startfält,
  // annars kan "näst mest sänkt" inte utses säkert.
  if (
    config.selectionRank === 2 &&
    candidates.length !== activeRunners.length
  ) {
    return [];
  }

  return rankWinPlaceCandidates(candidates);
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

  const activeStarters =
    runners.filter(
      (runner) => !runner.scratched,
    ).length;

  const maxActiveStarters =
    config.maxActiveStartersInclusive ??
    null;

  const withinMaxActiveStarters =
    maxActiveStarters === null ||
    activeStarters <= maxActiveStarters;

  const completeOddsAccepted =
    config.requireCompleteOddsHistory === false ||
    hasCompleteOddsHistory;

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
    passed: completeOddsAccepted,
    message:
      config.requireCompleteOddsHistory === false
        ? "Komplett oddshistorik är inte ett krav för strategin"
        : hasCompleteOddsHistory
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

  checks.push({
    key: "MAX_ACTIVE_STARTERS",
    passed: withinMaxActiveStarters,
    message:
      maxActiveStarters === null
        ? "Inget maxkrav på antal startande"
        : withinMaxActiveStarters
          ? `${activeStarters} startande är godkänt`
          : `INGET SPEL – ${activeStarters} startande, max ${maxActiveStarters}`,
  });

  const baseResult = {
    raceId: race.raceId,
    ruleVersion: config.ruleVersion,
    race,
    plannedLockTimeMs,
    actualLockTimeMs: nowMs,
    lockedAt: nowIso,
    secondsBeforeStartAtLock,
    configSnapshot: config,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (
    excludedByMonte ||
    cancelled ||
    !completeOddsAccepted ||
    !hasFreshCurrentOddsPoint ||
    !withinMaxActiveStarters
  ) {
    return {
      ...baseResult,
      decision: excludedByMonte ? "EXCLUDED" : "NO_PLAY",
      reasons: failedReasons(checks),
      checks,
      selectedCandidate: null,
      mostShortened: null,
      snapshot: {
        selectionRank: config.selectionRank,
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
  const selectedCandidate =
    candidates[config.selectionRank - 1] ?? null;

  checks.push({
    key:
      config.selectionRank === 1
        ? "MOST_SHORTENED_FOUND"
        : "SECOND_MOST_SHORTENED_FOUND",
    passed: selectedCandidate !== null,
    message: selectedCandidate
      ? config.selectionRank === 1
        ? `Mest sänkt är nummer ${selectedCandidate.runnerNumber}`
        : `Näst mest sänkt är nummer ${selectedCandidate.runnerNumber}`
      : config.selectionRank === 1
        ? "INGET SPEL – INGEN GILTIG MEST SÄNKT HÄST"
        : "INGET SPEL – INGEN GILTIG S2-HÄST",
  });

  if (!selectedCandidate) {
    return {
      ...baseResult,
      decision: "INSUFFICIENT_DATA",
      reasons: failedReasons(checks),
      checks,
      selectedCandidate: null,
      mostShortened,
      snapshot: {
        selectionRank: config.selectionRank,
        candidates,
        runnersCount: runners.length,
      },
    };
  }

  const originalRunner =
    runners.find(
      (runner) => runner.number === selectedCandidate.runnerNumber,
    ) ?? null;

  const hasMinimumDrop =
    config.minOddsDropPercentInclusive === null ||
    selectedCandidate.oddsDropPercent + 1e-9 >=
      config.minOddsDropPercentInclusive;

  const belowOrEqualMaximumOdds =
    selectedCandidate.currentWinOdds <=
    config.maxCurrentWinOddsInclusive + Number.EPSILON;

  const notScratched = originalRunner?.scratched === false;

  const enoughPoints =
    selectedCandidate.validOddsPoints >= config.minValidOddsPoints;

  checks.push({
    key: "MIN_ODDS_DROP",
    passed: hasMinimumDrop,
    message:
      config.minOddsDropPercentInclusive === null
        ? "Inget minikrav på sänkning för strategin"
        : hasMinimumDrop
          ? `Sänkning ${selectedCandidate.oddsDropPercent.toFixed(1)} % är godkänd`
          : `Sänkningen är endast ${selectedCandidate.oddsDropPercent.toFixed(1)} %`,
  });

  checks.push({
    key: "MAX_WIN_ODDS",
    passed: belowOrEqualMaximumOdds,
    message: belowOrEqualMaximumOdds
      ? `Vinnarodds ${selectedCandidate.currentWinOdds.toFixed(2)} är godkänt`
      : `Vinnaroddset är ${selectedCandidate.currentWinOdds.toFixed(2)}`,
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
      ? `${selectedCandidate.validOddsPoints} giltiga oddspunkter`
      : "INGET SPEL – FÖR FÅ ODDSPUNKTER",
  });

  const maxStrength =
    config.maxStrengthInclusive ??
    null;

  const withinMaxStrength =
    maxStrength === null ||
    selectedCandidate.strength <=
      maxStrength;

  checks.push({
    key: "MAX_STRENGTH",
    passed: withinMaxStrength,
    message:
      maxStrength === null
        ? "Inget maxkrav på styrka"
        : withinMaxStrength
          ? `Styrka ${selectedCandidate.strength}/6 är godkänd`
          : `INGET SPEL – styrka ${selectedCandidate.strength}/6, max ${maxStrength}/6`,
  });

  const decision = checks.every((check) => check.passed)
    ? "PLAY"
    : "NO_PLAY";

  return {
    ...baseResult,
    decision,
    reasons: failedReasons(checks),
    checks,
    selectedCandidate,
    mostShortened,
    snapshot: {
      strategyCode: config.strategyCode,
      selectionRank: config.selectionRank,
      selectedCandidate,
      mostShortened,
      candidates,
      runnersCount: runners.length,
    },
  };
}
