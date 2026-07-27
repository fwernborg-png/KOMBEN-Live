import { describe, expect, it } from "vitest";
import { normalizeAtgStartTime, parseAtgStartTimeMs } from "./atgTime";

describe("parseAtgStartTimeMs", () => {
  it("tolkar ATG-tid utan tidszon som svensk sommartid", () => {
    const result = parseAtgStartTimeMs("2026-07-27T12:21:00");

    expect(new Date(result).toISOString()).toBe(
      "2026-07-27T10:21:00.000Z",
    );
  });

  it("tolkar ATG-tid utan tidszon som svensk vintertid", () => {
    const result = parseAtgStartTimeMs("2026-01-27T12:21:00");

    expect(new Date(result).toISOString()).toBe(
      "2026-01-27T11:21:00.000Z",
    );
  });

  it("behåller en uttrycklig UTC-tid oförändrad", () => {
    const result = parseAtgStartTimeMs("2026-07-27T12:21:00Z");

    expect(new Date(result).toISOString()).toBe(
      "2026-07-27T12:21:00.000Z",
    );
  });

  it("normaliserar svensk ATG-tid till UTC-format", () => {
    expect(normalizeAtgStartTime("2026-07-27T12:21:00")).toBe(
      "2026-07-27T10:21:00.000Z",
    );
  });

  it("returnerar NaN för ogiltig tid", () => {
    expect(parseAtgStartTimeMs("felaktig tid")).toBeNaN();
  });
});
