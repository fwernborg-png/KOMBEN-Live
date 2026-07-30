export type ResearchSelection =
  | "MOST_SHORTENED"
  | "SMOOTHEST"
  | "FAVORITE";

export type ResearchGrouping =
  | "START_METHOD"
  | "DISTANCE"
  | "TRACK"
  | "STRENGTH";

export type ResearchHistoryFilters = {
  dateFrom: string;
  dateTo: string;

  selection: ResearchSelection;

  startMethod: string;
  distanceMeters: number | null;
  trackName: string;

  minStrength: number | null;
  minDropPercent: number | null;

  completeOnly: boolean;
  limit: number;
};

export type ResearchHistoryOptions = {
  minDate: string | null;
  maxDate: string | null;

  raceCount: number;

  tracks: string[];
  distances: number[];
  startMethods: string[];
};

export type ResearchHistoryRow = {
  raceKey: string;
  raceDate: string;

  trackName: string;
  raceNumber: number;
  plannedStartTime: string | null;

  startMethod: string | null;
  distanceMeters: number | null;

  raceCategory: string | null;
  raceClassCode: string | null;

  starters: number | null;

  selectionKind: ResearchSelection;

  runnerNumber: number;
  horseName: string;
  startLane: number | null;

  strengthTotal: number | null;

  startOdds: number | null;
  lockOdds: number | null;
  finalOdds: number | null;

  oddsDropToLockPercent: number | null;
  oddsDropToFinalPercent: number | null;

  cvPercent: number | null;
  validOddsPoints: number;

  isFavoriteAtLock: boolean;

  krValue: number | null;
  stValue: number | null;
  driverValue: number | null;
  spValue: number | null;
  gallopValue: number | null;
  oddsIndicatorValue: number | null;

  started: boolean | null;
  scratchedAfterLock: boolean;
  betVoid: boolean;

  finishPositionOfficial: number | null;

  winnerOfficial: boolean;
  placedOfficial: boolean | null;

  galloped: boolean | null;
  disqualified: boolean;
  didNotFinish: boolean;

  officialWinOddsDecimal: number | null;
  officialPlaceOddsDecimal: number | null;

  resultStatus: string;

  metricQualityStatus: string;
  indicatorDataComplete: boolean;
  oddsDataComplete: boolean;
};

export type SimulatedMarketSummary = {
  stake: number;
  returnAmount: number;
  net: number;
  roiPercent: number | null;

  payoutMissing: number;
};

export type ResearchHistorySummary = {
  races: number;
  bets: number;
  voids: number;

  wins: number;
  places: number;

  winRatePercent: number;
  placeRatePercent: number;

  averageLockOdds: number | null;
  averageDropPercent: number | null;
  averageStrength: number | null;

  winnerMarket: SimulatedMarketSummary;
  placeMarket: SimulatedMarketSummary;
  combinedMarket: SimulatedMarketSummary;
};

export type ResearchGroupSummary = {
  key: string;
  label: string;

  races: number;
  bets: number;

  wins: number;
  places: number;

  winRatePercent: number;
  placeRatePercent: number;

  averageDropPercent: number | null;
  averageLockOdds: number | null;

  winnerRoiPercent: number | null;
  placeRoiPercent: number | null;
  combinedRoiPercent: number | null;
};
