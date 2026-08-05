import { describe, expect, it } from "vitest";
import {
  computeWinPlaceStats,
  type WinPlaceBetRecord,
} from "./journal";

function bet(args: {
  id: string;
  market: "WIN" | "PLACE";
  outcome: WinPlaceBetRecord["resultOutcome"];
  status: WinPlaceBetRecord["resultStatus"];
  returnOren: number | null;
  odds?: number | null;
}): WinPlaceBetRecord {
  return {
    id: args.id,
    betId: args.id,
    raceId: `race-${args.id}`,
    ruleVersion: "WIN_PLACE_V1.0",
    market: args.market,
    signalPhase: "LIVE",
    date: "2026-07-29",
    trackId: 1,
    trackName: "Solvalla",
    raceNumber: 1,
    plannedStartTime: "2026-07-29T18:00:00.000Z",
    lockTime: "2026-07-29T17:58:30.000Z",
    secondsBeforeStart: 90,
    horseNumber: 6,
    horseName: "Testhästen",
    horseId: 123,
    startLane: 6,
    startMethod: "AUTO",
    distanceMeters: 2140,
    starters: 10,
    startOdds: 10,
    lockedWinOdds: 5,
    oddsDropPercent: 50,
    cvRaw: 10,
    cvDisplay: 10,
    strength: 3,
    indicatorsGreen: ["KR", "ODD"],
    validOddsPoints: 60,
    stakeOren: 10_000,
    resultOutcome: args.outcome,
    resultStatus: args.status,
    finishPositionOfficial: null,
    officialWinOddsDecimal:
      args.market === "WIN" ? (args.odds ?? null) : null,
    placeOddsDecimal:
      args.market === "PLACE" ? (args.odds ?? null) : null,
    returnOren: args.returnOren,
    netOren:
      args.returnOren === null
        ? null
        : args.returnOren - 10_000,
    roiPct: null,
    automaticModelBet: true,
    userActuallyPlayed: false,
    resultSource: "ATG",
    resultUpdatedAt: null,
    createdAt: "2026-07-29T17:58:30.000Z",
    updatedAt: "2026-07-29T17:58:30.000Z",
  };
}

describe("win-place journal statistics", () => {
  const bets = [
    bet({
      id: "win-hit",
      market: "WIN",
      outcome: "HIT",
      status: "RESULT_READY",
      returnOren: 50_000,
      odds: 5,
    }),
    bet({
      id: "win-miss",
      market: "WIN",
      outcome: "MISS",
      status: "RESULT_READY",
      returnOren: 0,
    }),
    bet({
      id: "place-hit",
      market: "PLACE",
      outcome: "HIT",
      status: "RESULT_READY",
      returnOren: 20_000,
      odds: 2,
    }),
    bet({
      id: "place-miss",
      market: "PLACE",
      outcome: "MISS",
      status: "RESULT_READY",
      returnOren: 0,
    }),
    bet({
      id: "pending",
      market: "WIN",
      outcome: "PENDING",
      status: "PENDING",
      returnOren: null,
    }),
    bet({
      id: "void",
      market: "PLACE",
      outcome: "VOID",
      status: "VOID",
      returnOren: 10_000,
    }),
  ];

  it("räknar vinnarspel separat", () => {
    const stats = computeWinPlaceStats(bets, "WIN");

    expect(stats.settled).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.hitRate).toBe(50);
    expect(stats.lockedStakeOren).toBe(30_000);
    expect(stats.pendingStakeOren).toBe(10_000);
    expect(stats.totalStakeOren).toBe(20_000);
    expect(stats.totalReturnOren).toBe(50_000);
    expect(stats.totalNetOren).toBe(30_000);
    expect(stats.roiPct).toBe(150);
  });

  it("räknar platsspel separat", () => {
    const stats = computeWinPlaceStats(bets, "PLACE");

    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.voids).toBe(1);
    expect(stats.lockedStakeOren).toBe(20_000);
    expect(stats.pendingStakeOren).toBe(0);
    expect(stats.totalStakeOren).toBe(20_000);
    expect(stats.totalReturnOren).toBe(20_000);
    expect(stats.totalNetOren).toBe(0);
    expect(stats.roiPct).toBe(0);
  });

  it("räknar kombinerad ekonomi utan pending och void", () => {
    const stats = computeWinPlaceStats(bets);

    expect(stats.lockedStakeOren).toBe(50_000);
    expect(stats.pendingStakeOren).toBe(10_000);
    expect(stats.totalStakeOren).toBe(40_000);
    expect(stats.totalReturnOren).toBe(70_000);
    expect(stats.totalNetOren).toBe(30_000);
    expect(stats.roiPct).toBe(75);
  });
});
