import { describe, expect, it } from "vitest";
import { deriveLiveSignalState } from "./liveStatus";
import type { PlaceBet, PlaceEvaluation } from "./types";

function makeEval(overrides: Partial<PlaceEvaluation> = {}): PlaceEvaluation {
  return {
    raceId: "r1",
    ruleVersion: "PLACE_V1.0",
    decision: "PLAY",
    reasons: [],
    race: {
      raceId: "r1",
      date: "2026-07-26",
      trackId: 1,
      trackName: "Solvalla",
      raceNumber: 3,
      plannedStartTime: "2026-07-26T18:00:00.000Z",
      isMonte: false,
      startMethod: "AUTO",
      distanceMeters: 2140,
      starters: 10,
    },
    lockedAt: "2026-07-26T17:50:00.000Z",
    lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
    configSnapshot: {
      ruleVersion: "PLACE_V1.0",
      collectionStartMinutesBeforeRace: 60,
      lockMinutesBeforeRace: 1,
      minStrength: 4,
      maxCurrentWinOddsExclusive: 10,
      requireOddsDrop: true,
      requireSmoothestHorse: true,
      minValidOddsPoints: 5,
      excludeMonte: true,
      defaultStakeSEK: 100,
      hitMaxOfficialFinishPosition: 3,
    },
    checks: [],
    smoothest: {
      runnerNumber: 5,
      runnerName: "Runner 5",
      startLane: 5,
      startOdds: 10,
      currentWinOdds: 8,
      oddsDropPercent: 20,
      validOddsPoints: 8,
      cvRaw: 2,
      cvDisplay: 2,
      strength: 5,
      indicatorsGreen: ["KR", "ST"],
    },
    createdAt: "2026-07-26T17:50:00.000Z",
    updatedAt: "2026-07-26T17:50:00.000Z",
    snapshot: {},
    ...overrides,
  };
}

function makeBet(overrides: Partial<PlaceBet> = {}): PlaceBet {
  return {
    betId: "b1",
    raceId: "r1",
    ruleVersion: "PLACE_V1.0",
    configSnapshot: makeEval().configSnapshot,
    date: "2026-07-26",
    trackId: 1,
    trackName: "Solvalla",
    raceNumber: 3,
    plannedStartTime: "2026-07-26T18:00:00.000Z",
    lockTime: "2026-07-26T17:50:00.000Z",
    horseNumber: 5,
    horseName: "Runner 5",
    startLane: 5,
    startMethod: "AUTO",
    distanceMeters: 2140,
    starters: 10,
    startOdds: 10,
    currentWinOdds: 8,
    oddsDropPercent: 20,
    cvRaw: 2,
    cvDisplay: 2,
    strength: 5,
    indicatorsGreen: ["KR", "ST"],
    validOddsPoints: 8,
    stakeOren: 10000,
    resultOutcome: "PENDING",
    resultStatus: "PENDING",
    finishPositionOfficial: null,
    placeOddsDecimal: null,
    returnOren: null,
    netOren: null,
    roiPct: null,
    automaticModelBet: true,
    userActuallyPlayed: false,
    resultSource: null,
    resultUpdatedAt: null,
    placeOddsEntryMethod: null,
    createdAt: "2026-07-26T17:50:00.000Z",
    updatedAt: "2026-07-26T17:50:00.000Z",
    ...overrides,
  };
}

describe("live signal status", () => {
  it("shows PRELIM_WATCH before lock when preview is PLAY", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 45, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: makeEval({ decision: "PLAY" }),
      lockedEvaluation: null,
      lockedBet: null,
    });
    expect(state.mode).toBe("PRELIM_WATCH");
    expect(state.statusText).toBe("BEVAKAS");
    expect(state.highlightedRunnerNumber).toBe(5);
  });

  it("shows LOCKED_PLAY when locked evaluation is PLAY", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 55, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: null,
      lockedEvaluation: makeEval({ decision: "PLAY" }),
      lockedBet: makeBet({ horseNumber: 7 }),
    });
    expect(state.mode).toBe("LOCKED_PLAY");
    expect(state.statusText).toBe("LÅST PLATSSPEL");
    expect(state.highlightedRunnerNumber).toBe(7);
  });

  it("shows NO_PLAY when locked evaluation is NO_PLAY", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 55, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: null,
      lockedEvaluation: makeEval({ decision: "NO_PLAY" }),
      lockedBet: null,
    });
    expect(state.mode).toBe("NO_PLAY");
    expect(state.highlightedRunnerNumber).toBeNull();
  });

  it("shows INSUFFICIENT_DATA when locked evaluation is insufficient", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 55, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: null,
      lockedEvaluation: makeEval({ decision: "INSUFFICIENT_DATA" }),
      lockedBet: null,
    });
    expect(state.mode).toBe("INSUFFICIENT_DATA");
  });

  it("shows LOCK_TIME_PASSED when reason says lock passed", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 55, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: null,
      lockedEvaluation: makeEval({ decision: "NO_PLAY", reasons: ["INGET PLATSSPEL – LÅSTID PASSERAD"] }),
      lockedBet: null,
    });
    expect(state.mode).toBe("LOCK_TIME_PASSED");
  });

  it("prevents PRELIM_WATCH when lock already passed", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 52, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: makeEval({ decision: "PLAY" }),
      lockedEvaluation: null,
      lockedBet: null,
    });
    expect(state.mode).toBe("LOCK_TIME_PASSED");
    expect(state.highlightedRunnerNumber).toBeNull();
  });

  it("shows NO_PLAY when preview has no candidate", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 40, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: makeEval({ decision: "NO_PLAY", smoothest: null }),
      lockedEvaluation: null,
      lockedBet: null,
    });
    expect(state.mode).toBe("NO_PLAY");
    expect(state.highlightedRunnerNumber).toBeNull();
  });

  it("shows insufficient from preview before lock", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 40, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: makeEval({ decision: "INSUFFICIENT_DATA" }),
      lockedEvaluation: null,
      lockedBet: null,
    });
    expect(state.mode).toBe("INSUFFICIENT_DATA");
  });

  it("highlights exactly one candidate in PRELIM", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 40, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: makeEval({ decision: "PLAY" }),
      lockedEvaluation: null,
      lockedBet: null,
    });
    expect(typeof state.highlightedRunnerNumber).toBe("number");
  });

  it("never returns PRELIM when there is locked evaluation", () => {
    const state = deriveLiveSignalState({
      nowMs: Date.UTC(2026, 6, 26, 17, 40, 0),
      lockTimeMs: Date.UTC(2026, 6, 26, 17, 50, 0),
      preview: makeEval({ decision: "PLAY" }),
      lockedEvaluation: makeEval({ decision: "NO_PLAY" }),
      lockedBet: null,
    });
    expect(state.mode).not.toBe("PRELIM_WATCH");
  });
});
