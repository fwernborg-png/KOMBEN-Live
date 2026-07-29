export type WinPlaceMarket = "WIN" | "PLACE";
export type WinPlaceSignalPhase = "LIVE" | "BACKTEST";
export type WinPlaceResultOutcome =
  | "PENDING"
  | "HIT"
  | "MISS"
  | "VOID";

export type WinPlaceResultStatus =
  | "PENDING"
  | "RESULT_READY"
  | "SAKNAR_ODDS"
  | "VOID";

export type WinPlaceBetRecord = {
  id: string;
  betId: string;
  raceId: string;
  ruleVersion: string;
  market: WinPlaceMarket;
  signalPhase: WinPlaceSignalPhase;
  date: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  plannedStartTime: string;
  lockTime: string;
  secondsBeforeStart: number;
  horseNumber: number;
  horseName: string;
  horseId: number | null;
  startLane: number | null;
  startMethod: string | null;
  distanceMeters: number | null;
  starters: number | null;
  startOdds: number;
  lockedWinOdds: number;
  oddsDropPercent: number;
  cvRaw: number | null;
  cvDisplay: number | null;
  strength: number;
  indicatorsGreen: string[];
  validOddsPoints: number;
  stakeOren: number;
  resultOutcome: WinPlaceResultOutcome;
  resultStatus: WinPlaceResultStatus;
  finishPositionOfficial: number | null;
  officialWinOddsDecimal: number | null;
  placeOddsDecimal: number | null;
  returnOren: number | null;
  netOren: number | null;
  roiPct: number | null;
  automaticModelBet: boolean;
  userActuallyPlayed: boolean;
  resultSource: string | null;
  resultUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WinPlaceStats = {
  count: number;
  pending: number;
  voids: number;
  settled: number;
  hits: number;
  misses: number;
  hitRate: number;
  economicBets: number;
  totalStakeOren: number;
  totalReturnOren: number;
  totalNetOren: number;
  roiPct: number;
  averagePayoutOdds: number | null;
};

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeWinPlaceStats(
  bets: WinPlaceBetRecord[],
  market?: WinPlaceMarket,
): WinPlaceStats {
  const selected = market
    ? bets.filter((bet) => bet.market === market)
    : bets;

  const settled = selected.filter(
    (bet) =>
      bet.resultOutcome === "HIT" ||
      bet.resultOutcome === "MISS",
  );

  const hits = settled.filter(
    (bet) => bet.resultOutcome === "HIT",
  ).length;

  const misses = settled.filter(
    (bet) => bet.resultOutcome === "MISS",
  ).length;

  const economic = selected.filter(
    (bet) =>
      bet.resultStatus === "RESULT_READY" &&
      bet.returnOren !== null &&
      bet.netOren !== null,
  );

  const totalStakeOren = economic.reduce(
    (sum, bet) => sum + bet.stakeOren,
    0,
  );

  const totalReturnOren = economic.reduce(
    (sum, bet) => sum + (bet.returnOren ?? 0),
    0,
  );

  const totalNetOren = totalReturnOren - totalStakeOren;

  const payoutOdds = selected
    .filter(
      (bet) =>
        bet.resultOutcome === "HIT" &&
        (bet.market === "WIN"
          ? bet.officialWinOddsDecimal !== null
          : bet.placeOddsDecimal !== null),
    )
    .map((bet) =>
      bet.market === "WIN"
        ? (bet.officialWinOddsDecimal as number)
        : (bet.placeOddsDecimal as number),
    );

  return {
    count: selected.length,
    pending: selected.filter(
      (bet) => bet.resultOutcome === "PENDING",
    ).length,
    voids: selected.filter(
      (bet) => bet.resultOutcome === "VOID",
    ).length,
    settled: settled.length,
    hits,
    misses,
    hitRate:
      settled.length > 0 ? (hits / settled.length) * 100 : 0,
    economicBets: economic.length,
    totalStakeOren,
    totalReturnOren,
    totalNetOren,
    roiPct:
      totalStakeOren > 0
        ? round((totalNetOren / totalStakeOren) * 100)
        : 0,
    averagePayoutOdds:
      payoutOdds.length > 0
        ? payoutOdds.reduce((sum, odds) => sum + odds, 0) /
          payoutOdds.length
        : null,
  };
}
