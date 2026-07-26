import { describe, expect, it } from "vitest";
import {
  computeGallopPercentFromHorseResultsPayload,
  fetchHorseGallopPercent,
  GALLOP_CACHE_TTL_MS,
  horseIdsNeedingGallopRefresh,
  markStaleGallopEntries,
  rankTop4ByGallop,
  resolveRunnerGallop,
  upsertGallopCacheEntry,
  validateGallopCoverageAtLock,
} from "./gallop";

describe("gallop source helpers", () => {
  it("computes gallop percent from horse results and excludes qualifier", () => {
    const payload = {
      records: [
        { place: "1", galloped: false, race: { type: "final" } },
        { place: "g", galloped: false, race: { type: "final" } },
        { place: "2", galloped: true, race: { type: "final" } },
        { place: "dg", galloped: false, race: { type: "final" } },
        { place: "3", galloped: false, race: { type: "qualifier" } },
      ],
    };

    const value = computeGallopPercentFromHorseResultsPayload(payload);
    // 3 gallops out of 4 relevant starts
    expect(value).toBe(75);
  });

  it("returns null when horse results are too few", () => {
    const payload = {
      records: [
        { place: "1", galloped: false, race: { type: "final" } },
        { place: "2", galloped: false, race: { type: "final" } },
      ],
    };

    expect(computeGallopPercentFromHorseResultsPayload(payload)).toBeNull();
  });

  it("ranks lower G as better and returns exact top 4 horseIds", () => {
    const top4 = rankTop4ByGallop({
      entries: [
        { horseId: 12, gallopPercent: 30 },
        { horseId: 17, gallopPercent: 8 },
        { horseId: 18, gallopPercent: 25 },
        { horseId: 21, gallopPercent: 10 },
        { horseId: 9, gallopPercent: 0 },
        { horseId: 33, gallopPercent: null },
      ],
    });

    expect(top4).toEqual([9, 17, 21, 18]);
  });

  it("cache stale entries are marked and excluded from fresh resolution", () => {
    const nowMs = Date.now();
    const cache = {
      101: {
        horseId: 101,
        gallopPercent: 12,
        fetchedAtMs: nowMs - GALLOP_CACHE_TTL_MS - 1000,
        source: "ATG_HORSE_RESULTS" as const,
        stale: false,
        lastError: null,
      },
    };

    const marked = markStaleGallopEntries({ current: cache, nowMs, ttlMs: GALLOP_CACHE_TTL_MS });
    expect(marked[101]?.stale).toBe(true);

    const resolved = resolveRunnerGallop({
      raceGallopPercent: null,
      horseId: 101,
      cache: marked,
      nowMs,
      ttlMs: GALLOP_CACHE_TTL_MS,
    });

    expect(resolved.gallopPercent).toBeNull();
    expect(resolved.stale).toBe(true);
  });

  it("missing gallop data fails lock coverage validation", () => {
    const nowMs = Date.now();
    const cache = {
      1: {
        horseId: 1,
        gallopPercent: 11,
        fetchedAtMs: nowMs,
        source: "ATG_HORSE_RESULTS" as const,
        stale: false,
        lastError: null,
      },
    };

    const coverage = validateGallopCoverageAtLock({
      activeRunners: [
        { number: 1, horseId: 1, raceGallopPercent: null },
        { number: 2, horseId: 2, raceGallopPercent: null },
      ],
      cache,
      nowMs,
      ttlMs: GALLOP_CACHE_TTL_MS,
    });

    expect(coverage.complete).toBe(false);
    expect(coverage.missingRunnerNumbers).toEqual([2]);
  });

  it("horse refresh list updates after successful cache upsert", () => {
    const nowMs = Date.now();
    let cache: Record<number, { horseId: number; gallopPercent: number | null; fetchedAtMs: number; source: "ATG_HORSE_RESULTS" | "ATG_RACE_START"; stale: boolean; lastError: string | null }> = {};
    const inFlight = new Set<number>();

    const before = horseIdsNeedingGallopRefresh({
      horseIds: [10, 11],
      cache,
      nowMs,
      inFlight,
      ttlMs: GALLOP_CACHE_TTL_MS,
    });
    expect(before).toEqual([10, 11]);

    cache = upsertGallopCacheEntry({
      current: cache,
      horseId: 10,
      gallopPercent: 14,
      fetchedAtMs: nowMs,
      source: "ATG_HORSE_RESULTS",
    });

    const after = horseIdsNeedingGallopRefresh({
      horseIds: [10, 11],
      cache,
      nowMs,
      inFlight,
      ttlMs: GALLOP_CACHE_TTL_MS,
    });
    expect(after).toEqual([11]);
  });

  it("fetch helper returns null on source failure without throwing", async () => {
    const value = await fetchHorseGallopPercent({
      horseId: 123,
      apiBaseUrl: "https://example.invalid",
      fetchImpl: async () => {
        throw new Error("network fail");
      },
    });

    expect(value).toBeNull();
  });
});