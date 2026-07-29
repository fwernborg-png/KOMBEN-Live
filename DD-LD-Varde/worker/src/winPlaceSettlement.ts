export type WinPlaceSettlementMarket = "WIN" | "PLACE";

export type WinPlacePendingBetRow = {
  id: string;
  bet_id: string;
  race_id: string;
  rule_version: string;
  market: WinPlaceSettlementMarket;
  signal_phase: "LIVE" | "BACKTEST";
  date: string;
  track_id: number;
  track_name: string;
  race_number: number;
  horse_number: number;
  horse_name: string;
  stake_oren: number;
  result_outcome: "PENDING" | "HIT" | "MISS" | "VOID";
};

export type WinPlaceSettlementResult = {
  resultOutcome: "PENDING" | "HIT" | "MISS" | "VOID";
  resultStatus:
    | "PENDING"
    | "RESULT_READY"
    | "SAKNAR_ODDS"
    | "VOID";
  finishPositionOfficial: number | null;
  officialWinOddsDecimal: number | null;
  placeOddsDecimal: number | null;
  returnOren: number | null;
  netOren: number | null;
  roiPct: number | null;
};

function validOdds(value: number | null) {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value > 0 &&
    Math.abs(value - 99.99) > 0.001
  );
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function settleWinPlaceBet(args: {
  market: WinPlaceSettlementMarket;
  stakeOren: number;
  raceCancelled: boolean;
  horseScratched: boolean;
  finishPosition: number | null;
  officialWinOddsDecimal: number | null;
  placeOddsDecimal: number | null;
  placeHitMaxOfficialFinishPosition: number;
}): WinPlaceSettlementResult {
  const {
    market,
    stakeOren,
    raceCancelled,
    horseScratched,
    finishPosition,
    officialWinOddsDecimal,
    placeOddsDecimal,
    placeHitMaxOfficialFinishPosition,
  } = args;

  if (raceCancelled || horseScratched) {
    return {
      resultOutcome: "VOID",
      resultStatus: "VOID",
      finishPositionOfficial: finishPosition,
      officialWinOddsDecimal:
        market === "WIN" ? officialWinOddsDecimal : null,
      placeOddsDecimal:
        market === "PLACE" ? placeOddsDecimal : null,
      returnOren: stakeOren,
      netOren: 0,
      roiPct: 0,
    };
  }

  if (
    finishPosition === null ||
    !Number.isFinite(finishPosition) ||
    finishPosition <= 0
  ) {
    return {
      resultOutcome: "PENDING",
      resultStatus: "PENDING",
      finishPositionOfficial: null,
      officialWinOddsDecimal: null,
      placeOddsDecimal: null,
      returnOren: null,
      netOren: null,
      roiPct: null,
    };
  }

  const hit =
    market === "WIN"
      ? finishPosition === 1
      : finishPosition <=
        placeHitMaxOfficialFinishPosition;

  if (!hit) {
    return {
      resultOutcome: "MISS",
      resultStatus: "RESULT_READY",
      finishPositionOfficial: finishPosition,
      officialWinOddsDecimal:
        market === "WIN" ? officialWinOddsDecimal : null,
      placeOddsDecimal:
        market === "PLACE" ? placeOddsDecimal : null,
      returnOren: 0,
      netOren: -stakeOren,
      roiPct: -100,
    };
  }

  const payoutOdds =
    market === "WIN"
      ? officialWinOddsDecimal
      : placeOddsDecimal;

  if (!validOdds(payoutOdds)) {
    return {
      resultOutcome: "HIT",
      resultStatus: "SAKNAR_ODDS",
      finishPositionOfficial: finishPosition,
      officialWinOddsDecimal:
        market === "WIN" ? officialWinOddsDecimal : null,
      placeOddsDecimal:
        market === "PLACE" ? placeOddsDecimal : null,
      returnOren: null,
      netOren: null,
      roiPct: null,
    };
  }

  const returnOren = Math.round(stakeOren * payoutOdds);
  const netOren = returnOren - stakeOren;
  const roiPct = round((netOren / stakeOren) * 100);

  return {
    resultOutcome: "HIT",
    resultStatus: "RESULT_READY",
    finishPositionOfficial: finishPosition,
    officialWinOddsDecimal:
      market === "WIN" ? officialWinOddsDecimal : null,
    placeOddsDecimal:
      market === "PLACE" ? placeOddsDecimal : null,
    returnOren,
    netOren,
    roiPct,
  };
}
