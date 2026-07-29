import { describe, expect, it } from "vitest";
import { latestYearWinPercent } from "./index";

describe("latestYearWinPercent", () => {
  it("räknar kuskprocent från ATG:s objektform", () => {
    const value = latestYearWinPercent({
      "2025": {
        starts: 1772,
        placement: {
          "1": 242,
        },
      },
    });

    expect(value).toBeCloseTo(
      (242 / 1772) * 100,
      8,
    );
  });

  it("väljer senaste året", () => {
    const value = latestYearWinPercent({
      "2024": {
        starts: 100,
        placement: {
          "1": 10,
        },
      },
      "2025": {
        starts: 200,
        placement: {
          "1": 30,
        },
      },
    });

    expect(value).toBeCloseTo(15, 8);
  });

  it("klarar den äldre arrayformen", () => {
    const value = latestYearWinPercent([
      {
        year: 2025,
        winPercentage: 0.18,
      },
    ]);

    expect(value).toBe(18);
  });
});
