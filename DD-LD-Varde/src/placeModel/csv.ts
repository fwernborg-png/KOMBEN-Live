import type { PlaceBet, PlaceEvaluation } from "./types";

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeRows(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return lines.join("\n");
}

export function buildPlaceEvaluationsCsv(evaluations: PlaceEvaluation[]) {
  const rows = evaluations.map((item) => ({
    type: "evaluation",
    raceId: item.raceId,
    ruleVersion: item.ruleVersion,
    decision: item.decision,
    reasons: item.reasons.join(" | "),
    date: item.race.date,
    trackId: item.race.trackId,
    trackName: item.race.trackName,
    raceNumber: item.race.raceNumber,
    plannedStartTime: item.race.plannedStartTime,
    lockedAt: item.lockedAt,
    isMonte: item.race.isMonte,
    startMethod: item.race.startMethod,
    distanceMeters: item.race.distanceMeters,
    starters: item.race.starters,
    smoothestNumber: item.smoothest?.runnerNumber ?? "",
    smoothestName: item.smoothest?.runnerName ?? "",
    smoothestStartLane: item.smoothest?.startLane ?? "",
    cvRaw: item.smoothest?.cvRaw ?? "",
    cvDisplay: item.smoothest?.cvDisplay ?? "",
    startOdds: item.smoothest?.startOdds ?? "",
    currentWinOdds: item.smoothest?.currentWinOdds ?? "",
    oddsDropPercent: item.smoothest?.oddsDropPercent ?? "",
    strength: item.smoothest?.strength ?? "",
    indicatorsGreen: item.smoothest?.indicatorsGreen.join("|") ?? "",
    validOddsPoints: item.smoothest?.validOddsPoints ?? "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    snapshotJson: JSON.stringify(item.snapshot),
  }));

  return serializeRows(rows);
}

export function buildPlaceBetsCsv(bets: PlaceBet[]) {
  const rows = bets.map((item) => ({
    type: "bet",
    betId: item.betId,
    raceId: item.raceId,
    ruleVersion: item.ruleVersion,
    date: item.date,
    trackId: item.trackId,
    trackName: item.trackName,
    raceNumber: item.raceNumber,
    plannedStartTime: item.plannedStartTime,
    lockTime: item.lockTime,
    horseNumber: item.horseNumber,
    horseName: item.horseName,
    startLane: item.startLane ?? "",
    startMethod: item.startMethod,
    distanceMeters: item.distanceMeters ?? "",
    starters: item.starters,
    startOdds: item.startOdds,
    currentWinOdds: item.currentWinOdds,
    oddsDropPercent: item.oddsDropPercent,
    cvRaw: item.cvRaw,
    cvDisplay: item.cvDisplay,
    strength: item.strength,
    indicatorsGreen: item.indicatorsGreen.join("|"),
    validOddsPoints: item.validOddsPoints,
    stakeOren: item.stakeOren,
    resultOutcome: item.resultOutcome,
    resultStatus: item.resultStatus,
    finishPositionOfficial: item.finishPositionOfficial ?? "",
    placeOddsDecimal: item.placeOddsDecimal ?? "",
    returnOren: item.returnOren ?? "",
    netOren: item.netOren ?? "",
    roiPct: item.roiPct ?? "",
    automaticModelBet: item.automaticModelBet,
    userActuallyPlayed: item.userActuallyPlayed,
    resultSource: item.resultSource ?? "",
    resultUpdatedAt: item.resultUpdatedAt ?? "",
    placeOddsEntryMethod: item.placeOddsEntryMethod ?? "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    configJson: JSON.stringify(item.configSnapshot),
  }));

  return serializeRows(rows);
}
