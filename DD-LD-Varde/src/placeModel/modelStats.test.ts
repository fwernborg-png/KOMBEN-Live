import {
  describe,
  expect,
  it,
} from "vitest";

import {
  computePlaceStats,
} from "./economy";

import type {
  PlaceBet,
} from "./types";

function bet(
  overrides: Partial<PlaceBet>,
): PlaceBet {
  return {
    betId: "bet",
    raceId: "vinnare_2026-08-07_19_1",
    ruleVersion: "PLACE_V2.0",
    configSnapshot: {} as PlaceBet["configSnapshot"],
    date: "2026-08-07",
    trackId: 19,
    trackName: "Kalmar",
    raceNumber: 1,
    plannedStartTime:
      "2026-08-07T18:20:00Z",
    lockTime:
      "2026-08-07T18:18:30Z",
    horseNumber: 1,
    horseName: "Test",
    startLane: 1,
    startMethod: "AUTO",
    distanceMeters: 2140,
    starters: 10,
    startOdds: 4,
    currentWinOdds: 3,
    oddsDropPercent: 25,
    cvRaw: 1,
    cvDisplay: 1,
    strength: 4,
    indicatorsGreen: [],
    validOddsPoints: 10,
    stakeOren: 10_000,
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
    createdAt:
      "2026-08-07T18:18:30Z",
    updatedAt:
      "2026-08-07T18:18:30Z",
    ...overrides,
  };
}

describe("PLACE model statistics", () => {
  it(
    "räknar modellekonomi även när userActuallyPlayed är false",
    () => {
      const bets = [
        bet({
          betId: "hit",
          resultOutcome: "HIT",
          resultStatus: "RESULT_READY",
          finishPositionOfficial: 2,
          placeOddsDecimal: 1.5,
          returnOren: 15_000,
          netOren: 5_000,
          roiPct: 50,
        }),

        bet({
          betId: "miss",
          resultOutcome: "MISS",
          resultStatus: "RESULT_READY",
          finishPositionOfficial: 5,
          returnOren: 0,
          netOren: -10_000,
          roiPct: -100,
        }),
      ];

      const actual =
        computePlaceStats(bets);

      expect(
        actual.totalStakeOren,
      ).toBe(0);

      const model =
        computePlaceStats(
          bets,
          {
            economyScope: "MODEL",
          },
        );

      expect(model.settled).toBe(2);
      expect(model.hits).toBe(1);
      expect(model.misses).toBe(1);
      expect(model.hitRate).toBe(50);
      expect(
        model.totalStakeOren,
      ).toBe(20_000);
      expect(
        model.totalReturnOren,
      ).toBe(15_000);
      expect(
        model.totalNetOren,
      ).toBe(-5_000);
      expect(model.roiPct).toBe(-25);
    },
  );
});
