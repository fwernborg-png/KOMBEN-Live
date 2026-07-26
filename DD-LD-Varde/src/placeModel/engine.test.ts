import { describe, expect, it } from "vitest";
import { PLACE_RULE_CONFIG_V1 } from "./config";
import { evaluatePlaceModelAtLock } from "./engine";

function makeRace(overrides: Partial<Parameters<typeof evaluatePlaceModelAtLock>[0]["race"]> = {}) {
  return {
    raceId: "race-1",
    date: "2026-07-26",
    trackId: 1,
    trackName: "Solvalla",
    raceNumber: 5,
    plannedStartTime: "2026-07-26T18:00:00.000Z",
    raceStatus: "scheduled",
    isMonte: false,
    startMethod: "AUTO",
    distanceMeters: 2140,
    starters: 10,
    ...overrides,
  };
}

function buildHistory(values: number[], startMs: number) {
  return values.map((odds, index) => ({
    odds,
    timestamp: startMs - (60 - index * 10) * 60_000,
  }));
}

function makeRunner(args: {
  number: number;
  name?: string;
  scratched?: boolean;
  current?: number;
  strength?: number;
  history: number[];
    horseId?: number;
    gallopPercent?: number | null;
    gallopIsFresh?: boolean;
    gallopSource?: string | null;
}) {
  const startMs = new Date("2026-07-26T18:00:00.000Z").getTime();
  return {
    number: args.number,
    name: args.name ?? `Horse ${args.number}`,
      horseId: args.horseId ?? 10_000 + args.number,
    startLane: args.number,
    scratched: args.scratched ?? false,
    currentWinOddsDecimal: args.current ?? args.history[args.history.length - 1],
    indicatorsGreen: ["KR", "ST", "K", "SP"],
    strength: args.strength ?? 4,
      gallopPercent: args.gallopPercent ?? null,
      gallopIsFresh: args.gallopIsFresh ?? false,
      gallopSource: args.gallopSource ?? null,
    oddsHistory: buildHistory(args.history, startMs),
  };
}

