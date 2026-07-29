import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  buildResearchLockArchiveRows,
  persistResearchLockArchive,
  type ResearchArchiveOddsRow,
  type ResearchArchiveRaceInput,
} from "./researchArchive";

const START_MS = Date.parse(
  "2026-07-29T18:00:00.000Z",
);

const LOCK_MS = START_MS - 90_000;

function buildRace(): ResearchArchiveRaceInput {
  return {
    sourceRaceId: "race-7",
    raceDate: "2026-07-29",

    eventId: "event-1",
    meetingId: "meeting-1",
    meetingName: "Lunchtrav Test",

    countryCode: "SE",
    currencyCode: "SEK",

    trackId: 6,
    trackName: "Åby",
    raceNumber: 7,

    raceName: "Forskningsloppet",

    plannedStartTime:
      new Date(START_MS).toISOString(),

    actualStartTime: null,

    raceStatus: "START_LIST",

    startMethod: "AUTO",
    distanceMeters: 1640,
    isMonte: false,

    scheduledStarters: 3,

    raceClassCode: "K150",
    raceCategory: "VARMBLOD",

    earningsMin: 20_001,
    earningsMax: 150_000,

    ageMin: 3,
    ageMax: 12,

    firstAdditionalDistanceMeters: null,

    prizeMoneyTotal: 100_000,
    firstPrize: 50_000,

    products: [
      {
        productCode: "V85",
        productId: "v85-test",
        legNumber: 3,
        totalLegs: 8,
        rawProductJson: {
          source: "TEST",
        },
      },
    ],

    runners: [
      {
        number: 1,
        horseId: 1001,
        name: "Stabil Ett",
        horseAge: 5,
        horseSex: "VALACK",
        startLane: 1,
        startDistanceMeters: 1640,
        driverId: 501,
        driverName: "Kusk Ett",
        trainerId: 601,
        trainerName: "Tränare Ett",
        scratched: false,
        currentWinOddsDecimal: 6,
        currentPlaceOddsDecimal: 2,
        stats: {
          earningsPerStart: 20_000,
          winPercent: 25,
          driverWinPercent: 20,
          startPoints: 1_500,
          gallopPercent: 5,
        },
        rawRunnerJson: {
          number: 1,
        },
      },
      {
        number: 2,
        horseId: 1002,
        name: "Jämn Två",
        horseAge: 4,
        horseSex: "STO",
        startLane: 2,
        startDistanceMeters: 1640,
        driverId: 502,
        driverName: "Kusk Två",
        trainerId: 602,
        trainerName: "Tränare Två",
        scratched: false,
        currentWinOddsDecimal: 5,
        currentPlaceOddsDecimal: 1.8,
        stats: {
          earningsPerStart: 15_000,
          winPercent: 20,
          driverWinPercent: 18,
          startPoints: 1_200,
          gallopPercent: 4,
        },
        rawRunnerJson: {
          number: 2,
        },
      },
      {
        number: 3,
        horseId: 1003,
        name: "Reserv Tre",
        horseAge: 6,
        horseSex: "VALACK",
        startLane: 3,
        startDistanceMeters: 1640,
        driverId: 503,
        driverName: "Kusk Tre",
        trainerId: 603,
        trainerName: "Tränare Tre",
        scratched: false,
        currentWinOddsDecimal: 8,
        currentPlaceOddsDecimal: 2.5,
        stats: {
          earningsPerStart: 12_000,
          winPercent: 15,
          driverWinPercent: 14,
          startPoints: 900,
          gallopPercent: 8,
        },
        rawRunnerJson: {
          number: 3,
        },
      },
    ],

    rawRaceJson: {
      name: "Forskningsloppet",
      products: ["V85-3", "V4-1"],
      meetingName: "Lunchtrav Test",
    },
  };
}

function buildOdds(): ResearchArchiveOddsRow[] {
  const series: Record<
    number,
    Array<[number, number, number]>
  > = {
    1: [
      [3600, 10, 3],
      [1800, 9.5, 2.8],
      [900, 9, 2.7],
      [600, 8, 2.5],
      [300, 7, 2.2],
      [120, 6.5, 2.1],
      [90, 6, 2],
    ],

    2: [
      [3600, 5.2, 1.9],
      [1800, 5.15, 1.9],
      [900, 5.1, 1.85],
      [600, 5.1, 1.85],
      [300, 5.05, 1.8],
      [120, 5, 1.8],
      [90, 5, 1.8],
    ],

    3: [
      [3600, 9, 2.8],
      [1800, 9.5, 2.9],
      [900, 9, 2.8],
      [600, 8.5, 2.7],
      [300, 8.2, 2.6],
      [120, 8.1, 2.5],
      [90, 8, 2.5],
    ],
  };

  const rows: ResearchArchiveOddsRow[] = [];

  for (const [runnerNumberRaw, points] of Object.entries(
    series,
  )) {
    const runnerNumber = Number(runnerNumberRaw);
    const race = buildRace();
    const runner = race.runners.find(
      (item) => item.number === runnerNumber,
    );

    if (!runner) {
      continue;
    }

    for (const [
      secondsBeforeStart,
      winOdds,
      placeOdds,
    ] of points) {
      const pointTimestampMs =
        START_MS - secondsBeforeStart * 1_000;

      rows.push({
        runnerNumber,
        horseId: runner.horseId,
        horseName: runner.name,
        market: "WIN",
        oddsDecimal: winOdds,
        pointTimestampMs,
        scratched: false,
        source: "ATG",
      });

      rows.push({
        runnerNumber,
        horseId: runner.horseId,
        horseName: runner.name,
        market: "PLACE",
        oddsDecimal: placeOdds,
        pointTimestampMs,
        scratched: false,
        source: "ATG",
      });
    }
  }

  return rows;
}

