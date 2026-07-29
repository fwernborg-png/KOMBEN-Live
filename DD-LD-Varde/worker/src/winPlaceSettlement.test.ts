import { describe, expect, it } from "vitest";
import { settleWinPlaceBet } from "./winPlaceSettlement";

const base = {
  stakeOren: 10_000,
  raceCancelled: false,
  horseScratched: false,
  placeHitMaxOfficialFinishPosition: 3,
};

describe("win-place settlement", () => {
  it("rättar ett vinnande vinnarspel", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "WIN",
      finishPosition: 1,
      officialWinOddsDecimal: 5.5,
      placeOddsDecimal: 2.1,
    });

    expect(result.resultOutcome).toBe("HIT");
    expect(result.resultStatus).toBe("RESULT_READY");
    expect(result.returnOren).toBe(55_000);
    expect(result.netOren).toBe(45_000);
    expect(result.roiPct).toBe(450);
  });

  it("rättar ett förlorat vinnarspel", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "WIN",
      finishPosition: 2,
      officialWinOddsDecimal: 5.5,
      placeOddsDecimal: 2.1,
    });

    expect(result.resultOutcome).toBe("MISS");
    expect(result.returnOren).toBe(0);
    expect(result.netOren).toBe(-10_000);
    expect(result.roiPct).toBe(-100);
  });

  it("rättar ett vinnande platsspel", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "PLACE",
      finishPosition: 3,
      officialWinOddsDecimal: 5.5,
      placeOddsDecimal: 2.25,
    });

    expect(result.resultOutcome).toBe("HIT");
    expect(result.returnOren).toBe(22_500);
    expect(result.netOren).toBe(12_500);
    expect(result.roiPct).toBe(125);
  });

  it("rättar fjärdeplats som förlorat platsspel", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "PLACE",
      finishPosition: 4,
      officialWinOddsDecimal: 5.5,
      placeOddsDecimal: null,
    });

    expect(result.resultOutcome).toBe("MISS");
    expect(result.resultStatus).toBe("RESULT_READY");
    expect(result.netOren).toBe(-10_000);
  });

  it("sparar träff men väntar på odds när utbetalningsodds saknas", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "WIN",
      finishPosition: 1,
      officialWinOddsDecimal: null,
      placeOddsDecimal: null,
    });

    expect(result.resultOutcome).toBe("HIT");
    expect(result.resultStatus).toBe("SAKNAR_ODDS");
    expect(result.returnOren).toBeNull();
  });

  it("återbetalar insatsen vid struken häst", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "PLACE",
      horseScratched: true,
      finishPosition: null,
      officialWinOddsDecimal: null,
      placeOddsDecimal: null,
    });

    expect(result.resultOutcome).toBe("VOID");
    expect(result.returnOren).toBe(10_000);
    expect(result.netOren).toBe(0);
    expect(result.roiPct).toBe(0);
  });

  it("lämnar spelet väntande innan resultat finns", () => {
    const result = settleWinPlaceBet({
      ...base,
      market: "WIN",
      finishPosition: null,
      officialWinOddsDecimal: null,
      placeOddsDecimal: null,
    });

    expect(result.resultOutcome).toBe("PENDING");
    expect(result.resultStatus).toBe("PENDING");
  });
});
