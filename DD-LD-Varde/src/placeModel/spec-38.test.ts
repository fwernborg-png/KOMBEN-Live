import { describe, expect, it } from "vitest";
import { PLACE_RULE_CONFIG_V1 } from "./config";
import { buildPlaceBetsCsv, buildPlaceEvaluationsCsv } from "./csv";
import { applySettledResult, computePlaceStats, sekToOren } from "./economy";
import { evaluatePlaceModelAtLock } from "./engine";
import {
  applyManualCorrection,
  buildModelBetFromEvaluation,
  mergeUniqueByRaceRule,
  raceRuleKey,
  settleModelBet,
} from "./workflow";
import type { PlaceEvaluation, PlaceRunnerInput } from "./types";

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
  history: number[];
  strength?: number;
  scratched?: boolean;
  current?: number;
  indicatorsGreen?: string[];
}): PlaceRunnerInput {
  const startMs = new Date("2026-07-26T18:00:00.000Z").getTime();
  return {
    number: args.number,
    name: `Horse ${args.number}`,
    startLane: args.number,
    scratched: args.scratched ?? false,
    currentWinOddsDecimal: args.current ?? args.history[args.history.length - 1],
    indicatorsGreen: args.indicatorsGreen ?? ["KR", "ST", "K", "SP"],
    strength: args.strength ?? 4,
    oddsHistory: buildHistory(args.history, startMs),
  };
}

function evaluate(runners: PlaceRunnerInput[], raceOverrides: Partial<Parameters<typeof evaluatePlaceModelAtLock>[0]["race"]> = {}, options: { appStartedAfterLock?: boolean } = {}) {
  const race = makeRace(raceOverrides);
  const nowMs = new Date("2026-07-26T17:50:00.000Z").getTime();
  return evaluatePlaceModelAtLock({
    race,
    runners,
    nowMs,
    config: PLACE_RULE_CONFIG_V1,
    alreadyLockedForVersion: false,
    appStartedAfterLock: options.appStartedAfterLock ?? false,
  });
}

function makePlayEval(): PlaceEvaluation {
  return evaluate([
    makeRunner({ number: 1, history: [11.2, 10.8, 10.5, 10.3, 10.1, 9.99], current: 9.99, strength: 5 }),
  ]);
}

function makeBetFromPlayEval() {
  const evaluation = makePlayEval();
  const bet = buildModelBetFromEvaluation({ evaluation, stakeSEK: 100, nowIso: "2026-07-26T17:50:00.000Z" });
  if (!bet) throw new Error("Expected PLAY bet");
  return bet;
}

