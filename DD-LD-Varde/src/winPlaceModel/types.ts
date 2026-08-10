import type { OddsPoint, PlaceRaceInput } from "../placeModel/types";
import type { WinPlaceRuleConfig } from "./config";

export type WinPlaceDecision =
  | "PLAY"
  | "NO_PLAY"
  | "EXCLUDED"
  | "INSUFFICIENT_DATA";

export type WinPlaceRaceInput = PlaceRaceInput;

export type WinPlaceRunnerInput = {
  number: number;
  name: string;
  horseId?: number | null;
  startLane: number | null;
  scratched: boolean;
  currentWinOddsDecimal: number | null;
  indicatorsGreen: string[];
  strength: number;
  oddsHistory: OddsPoint[];
};

export type WinPlaceCandidate = {
  runnerNumber: number;
  runnerName: string;
  horseId: number | null;
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

export type WinPlaceRuleCheck = {
  key:
    | "NOT_MONTE"
    | "NOT_CANCELLED"
    | "ODDS_HISTORY_COMPLETE"
    | "CURRENT_ODDS_POINT_AVAILABLE"
    | "MOST_SHORTENED_FOUND"
    | "SECOND_MOST_SHORTENED_FOUND"
    | "MIN_ODDS_DROP"
    | "MAX_WIN_ODDS"
    | "NOT_SCRATCHED"
    | "MIN_VALID_POINTS"
    | "MAX_ACTIVE_STARTERS"
    | "MAX_STRENGTH";
  passed: boolean;
  message: string;
};

export type WinPlaceEvaluation = {
  raceId: string;
  ruleVersion: string;
  decision: WinPlaceDecision;
  reasons: string[];
  race: WinPlaceRaceInput;
  plannedLockTimeMs: number;
  actualLockTimeMs: number;
  lockedAt: string;
  secondsBeforeStartAtLock: number;
  configSnapshot: WinPlaceRuleConfig;
  checks: WinPlaceRuleCheck[];
  selectedCandidate?: WinPlaceCandidate | null;
  mostShortened: WinPlaceCandidate | null;
  createdAt: string;
  updatedAt: string;
  snapshot: Record<string, unknown>;
};
