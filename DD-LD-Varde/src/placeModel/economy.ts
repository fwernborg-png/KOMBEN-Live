import type { PlaceBet } from "./types";

export function sekToOren(sek: number): number {
  return Math.round(sek * 100);
}

export function orenToSek(oren: number): number {
  return oren / 100;
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function calcHit(placePosition: number, maxHitPosition: number): boolean {
  return placePosition >= 1 && placePosition <= maxHitPosition;
}

export function applySettledResult(args: {
  stakeOren: number;
  finishPosition: number;
  maxHitPosition: number;
  placeOddsDecimal: number | null;
}): Pick<
  PlaceBet,
  "resultOutcome" | "resultStatus" | "returnOren" | "netOren" | "roiPct"
> {
  const { stakeOren, finishPosition, maxHitPosition, placeOddsDecimal } = args;

  if (finishPosition <= 0) {
    return {
      resultOutcome: "PENDING",
      resultStatus: "PENDING",
      returnOren: null,
      netOren: null,
      roiPct: null,
    };
  }

  if (!calcHit(finishPosition, maxHitPosition)) {
    return {
      resultOutcome: "MISS",
      resultStatus: "RESULT_READY",
      returnOren: 0,
      netOren: -stakeOren,
      roiPct: -100,
    };
  }

  if (placeOddsDecimal === null || !Number.isFinite(placeOddsDecimal) || placeOddsDecimal <= 0) {
    return {
      resultOutcome: "HIT",
      resultStatus: "SAKNAR_PLATSODDS",
      returnOren: null,
      netOren: null,
      roiPct: null,
    };
  }

  const returnOren = Math.round(stakeOren * placeOddsDecimal);
  const netOren = returnOren - stakeOren;
  const roiPct = round((netOren / stakeOren) * 100, 4);

  return {
    resultOutcome: "HIT",
    resultStatus: "RESULT_READY",
    returnOren,
    netOren,
    roiPct,
  };
}

export function computePlaceStats(bets: PlaceBet[]) {
  const settled = bets.filter((bet) => bet.resultOutcome === "HIT" || bet.resultOutcome === "MISS");
  const hits = settled.filter((bet) => bet.resultOutcome === "HIT").length;
  const misses = settled.filter((bet) => bet.resultOutcome === "MISS").length;
  const voids = bets.filter((bet) => bet.resultOutcome === "VOID").length;
  const pending = bets.filter((bet) => bet.resultOutcome === "PENDING").length;
  const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;

  const economicBets = bets.filter((bet) => bet.resultStatus === "RESULT_READY" && bet.returnOren !== null && bet.netOren !== null);
  const totalStakeOren = economicBets.reduce((sum, bet) => sum + bet.stakeOren, 0);
  const totalReturnOren = economicBets.reduce((sum, bet) => sum + (bet.returnOren ?? 0), 0);
  const totalNetOren = totalReturnOren - totalStakeOren;
  const roiPct = totalStakeOren > 0 ? round((totalNetOren / totalStakeOren) * 100, 4) : 0;

  const avgPlaceOdds = (() => {
    const odds = bets
      .filter((bet) => bet.resultOutcome === "HIT" && bet.placeOddsDecimal !== null)
      .map((bet) => bet.placeOddsDecimal as number);
    if (!odds.length) return null;
    return odds.reduce((sum, val) => sum + val, 0) / odds.length;
  })();

  const avgWinOddsAtLock = (() => {
    const odds = bets.map((bet) => bet.currentWinOdds).filter((val) => Number.isFinite(val));
    if (!odds.length) return null;
    return odds.reduce((sum, val) => sum + val, 0) / odds.length;
  })();

  return {
    count: bets.length,
    pending,
    voids,
    settled: settled.length,
    hits,
    misses,
    hitRate,
    totalStakeOren,
    totalReturnOren,
    totalNetOren,
    roiPct,
    avgPlaceOdds,
    avgWinOddsAtLock,
  };
}
