import { describe, expect, it } from "vitest";
import {
  calculateOddsDropPercent,
  formatDropPercent,
  hasT60Coverage,
  isValidRawWinOdds,
  pickFirstOddsRawInCollectionWindow,
} from "./oddsLive";
import type { OddsPoint } from "./types";

describe("odds live helpers", () => {
  it("accepts valid raw odds", () => {
    expect(isValidRawWinOdds(875)).toBe(true);
  });

  it("rejects null raw odds", () => {
    expect(isValidRawWinOdds(null)).toBe(false);
  });

  it("rejects invalid sentinel 99.99", () => {
    expect(isValidRawWinOdds(9999)).toBe(false);
  });

  it("uses first point as first odds", () => {
    const history: OddsPoint[] = [
      { odds: 1000, timestamp: 1 },
      { odds: 950, timestamp: 2 },
    ];
    expect(pickFirstOddsRawInCollectionWindow(history)).toBe(1000);
  });

  it("returns null first odds when history is empty", () => {
    expect(pickFirstOddsRawInCollectionWindow([])).toBeNull();
  });

  it("calculates drop percent positive when current is lower", () => {
    expect(calculateOddsDropPercent(1000, 750)).toBe(25);
  });

  it("calculates zero when odds are equal", () => {
    expect(calculateOddsDropPercent(1000, 1000)).toBe(0);
  });

  it("calculates negative when current is higher", () => {
    expect(calculateOddsDropPercent(750, 1000)).toBeCloseTo(-33.3333, 4);
  });

  it("returns null drop percent when first odds missing", () => {
    expect(calculateOddsDropPercent(null, 800)).toBeNull();
  });

  it("returns null drop percent when current odds missing", () => {
    expect(calculateOddsDropPercent(800, null)).toBeNull();
  });

  it("formats missing drop as dash", () => {
    expect(formatDropPercent(null)).toBe("–");
  });

  it("formats flat drop as 0,0 %", () => {
    expect(formatDropPercent(0)).toBe("0,0 %");
  });

  it("formats positive drop with plus sign", () => {
    expect(formatDropPercent(12.34)).toBe("+12,3 %");
  });

  it("formats negative change without plus sign", () => {
    expect(formatDropPercent(-8.12)).toBe("-8,1 %");
  });

  it("marks T-60 coverage true when first point is at collection start", () => {
    const raceStartMs = Date.UTC(2026, 6, 26, 18, 0, 0);
    const collectionStartMs = raceStartMs - 60 * 60_000;
    const history: OddsPoint[] = [{ odds: 1000, timestamp: collectionStartMs }];
    expect(hasT60Coverage({ history, raceStartMs })).toBe(true);
  });

  it("marks T-60 coverage true when first point is inside tolerance", () => {
    const raceStartMs = Date.UTC(2026, 6, 26, 18, 0, 0);
    const collectionStartMs = raceStartMs - 60 * 60_000;
    const history: OddsPoint[] = [{ odds: 1000, timestamp: collectionStartMs + 90_000 }];
    expect(hasT60Coverage({ history, raceStartMs })).toBe(true);
  });

  it("marks T-60 coverage false when first point is too late", () => {
    const raceStartMs = Date.UTC(2026, 6, 26, 18, 0, 0);
    const collectionStartMs = raceStartMs - 60 * 60_000;
    const history: OddsPoint[] = [{ odds: 1000, timestamp: collectionStartMs + 5 * 60_000 }];
    expect(hasT60Coverage({ history, raceStartMs })).toBe(false);
  });

  it("marks T-60 coverage false when race start is invalid", () => {
    const history: OddsPoint[] = [{ odds: 1000, timestamp: 1 }];
    expect(hasT60Coverage({ history, raceStartMs: Number.NaN })).toBe(false);
  });

  it("marks T-60 coverage false when history is missing", () => {
    expect(hasT60Coverage({ history: [], raceStartMs: Date.now() })).toBe(false);
  });

  it("supports tighter custom tolerance", () => {
    const raceStartMs = Date.UTC(2026, 6, 26, 18, 0, 0);
    const collectionStartMs = raceStartMs - 60 * 60_000;
    const history: OddsPoint[] = [{ odds: 1000, timestamp: collectionStartMs + 70_000 }];
    expect(hasT60Coverage({ history, raceStartMs, toleranceMs: 60_000 })).toBe(false);
  });
});