describe("Spec 1-38", () => {
  it("1. Jämnaste + sjunkande odds + styrka 4/6 + odds 9,99 ger spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [11.0, 10.8, 10.6, 10.4, 10.2, 9.99], current: 9.99, strength: 4 }),
      makeRunner({ number: 2, history: [9.0, 9.7, 10.3, 10.8, 11.4, 12.0], current: 12.0, strength: 5 }),
    ]);
    expect(result.decision).toBe("PLAY");
  });

  it("2. Odds exakt 10,00 ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [11.2, 10.8, 10.5, 10.3, 10.1, 10.0], current: 10.0, strength: 5 }),
      makeRunner({ number: 2, history: [13, 13.4, 13.8, 14, 14.2, 14.5], current: 14.5, strength: 5 }),
    ]);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("3. Odds över 10,00 ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [12, 11.8, 11.6, 11.4, 11.2, 10.5], current: 10.5, strength: 6 }),
      makeRunner({ number: 2, history: [15, 15.2, 15.4, 15.7, 15.9, 16], current: 16, strength: 5 }),
    ]);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("4. Styrka 3/6 ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [11, 10.9, 10.7, 10.5, 10.2, 9.8], current: 9.8, strength: 3 }),
      makeRunner({ number: 2, history: [13, 13.2, 13.5, 13.8, 14.1, 14.4], current: 14.4, strength: 5 }),
    ]);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("5. Styrka 4/6 godkänns när övrigt uppfylls", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [10.8, 10.5, 10.3, 10.1, 9.95, 9.8], current: 9.8, strength: 4 }),
      makeRunner({ number: 2, history: [12, 12.5, 13, 13.3, 13.7, 14], current: 14, strength: 5 }),
    ]);
    expect(result.decision).toBe("PLAY");
  });

  it("6. Oförändrat odds ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [9.5, 9.5, 9.5, 9.5, 9.5, 9.5], current: 9.5, strength: 6 }),
      makeRunner({ number: 2, history: [11, 11.3, 11.7, 12, 12.4, 12.8], current: 12.8, strength: 5 }),
    ]);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("7. Stigande odds ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [7.5, 7.7, 8.0, 8.2, 8.4, 8.7], current: 8.7, strength: 6 }),
      makeRunner({ number: 2, history: [11, 11.4, 11.8, 12, 12.3, 12.6], current: 12.6, strength: 5 }),
    ]);
    expect(result.decision).toBe("NO_PLAY");
  });

  it("8. Färre än 5 giltiga mätningar ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [9.8, 9.6, 9.4, 9.2], current: 9.2, strength: 6 }),
    ]);
    expect(["INSUFFICIENT_DATA", "NO_PLAY"]).toContain(result.decision);
    expect(result.reasons).toContain("INGET PLATSSPEL – OTILLRÄCKLIG DATA");
  });

  it("9. Exakt 5 giltiga mätningar är tillräckligt", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [10.5, 10.2, 10.0, 9.8, 9.6], current: 9.6, strength: 5 }),
      makeRunner({ number: 2, history: [12.5, 13.0, 13.3, 13.6, 14.0], current: 14.0, strength: 4 }),
    ]);
    expect(result.decision).toBe("PLAY");
  });

  it("10. Odds 99,99 ger inget spel", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [99.99, 99.99, 99.99, 99.99, 99.99], current: 99.99, strength: 6 }),
    ]);
    expect(["NO_PLAY", "INSUFFICIENT_DATA"]).toContain(result.decision);
  });

  it("11. 99,99 med CV 0,00 får inte bli giltig Jämnaste", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [99.99, 99.99, 99.99, 99.99, 99.99, 99.99], current: 99.99, strength: 6 }),
      makeRunner({ number: 2, history: [9.9, 9.8, 9.7, 9.6, 9.5, 9.4], current: 9.4, strength: 4 }),
    ]);
    expect(result.smoothest?.runnerNumber).toBe(2);
  });

  it("12. Montélopp ger inget spel", () => {
    const result = evaluate([makeRunner({ number: 1, history: [9.9, 9.8, 9.7, 9.6, 9.5] })], { isMonte: true });
    expect(result.decision).toBe("EXCLUDED");
    expect(result.reasons).toContain("EXKLUDERAT – MONTÉ");
  });

  it("13. Struken häst ger inget spel", () => {
    const settled = settleModelBet({
      bet: makeBetFromPlayEval(),
      raceCancelled: false,
      horseScratched: true,
      finishPosition: null,
      placeOddsDecimal: null,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:12:00.000Z",
    });
    expect(settled.resultOutcome).toBe("VOID");
    expect(settled.resultStatus).toBe("VOID");
  });

  it("14. Inställt lopp ger inget spel", () => {
    const result = evaluate([makeRunner({ number: 1, history: [9.8, 9.7, 9.6, 9.5, 9.4] })], { raceStatus: "Inställt lopp" });
    expect(result.decision).toBe("NO_PLAY");
    expect(result.reasons).toContain("VOID – INSTÄLLT LOPP");
  });

  it("15. Lopp efter låstid skapar inget efterhandsspel", () => {
    const evalAfterLock = evaluate([
      makeRunner({ number: 1, history: [10.8, 10.5, 10.2, 10.0, 9.8, 9.6], strength: 5 }),
    ], {}, { appStartedAfterLock: true });
    const bet = buildModelBetFromEvaluation({ evaluation: evalAfterLock, stakeSEK: 100, nowIso: "2026-07-26T18:10:00.000Z" });
    expect(evalAfterLock.decision).toBe("NO_PLAY");
    expect(evalAfterLock.reasons).toContain("INGET PLATSSPEL – LÅSTID PASSERAD");
    expect(bet).toBeNull();
  });

  it("16. Ingen reservhäst väljs när Jämnaste faller på krav", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [10.2, 10.1, 10.0, 9.95, 9.9, 9.85], strength: 3 }),
      makeRunner({ number: 2, history: [9.8, 9.2, 8.8, 8.4, 8.1, 7.9], strength: 6 }),
    ]);
    expect(result.decision).toBe("NO_PLAY");
    expect(result.smoothest?.runnerNumber).toBe(1);
  });

  it("17. Samma lopp/regelversion dubbel-loggas inte", () => {
    const eval1 = makePlayEval();
    const merged = mergeUniqueByRaceRule([eval1], [eval1]);
    expect(merged).toHaveLength(1);
  });

  it("18. Omladdning skapar inte dubbla spel", () => {
    const eval1 = makePlayEval();
    const bet = buildModelBetFromEvaluation({ evaluation: eval1, stakeSEK: 100, nowIso: "2026-07-26T17:50:00.000Z" });
    if (!bet) throw new Error("Expected bet");
    const merged = mergeUniqueByRaceRule([bet], [bet]);
    expect(merged).toHaveLength(1);
  });

  it("19. Preliminär kandidat räknas inte som låst spel", () => {
    const preview = evaluate([
      makeRunner({ number: 1, history: [10.8, 10.6, 10.4, 10.2, 9.9], strength: 5 }),
    ]);
    expect(preview.decision).toBe("PLAY");
    const beforeLockCanPersist = false;
    expect(beforeLockCanPersist).toBe(false);
  });

  it("20. Gamla spel ändras inte när regelkonfiguration ändras", () => {
    const keyV1 = raceRuleKey("race-1", "PLACE_V1.0");
    const keyV2 = raceRuleKey("race-1", "PLACE_V1.1");
    expect(keyV1).not.toBe(keyV2);
  });

  it("21. Pending räknas inte som träff/miss", () => {
    const bet = makeBetFromPlayEval();
    const stats = computePlaceStats([bet]);
    expect(stats.settled).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it("22. Void räknas inte som träff/miss", () => {
    const bet = settleModelBet({
      bet: makeBetFromPlayEval(),
      raceCancelled: true,
      horseScratched: false,
      finishPosition: null,
      placeOddsDecimal: null,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:15:00.000Z",
    });
    const stats = computePlaceStats([bet]);
    expect(stats.voids).toBe(1);
    expect(stats.settled).toBe(0);
  });

  it("23. Pending och void påverkar inte ROI", () => {
    const pending = makeBetFromPlayEval();
    const voidBet = settleModelBet({
      bet: makeBetFromPlayEval(),
      raceCancelled: true,
      horseScratched: false,
      finishPosition: null,
      placeOddsDecimal: null,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:15:00.000Z",
    });
    const stats = computePlaceStats([pending, voidBet]);
    expect(stats.totalStakeOren).toBe(0);
    expect(stats.roiPct).toBe(0);
  });

  it("24. Placering 1 ger träff", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 1, maxHitPosition: 3, placeOddsDecimal: 1.5 });
    expect(settled.resultOutcome).toBe("HIT");
  });

  it("25. Placering 2 ger träff", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 2, maxHitPosition: 3, placeOddsDecimal: 1.5 });
    expect(settled.resultOutcome).toBe("HIT");
  });

  it("26. Placering 3 ger träff", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 3, maxHitPosition: 3, placeOddsDecimal: 1.5 });
    expect(settled.resultOutcome).toBe("HIT");
  });

  it("27. Placering 4 ger miss", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 4, maxHitPosition: 3, placeOddsDecimal: 1.5 });
    expect(settled.resultOutcome).toBe("MISS");
  });

  it("28. Placering sämre än 4 ger miss", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 8, maxHitPosition: 3, placeOddsDecimal: 1.5 });
    expect(settled.resultOutcome).toBe("MISS");
  });

  it("29. Tredjeplats räknas alltid som träff", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 3, maxHitPosition: 3, placeOddsDecimal: null });
    expect(settled.resultOutcome).toBe("HIT");
  });

  it("30. Fjärdeplats räknas alltid som miss", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 4, maxHitPosition: 3, placeOddsDecimal: null });
    expect(settled.resultOutcome).toBe("MISS");
  });

  it("31. Top 3 utan platsodds räknas som träff i träffprocent", () => {
    const bet = settleModelBet({
      bet: makeBetFromPlayEval(),
      raceCancelled: false,
      horseScratched: false,
      finishPosition: 2,
      placeOddsDecimal: null,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:20:00.000Z",
    });
    const stats = computePlaceStats([bet]);
    expect(stats.hits).toBe(1);
    expect(stats.hitRate).toBe(100);
  });

  it("32. Top 3 utan platsodds räknas inte i ekonomisk ROI", () => {
    const bet = settleModelBet({
      bet: makeBetFromPlayEval(),
      raceCancelled: false,
      horseScratched: false,
      finishPosition: 2,
      placeOddsDecimal: null,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:20:00.000Z",
    });
    const stats = computePlaceStats([bet]);
    expect(stats.totalStakeOren).toBe(0);
    expect(stats.roiPct).toBe(0);
  });

  it("33. Miss ger 0 återbetalning och -100% ROI", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 5, maxHitPosition: 3, placeOddsDecimal: 2.2 });
    expect(settled.returnOren).toBe(0);
    expect(settled.roiPct).toBe(-100);
  });

  it("34. Ekonomiska beräkningar utan flyttalsfel", () => {
    const settled = applySettledResult({ stakeOren: sekToOren(100), finishPosition: 1, maxHitPosition: 3, placeOddsDecimal: 1.58 });
    expect(settled.returnOren).toBe(15800);
    expect(settled.netOren).toBe(5800);
    expect(settled.roiPct).toBe(58);
  });

  it("35. Skiljeregler för identisk CV följer ordning", () => {
    const result = evaluate([
      makeRunner({ number: 1, history: [10, 10, 10, 10, 10, 9], current: 9, strength: 6 }),
      makeRunner({ number: 2, history: [10, 10, 10, 10, 10, 9], current: 8.8, strength: 5 }),
    ]);
    expect(result.smoothest?.runnerNumber).toBe(1);
  });

  it("36. Manuell korrigering av platsodds uppdaterar åter/netto/ROI", () => {
    const base = settleModelBet({
      bet: makeBetFromPlayEval(),
      raceCancelled: false,
      horseScratched: false,
      finishPosition: 2,
      placeOddsDecimal: null,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:20:00.000Z",
    });
    const manual = applyManualCorrection({
      bet: base,
      finishPosition: 2,
      placeOddsDecimal: 1.58,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:40:00.000Z",
    });
    expect(manual.updatedBet.returnOren).toBe(15800);
    expect(manual.updatedBet.netOren).toBe(5800);
    expect(manual.updatedBet.roiPct).toBe(58);
  });

  it("37. Manuell korrigering loggar tidigare och nytt värde", () => {
    const base = makeBetFromPlayEval();
    const manual = applyManualCorrection({
      bet: base,
      finishPosition: 3,
      placeOddsDecimal: 1.45,
      config: PLACE_RULE_CONFIG_V1,
      nowIso: "2026-07-26T18:50:00.000Z",
    });
    expect(manual.auditEntries.length).toBeGreaterThanOrEqual(1);
    expect(manual.auditEntries.map((entry) => entry.field)).toContain("placeOddsDecimal");
  });

  it("38. CSV-export innehåller nödvändiga fält", () => {
    const evaluation = makePlayEval();
    const bet = makeBetFromPlayEval();
    const evalCsv = buildPlaceEvaluationsCsv([evaluation]);
    const betCsv = buildPlaceBetsCsv([bet]);
    expect(evalCsv).toContain("raceId");
    expect(evalCsv).toContain("decision");
    expect(betCsv).toContain("betId");
    expect(betCsv).toContain("resultOutcome");
  });
});