describe("researchArchive", () => {
  it("bygger kompletta deterministiska låsrader", () => {
    const first = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    const second = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    expect(first).toEqual(second);

    expect(first.raceKey).toContain(
      "2026-07-29",
    );

    expect(first.runnerSnapshotRows).toHaveLength(3);
    expect(first.indicatorRows).toHaveLength(18);
    expect(first.metricRows).toHaveLength(3);

    expect(first.productRows.length).toBeGreaterThanOrEqual(
      2,
    );

    expect(first.snapshotComplete).toBe(true);
  });

  it("markerar snapshot som PARTIAL när en aktiv häst saknar LOCK-punkt", () => {
    const oddsWithoutFreshLock = buildOdds().filter(
      (row) =>
        row.pointTimestampMs <=
        START_MS - 180_000,
    );

    const rows = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: oddsWithoutFreshLock,
      actualLockTimeMs: LOCK_MS,
    });

    expect(
      rows.oddsPointRows.some(
        (row) =>
          row.capture_type === "LOCK",
      ),
    ).toBe(false);

    expect(rows.snapshotComplete).toBe(false);

    expect(
      rows.snapshotRow.data_quality_status,
    ).toBe("PARTIAL");

    expect(
      rows.snapshotRow.missing_fields,
    ).toContain("lockOddsPoint");

    for (const runner of rows.runnerSnapshotRows) {
      expect(
        runner.odds_data_complete,
      ).toBe(false);

      expect(
        runner.missing_fields,
      ).toContain("lockOddsPoint");
    }
  });

  it("sparar mest sänkt, jämnast och favorit separat", () => {
    const rows = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    const runner1 =
      rows.runnerSnapshotRows.find(
        (row) => row.runner_number === 1,
      );

    const runner2 =
      rows.runnerSnapshotRows.find(
        (row) => row.runner_number === 2,
      );

    expect(
      runner1?.is_most_shortened,
    ).toBe(true);

    expect(runner1?.odds_drop_rank).toBe(1);

    expect(runner2?.is_smoothest).toBe(true);
    expect(runner2?.is_favorite).toBe(true);
  });

  it("skapar ingen T1- eller FINAL-punkt redan vid T90-låsningen", () => {
    const rows = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    const captureTypes = rows.oddsPointRows.map(
      (row) => row.capture_type,
    );

    expect(captureTypes).toContain("START");
    expect(captureTypes).toContain("LOCK");

    expect(captureTypes).not.toContain("T1");
    expect(captureTypes).not.toContain("FINAL");
    expect(captureTypes).not.toContain("RESULT");
  });

  it("lämnar finalfält tomma fram till resultatarkiveringen", () => {
    const rows = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    for (const metric of rows.metricRows) {
      expect(metric.final_odds).toBeNull();
      expect(
        metric.odds_drop_to_final_percent,
      ).toBeNull();

      expect(
        metric.normalized_market_share_final,
      ).toBeNull();
    }
  });

  it("skriver alla tabeller i säker beroendeordning", async () => {
    const rows = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    const writes: Array<{
      table: string;
      rows: unknown;
    }> = [];

    const fakeSupabase = {
      from(table: string) {
        return {
          async upsert(value: unknown) {
            writes.push({
              table,
              rows: value,
            });

            return {
              error: null,
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const result =
      await persistResearchLockArchive({
        supabase: fakeSupabase,
        rows,
      });

    expect(
      writes.map((write) => write.table),
    ).toEqual([
      "research_races",
      "research_race_products",
      "research_race_snapshots",
      "research_runner_snapshots",
      "research_runner_indicators",
      "research_odds_points",
      "research_runner_metrics",
    ]);

    expect(result.runners).toBe(3);
    expect(result.indicators).toBe(18);
    expect(result.metrics).toBe(3);
  });

  it("avbryter tydligt om en databasskrivning misslyckas", async () => {
    const rows = buildResearchLockArchiveRows({
      race: buildRace(),
      odds: buildOdds(),
      actualLockTimeMs: LOCK_MS,
    });

    const fakeSupabase = {
      from(table: string) {
        return {
          async upsert() {
            return {
              error:
                table ===
                "research_runner_snapshots"
                  ? {
                      message:
                        "simulerat databasfel",
                    }
                  : null,
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(
      persistResearchLockArchive({
        supabase: fakeSupabase,
        rows,
      }),
    ).rejects.toThrow(
      "research_runner_snapshots",
    );
  });
});
