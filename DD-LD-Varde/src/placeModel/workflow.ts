import type { PlaceRuleConfig } from "./config";
import { applySettledResult, sekToOren } from "./economy";
import type { PlaceAuditLogEntry, PlaceBet, PlaceEvaluation } from "./types";

export function raceRuleKey(raceId: string, ruleVersion: string) {
  return `${raceId}:${ruleVersion}`;
}

export function mergeUniqueByRaceRule<T extends { raceId: string; ruleVersion: string }>(
  current: T[],
  incoming: T[],
) {
  const map = new Map<string, T>(current.map((item) => [raceRuleKey(item.raceId, item.ruleVersion), item]));
  for (const item of incoming) {
    map.set(raceRuleKey(item.raceId, item.ruleVersion), item);
  }
  return [...map.values()];
}

export function buildModelBetFromEvaluation(args: {
  evaluation: PlaceEvaluation;
  stakeSEK: number;
  nowIso: string;
}): PlaceBet | null {
  const { evaluation, stakeSEK, nowIso } = args;
  if (evaluation.decision !== "PLAY" || !evaluation.smoothest) return null;

  const smoothest = evaluation.smoothest;
  return {
    betId: `${evaluation.raceId}:${evaluation.ruleVersion}:model`,
    raceId: evaluation.raceId,
    ruleVersion: evaluation.ruleVersion,
    configSnapshot: evaluation.configSnapshot,
    date: evaluation.race.date,
    trackId: evaluation.race.trackId,
    trackName: evaluation.race.trackName,
    raceNumber: evaluation.race.raceNumber,
    plannedStartTime: evaluation.race.plannedStartTime,
    lockTime: evaluation.lockedAt,
    horseNumber: smoothest.runnerNumber,
    horseName: smoothest.runnerName,
    startLane: smoothest.startLane,
    startMethod: evaluation.race.startMethod,
    distanceMeters: evaluation.race.distanceMeters,
    starters: evaluation.race.starters,
    startOdds: smoothest.startOdds,
    currentWinOdds: smoothest.currentWinOdds,
    oddsDropPercent: smoothest.oddsDropPercent,
    cvRaw: smoothest.cvRaw,
    cvDisplay: smoothest.cvDisplay,
    strength: smoothest.strength,
    indicatorsGreen: smoothest.indicatorsGreen,
    validOddsPoints: smoothest.validOddsPoints,
    stakeOren: sekToOren(stakeSEK),
    resultOutcome: "PENDING",
    resultStatus: "PENDING",
    finishPositionOfficial: null,
    placeOddsDecimal: null,
    returnOren: null,
    netOren: null,
    roiPct: null,
    automaticModelBet: true,
    userActuallyPlayed: false,
    resultSource: null,
    resultUpdatedAt: null,
    placeOddsEntryMethod: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function settleModelBet(args: {
  bet: PlaceBet;
  raceCancelled: boolean;
  horseScratched: boolean;
  finishPosition: number | null;
  placeOddsDecimal: number | null;
  config: PlaceRuleConfig;
  nowIso: string;
}): PlaceBet {
  const { bet, raceCancelled, horseScratched, finishPosition, placeOddsDecimal, config, nowIso } = args;

  if (raceCancelled || horseScratched) {
    return {
      ...bet,
      resultOutcome: "VOID",
      resultStatus: "VOID",
      resultSource: "ATG",
      resultUpdatedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  if (!finishPosition || finishPosition <= 0) {
    return bet;
  }

  const settled = applySettledResult({
    stakeOren: bet.stakeOren,
    finishPosition,
    maxHitPosition: config.hitMaxOfficialFinishPosition,
    placeOddsDecimal,
  });

  return {
    ...bet,
    finishPositionOfficial: finishPosition,
    placeOddsDecimal,
    resultOutcome: settled.resultOutcome,
    resultStatus: settled.resultStatus,
    returnOren: settled.returnOren,
    netOren: settled.netOren,
    roiPct: settled.roiPct,
    resultSource: "ATG",
    resultUpdatedAt: nowIso,
    placeOddsEntryMethod: placeOddsDecimal === null ? null : "AUTO",
    updatedAt: nowIso,
  };
}

export function applyManualCorrection(args: {
  bet: PlaceBet;
  finishPosition: number | null;
  placeOddsDecimal: number | null;
  config: PlaceRuleConfig;
  nowIso: string;
}): { updatedBet: PlaceBet; auditEntries: PlaceAuditLogEntry[] } {
  const { bet, finishPosition, placeOddsDecimal, config, nowIso } = args;

  const settled = applySettledResult({
    stakeOren: bet.stakeOren,
    finishPosition: finishPosition ?? 0,
    maxHitPosition: config.hitMaxOfficialFinishPosition,
    placeOddsDecimal,
  });

  const updatedBet: PlaceBet = {
    ...bet,
    finishPositionOfficial: finishPosition,
    placeOddsDecimal,
    resultOutcome: settled.resultOutcome,
    resultStatus: settled.resultStatus,
    returnOren: settled.returnOren,
    netOren: settled.netOren,
    roiPct: settled.roiPct,
    resultSource: "MANUAL",
    placeOddsEntryMethod: placeOddsDecimal === null ? null : "MANUAL",
    resultUpdatedAt: nowIso,
    updatedAt: nowIso,
  };

  const auditEntries: PlaceAuditLogEntry[] = [];

  if (String(bet.finishPositionOfficial ?? "") !== String(updatedBet.finishPositionOfficial ?? "")) {
    auditEntries.push({
      id: `${bet.betId}-finish-${nowIso}`,
      betId: bet.betId,
      field: "finishPositionOfficial",
      previousValue: bet.finishPositionOfficial == null ? null : String(bet.finishPositionOfficial),
      newValue: updatedBet.finishPositionOfficial == null ? null : String(updatedBet.finishPositionOfficial),
      changedAt: nowIso,
    });
  }

  if (String(bet.placeOddsDecimal ?? "") !== String(updatedBet.placeOddsDecimal ?? "")) {
    auditEntries.push({
      id: `${bet.betId}-placeodds-${nowIso}`,
      betId: bet.betId,
      field: "placeOddsDecimal",
      previousValue: bet.placeOddsDecimal == null ? null : String(bet.placeOddsDecimal),
      newValue: updatedBet.placeOddsDecimal == null ? null : String(updatedBet.placeOddsDecimal),
      changedAt: nowIso,
    });
  }

  return { updatedBet, auditEntries };
}
