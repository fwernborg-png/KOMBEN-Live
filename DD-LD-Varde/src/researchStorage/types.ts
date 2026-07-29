export const RESEARCH_CAPTURE_TYPES = [
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
  "EVENT",
  "RESULT",
] as const;

export type ResearchCaptureType =
  (typeof RESEARCH_CAPTURE_TYPES)[number];

export type ResearchMarket = "WIN" | "PLACE";

export type ResearchSignalPhase = "LIVE" | "BACKTEST";

export type ResearchMeetingTimeCategory =
  | "LUNCH"
  | "DAY"
  | "EVENING"
  | "NIGHT"
  | "UNKNOWN";

export type ResearchArchiveStatus =
  | "COLLECTING"
  | "READY_TO_ARCHIVE"
  | "COMPLETE"
  | "INCOMPLETE"
  | "FAILED";

export type ResearchDataQualityStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "INVALID"
  | "STALE";

export type ResearchCaptureTarget = {
  captureType: Exclude<
    ResearchCaptureType,
    "FINAL" | "EVENT" | "RESULT"
  >;
  targetSecondsBeforeStart: number;
  toleranceSeconds: number;
};

export type ResearchRawOddsObservation = {
  runnerNumber: number;
  horseId: number | null;
  horseName: string;
  market: ResearchMarket;
  oddsDecimal: number | null;
  timestampMs: number;
  scratched: boolean;
  source: string;
};

export type ResearchCombinedOddsPoint = {
  runnerNumber: number;
  horseId: number | null;
  horseName: string;
  timestampMs: number;
  winOddsDecimal: number | null;
  placeOddsDecimal: number | null;
  scratched: boolean;
  source: string;
};

export type ResearchCompactedOddsPoint = {
  runnerNumber: number;
  horseId: number | null;
  horseName: string;
  captureType: ResearchCaptureType;
  targetSecondsBeforeStart: number | null;
  pointTimestampMs: number;
  secondsBeforeStart: number;
  sourceTimestampDeltaSeconds: number | null;
  winOddsDecimal: number | null;
  placeOddsDecimal: number | null;
  scratched: boolean;
  source: string;
};

export type ResearchWinOddsPoint = {
  odds: number;
  timestamp: number;
};

export type ResearchRunnerMetricInput = {
  runnerNumber: number;
  horseId: number | null;
  horseName: string;
  scratched: boolean;
  oddsHistory: ResearchWinOddsPoint[];
};

export type ResearchRunnerOddsMetrics = {
  runnerNumber: number;
  horseId: number | null;
  horseName: string;

  validOddsPoints: number;

  startOdds: number | null;
  lockOdds: number | null;
  finalOdds: number | null;

  startOddsTimestampMs: number | null;
  lockOddsTimestampMs: number | null;
  finalOddsTimestampMs: number | null;

  oddsDropToLockPercent: number | null;
  oddsDropToFinalPercent: number | null;
  oddsDropLast10MinutesPercent: number | null;
  oddsDropLast5MinutesPercent: number | null;
  oddsDropLast2MinutesPercent: number | null;

  minimumOdds: number | null;
  maximumOdds: number | null;
  meanOdds: number | null;

  cvPercent: number | null;
  cvLast10MinutesPercent: number | null;

  oddsDropsCount: number;
  oddsRisesCount: number;
  oddsUnchangedCount: number;

  largestSingleDropPercent: number | null;
  largestSingleRisePercent: number | null;
  largestReboundPercent: number | null;

  trendSlopeOddsPerMinute: number | null;

  impliedProbabilityStart: number | null;
  impliedProbabilityLock: number | null;
  impliedProbabilityFinal: number | null;

  oddsDropRank: number | null;
  smoothnessRank: number | null;
  lockMarketRank: number | null;

  isMostShortened: boolean;
  isSmoothest: boolean;
  isFavoriteAtLock: boolean;

  topOddsDropGapToSecond: number | null;
  topSmoothnessGapToSecond: number | null;
};

export type ResearchMarketShare = {
  runnerNumber: number;
  oddsDecimal: number;
  rawImpliedProbability: number;
  normalizedMarketShare: number;
  marketRank: number;
};

export type ResearchIndicatorCode =
  | "KR"
  | "ST"
  | "K"
  | "SP"
  | "G"
  | "ODD"
  | string;

export type ResearchRunnerIndicator = {
  runnerNumber: number;
  indicatorCode: ResearchIndicatorCode;
  rawValue: number | null;
  rankInRace: number | null;
  isTopFour: boolean;
  rankingDirection: "HIGH" | "LOW";
  source: string;
  sourceUpdatedAt: string | null;
};
