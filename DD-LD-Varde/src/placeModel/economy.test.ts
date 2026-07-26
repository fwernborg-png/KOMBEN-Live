import { describe, expect, it } from "vitest";
import { applySettledResult, sekToOren } from "./economy";

describe("place economy", () => {
  it("top 3 with missing place odds counts as hit but not economic ROI", () => {
    const settled = applySettledResult({
      stakeOren: sekToOren(100),
      finishPosition: 3,
      maxHitPosition: 3,
      placeOddsDecimal: null,
    });

    expect(settled.resultOutcome).toBe("HIT");
    expect(settled.resultStatus).toBe("SAKNAR_PLATSODDS");
    expect(settled.returnOren).toBeNull();
    expect(settled.roiPct).toBeNull();
  });

  it("miss gives zero return and -100 ROI", () => {
    const settled = applySettledResult({
      stakeOren: sekToOren(100),
      finishPosition: 4,
      maxHitPosition: 3,
      placeOddsDecimal: null,
    });

    expect(settled.resultOutcome).toBe("MISS");
    expect(settled.returnOren).toBe(0);
    expect(settled.roiPct).toBe(-100);
  });

  it("money math uses ore safely", () => {
    const settled = applySettledResult({
      stakeOren: sekToOren(100),
      finishPosition: 1,
      maxHitPosition: 3,
      placeOddsDecimal: 1.58,
    });

    expect(settled.returnOren).toBe(15800);
    expect(settled.netOren).toBe(5800);
    expect(settled.roiPct).toBe(58);
  });
});
