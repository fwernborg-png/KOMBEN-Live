export type ResearchSelection =
  | "MOST_SHORTENED"
  | "SMOOTHEST"
  | "FAVORITE"
  | "ALL_RUNNERS"
  | "STRONG_STAR";

export type ResearchIndicatorFilter =
  boolean | null;

export type ResearchLaneGroup =
  | "ALL"
  | "AUTO_INNER_1_5"
  | "AUTO_FRONT_1_8"
  | "AUTO_BACK_9_12"
  | "AUTO_THIRD_13_15"
  | "VOLT_BASE"
  | "VOLT_HANDICAP";

export type ResearchGrouping =
  | "START_METHOD"
  | "DISTANCE"
  | "TRACK"
  | "STRENGTH"
  | "DRIVER"
  | "START_LANE"
  | "RACE_CLASS"
  | "LOCK_ODDS";

export type ResearchHistoryFilters = {
  dateFrom: string;
  dateTo: string;

  countryCode: string;

  selection: ResearchSelection;

  startMethod: string;
  distanceMeters: number | null;

  trackName: string;
  driverName: string;

  startLane: number | null;
  laneGroup: ResearchLaneGroup;

  raceCategory: string;
  raceClassCode: string;

  earningsMin: number | null;
  earningsMax: number | null;

  minStarters: number | null;
  maxStarters: number | null;

  minStrength: number | null;
  maxStrength: number | null;

  krTopFour: ResearchIndicatorFilter;
  stTopFour: ResearchIndicatorFilter;
  driverTopFour: ResearchIndicatorFilter;
  spTopFour: ResearchIndicatorFilter;
  gallopTopFour: ResearchIndicatorFilter;
  oddsIndicatorTopFour: ResearchIndicatorFilter;

  minDropPercent: number | null;
  maxDropPercent: number | null;

  minStartOdds: number | null;
  maxStartOdds: number | null;

  minLockOdds: number | null;
  maxLockOdds: number | null;

  completeOnly: boolean;
  limit: number;
};

export type ResearchHistoryOptions = {
  minDate: string | null;
  maxDate: string | null;

  raceCount: number;

  countries: string[];
  tracks: string[];
  tracksByCountry: Record<string, string[]>;

  distances: number[];
  startMethods: string[];

  raceCategories: string[];
  raceClassCodes: string[];

  drivers: string[];
  startLanes: number[];
};

export type ResearchHistoryRow = {
  raceKey: string;
  raceDate: string;

  trackName: string;
  raceNumber: number;
  raceName: string | null;

  plannedStartTime: string | null;

  startMethod: string | null;
  distanceMeters: number | null;

  raceCategory: string | null;
  raceClassCode: string | null;

  earningsMin: number | null;
  earningsMax: number | null;

  starters: number | null;

  selectionKind: ResearchSelection;

  runnerNumber: number;
  horseName: string;

  startLane: number | null;
  startDistanceMeters: number | null;
  distanceHandicapMeters: number | null;

  driverId: string | null;
  driverName: string | null;

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