describe("place model engine", () => {
  it("play when smoothest has odds drop, strength 4 and odds 9.99", () => {
    const race = makeRace();
    const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
    const runners = [
      makeRunner({ number: 1, history: [11.0, 10.8, 10.6, 10.4, 10.2, 9.99], current: 9.99, strength: 4 }),
      makeRunner({ number: 2, history: [8.0, 8.8, 9.5, 10.1, 10.9, 11.5], current: 11.5, strength: 5 }),
    ];

    const result = evaluatePlaceModelAtLock({
      race,
      runners,
      nowMs,
      config: PLACE_RULE_CONFIG_V1,
      alreadyLockedForVersion: false,
      appStartedAfterLock: false,
    });

    expect(result.decision).toBe("PLAY");
    expect(result.smoothest?.runnerNumber).toBe(1);
  });

  it("no play when current odds is exactly 10.00", () => {
    const race = makeRace();
    const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
    const runners = [
      makeRunner({ number: 1, history: [11.2, 10.8, 10.5, 10.3, 10.1, 10.0], current: 10.0, strength: 5 }),
      makeRunner({ number: 2, history: [12, 12.4, 12.6, 12.9, 13.2, 13.5], current: 13.5, strength: 5 }),
    ];

    const result = evaluatePlaceModelAtLock({ race, runners, nowMs, config: PLACE_RULE_CONFIG_V1, alreadyLockedForVersion: false, appStartedAfterLock: false });
    expect(result.decision).toBe("NO_PLAY");
    expect(result.reasons.join(" ")).toMatch(/Aktuellt vinnarodds/);
  });

  it("no play when fewer than 5 valid points", () => {
    const race = makeRace();
    const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
    const runner = makeRunner({ number: 1, history: [9.5, 9.3, 9.1, 8.9], current: 8.9, strength: 5 });
    const result = evaluatePlaceModelAtLock({
      race,
      runners: [runner],
      nowMs,
      config: PLACE_RULE_CONFIG_V1,
      alreadyLockedForVersion: false,
      appStartedAfterLock: false,
    });

    expect(result.decision === "INSUFFICIENT_DATA" || result.decision === "NO_PLAY").toBe(true);
  });

  it("excluded for monte race", () => {
    const race = makeRace({ isMonte: true });
    const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
    const result = evaluatePlaceModelAtLock({
      race,
      runners: [makeRunner({ number: 1, history: [9, 8.8, 8.6, 8.5, 8.4, 8.3], current: 8.3, strength: 5 })],
      nowMs,
      config: PLACE_RULE_CONFIG_V1,
      alreadyLockedForVersion: false,
      appStartedAfterLock: false,
    });

    expect(result.decision).toBe("EXCLUDED");
  });

  it("tie-break order: strength, then lower current odds, then bigger drop, then number", () => {
    const race = makeRace();
    const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
    const r1 = makeRunner({ number: 1, history: [10, 10, 10, 10, 10, 9], current: 9, strength: 5 });
    const r2 = makeRunner({ number: 2, history: [10, 10, 10, 10, 10, 9], current: 9, strength: 4 });

    const result = evaluatePlaceModelAtLock({
      race,
      runners: [r1, r2],
      nowMs,
      config: PLACE_RULE_CONFIG_V1,
      alreadyLockedForVersion: false,
      appStartedAfterLock: false,
    });

    expect(result.smoothest?.runnerNumber).toBe(1);
  });

  it("invalid 99.99 odds cannot become valid smoothest", () => {
    const race = makeRace();
    const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
    const result = evaluatePlaceModelAtLock({
      race,
      runners: [
        makeRunner({ number: 1, history: [99.99, 99.99, 99.99, 99.99, 99.99, 99.99], current: 99.99, strength: 6 }),
        makeRunner({ number: 2, history: [9.9, 9.8, 9.7, 9.6, 9.5, 9.4], current: 9.4, strength: 4 }),
      ],
      nowMs,
      config: PLACE_RULE_CONFIG_V1,
      alreadyLockedForVersion: false,
      appStartedAfterLock: false,
    });

    expect(result.smoothest?.runnerNumber).toBe(2);
  });

    it("no play when indicator data is incomplete at lock", () => {
      const race = makeRace();
      const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
      const runners = [
        makeRunner({ number: 1, history: [10.8, 10.6, 10.4, 10.2, 10.0, 9.8], strength: 5 }),
        makeRunner({ number: 2, history: [12.5, 12.2, 11.9, 11.6, 11.3, 11.0], strength: 4 }),
      ];

      const result = evaluatePlaceModelAtLock({
        race,
        runners,
        nowMs,
        config: PLACE_RULE_CONFIG_V1,
        alreadyLockedForVersion: false,
        appStartedAfterLock: false,
        hasCompleteIndicatorData: false,
        incompleteIndicatorRunnerNumbers: [1, 2],
      });

      expect(result.decision).toBe("NO_PLAY");
      expect(result.reasons).toContain("INGET PLATSSPEL – OFULLSTÄNDIG INDIKATORDATA");
      expect(result.snapshot.incompleteIndicatorRunnerNumbers).toEqual([1, 2]);
    });

    it("snapshot stores gallop source metadata for each runner", () => {
      const race = makeRace();
      const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
      const runners = [
        makeRunner({
          number: 1,
          history: [11.0, 10.8, 10.6, 10.3, 10.1, 9.9],
          strength: 5,
          gallopPercent: 12,
          gallopIsFresh: true,
          gallopSource: "ATG_HORSE_RESULTS",
        }),
      ];

      const result = evaluatePlaceModelAtLock({
        race,
        runners,
        nowMs,
        config: PLACE_RULE_CONFIG_V1,
        alreadyLockedForVersion: false,
        appStartedAfterLock: false,
      });

      const runnerIndicators = (result.snapshot.runnerIndicators as Array<Record<string, unknown>>) ?? [];
      expect(runnerIndicators.length).toBe(1);
      expect(runnerIndicators[0]?.horseId).toBe(10_001);
      expect(runnerIndicators[0]?.gallopPercent).toBe(12);
      expect(runnerIndicators[0]?.gallopSource).toBe("ATG_HORSE_RESULTS");
      expect(runnerIndicators[0]?.gallopIsFresh).toBe(true);
    });

    it("no play when odds history is incomplete at lock", () => {
      const race = makeRace();
      const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
      const runners = [
        makeRunner({ number: 1, history: [10.8, 10.6, 10.4, 10.2, 10.0, 9.8], strength: 5 }),
      ];

      const result = evaluatePlaceModelAtLock({
        race,
        runners,
        nowMs,
        config: PLACE_RULE_CONFIG_V1,
        alreadyLockedForVersion: false,
        appStartedAfterLock: false,
        hasCompleteOddsHistory: false,
        incompleteOddsHistoryRunnerNumbers: [1],
      });

      expect(result.decision).toBe("NO_PLAY");
      expect(result.reasons).toContain("INGET PLATSSPEL – OTILLRÄCKLIG ODDHISTORIK");
      expect(result.snapshot.incompleteOddsHistoryRunnerNumbers).toEqual([1]);
    });

    it("no play when current lock-point odds are missing", () => {
      const race = makeRace();
      const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
      const runners = [
        makeRunner({ number: 1, history: [10.8, 10.6, 10.4, 10.2, 10.0, 9.8], strength: 5 }),
      ];

      const result = evaluatePlaceModelAtLock({
        race,
        runners,
        nowMs,
        config: PLACE_RULE_CONFIG_V1,
        alreadyLockedForVersion: false,
        appStartedAfterLock: false,
        hasFreshCurrentOddsPoint: false,
      });

      expect(result.decision).toBe("NO_PLAY");
      expect(result.reasons).toContain("INGET PLATSSPEL – AKTUELL ODDSPUNKT SAKNAS");
    });
});
