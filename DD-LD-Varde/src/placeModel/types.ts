import type { PlaceRuleConfig } from "./config";

export type PlaceDecision = "PLAY" | "NO_PLAY" | "EXCLUDED" | "INSUFFICIENT_DATA";

export type PlaceVoidReason =
  | "VOID_INSTALLT_LOPP"
  | "VOID_STRUKEN_HAST"
  | "EXCLUDED_MONTE";

export type PlaceResultOutcome = "PENDING" | "HIT" | "MISS" | "VOID";

export type PlaceResultStatus =
  | "PENDING"
  | "RESULT_READY"
  | "SAKNAR_PLATSODDS"
  | "VOID";

export type PlaceRuleCheck = {
  key:
    | "SMOOTHEST"
    | "ODDS_DROP"
    | "MIN_STRENGTH"
    | "MAX_WIN_ODDS"
    | "VALID_HISTORY"
    | "NOT_SCRATCHED"
    | "NOT_MONTE"
    | "NOT_CANCELLED"
    | "NOT_LOCK_MISSED"
    | "INDICATOR_DATA_COMPLETE"
    | "ODDS_HISTORY_COMPLETE"
    | "CURRENT_ODDS_POINT_AVAILABLE";
  passed: boolean;
  message: string;
};

export type OddsPoint = {
  odds: number;
  timestamp: number;
};

export type PlaceRunnerInput = {
  number: number;
  name: string;
  horseId?: number | null;
  startLane: number | null;
  scratched: boolean;
  currentWinOddsDecimal: number | null;
  indicatorsGreen: string[];
  strength: number;
  gallopPercent?: number | null;
  gallopSource?: string | null;
  gallopUpdatedAtMs?: number | null;
  gallopIsFresh?: boolean;
  oddsHistory: OddsPoint[];
};

export type PlaceRaceInput = {
  raceId: string;
  date: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  plannedStartTime: string;
  raceStatus?: string;
  isMonte: boolean;
  startMethod: string;
  distanceMeters: number | null;
  starters: number;
};

export type SmoothestCandidate = {
  runnerNumber: number;
  runnerName: string;
  startLane: number | null;
  startOdds: number;
  currentWinOdds: number;
  oddsDropPercent: number;
  validOddsPoints: number;
  cvRaw: number;
  cvDisplay: number;
  strength: number;
  indicatorsGreen: string[];
};

export type PlaceEvaluation = {
  raceId: string;
  ruleVersion: string;
  decision: PlaceDecision;
  reasons: string[];
  race: PlaceRaceInput;
  lockedAt: string;
  lockTimeMs: number;
  configSnapshot: PlaceRuleConfig;
  checks: PlaceRuleCheck[];
  smoothest: SmoothestCandidate | null;
  createdAt: string;
  updatedAt: string;
  snapshot: Record<string, unknown>;
};

export type PlaceBet = {
  betId: string;
  raceId: string;
  ruleVersion: string;
  configSnapshot: PlaceRuleConfig;
  date: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  plannedStartTime: string;
  lockTime: string;
  horseNumber: number;
  horseName: string;
  startLane: number | null;
  startMethod: string;
  distanceMeters: number | null;
  starters: number;
  startOdds: number;
  currentWinOdds: number;
  oddsDropPercent: number;
  cvRaw: number;
  cvDisplay: number;
  strength: number;
  indicatorsGreen: string[];
  validOddsPoints: number;
  stakeOren: number;
  resultOutcome: PlaceResultOutcome;
  resultStatus: PlaceResultStatus;
  finishPositionOfficial: number | null;
  placeOddsDecimal: number | null;
  returnOren: number | null;
  netOren: number | null;
  roiPct: number | null;
  automaticModelBet: boolean;
  userActuallyPlayed: boolean;
  resultSource: string | null;
  resultUpdatedAt: string | null;
  placeOddsEntryMethod: "AUTO" | "MANUAL" | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaceAuditLogEntry = {
  id: string;
  betId: string;
  field: "finishPositionOfficial" | "placeOddsDecimal" | "resultStatus";
  previousValue: string | null;
  newValue: string | null;
  changedAt: string;
};
