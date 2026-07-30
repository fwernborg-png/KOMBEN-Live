import { describe, expect, it } from "vitest";
import {
  archiveResearchRacesAtLock,
  type ResearchArchivePersistenceAdapter,
  type ResearchArchiveRaceItem,
} from "./researchWorkerArchiveRun";
import {
  buildResearchRaceKey,
} from "./researchArchive";

const START_MS = Date.parse(
  "2026-07-29T18:00:00.000Z",
);

const LOCK_MS =
  START_MS - 90_000;

function buildRaceItem(
  raceNumber = 5,
): ResearchArchiveRaceItem {
  return {
    track: {
      id: 6,
      name: "Åby",
      countryCode: "SE",
    },

    race: {
      raceNumber,
      id: `race-${raceNumber}`,

      startTime: new Date(
        START_MS,
      ).toISOString(),

      status: "START_LIST",

      isMonte: false,

      eventId: "event-1",
      meetingId: "meeting-1",
      meetingName: "Lunchtrav Åby",

      raceName: "Forskningsloppet",

      startMethod: "AUTO",
      distanceMeters: 1640,

      raceClassCode: "K150",
      raceCategory: "VARMBLOD",

      earningsMin: 20_001,
      earningsMax: 150_000,

      ageMin: 3,
      ageMax: 12,

      firstAdditionalDistanceMeters:
        null,

      prizeMoneyTotal: 100_000,
      firstPrize: 50_000,

      products: [
        {
          productCode: "V85",
          productId: "v85-test",
          legNumber: 3,
          totalLegs: 8,
          rawProductJson: {},
        },
      ],

      runners: [
        {
          number: 1,
          horseId: 1001,
          name: "Sänkaren",

          oddsRaw: 600,
          placeOddsRaw: 200,

          scratched: false,

          stats: {
            earningsPerStart: 20_000,
            winPercent: 25,
            driverWinPercent: 20,
            startPoints: 1_500,
            gallopPercent: 5,
          },

          horseAge: 5,
          horseSex: "VALACK",

          startLane: 1,
          startDistanceMeters: 1640,

          driverId: 501,
          driverName: "Kusk Ett",

          trainerId: 601,
          trainerName: "Tränare Ett",

          rawRunnerJson: {
            number: 1,
          },
        },

        {
          number: 2,
          horseId: 1002,
          name: "Jämnaste",

          oddsRaw: 500,
          placeOddsRaw: 180,

          scratched: false,

          stats: {
            earningsPerStart: 18_000,
            winPercent: 20,
            driverWinPercent: 18,
            startPoints: 1_200,
            gallopPercent: 4,
          },

          horseAge: 4,
          horseSex: "STO",

          startLane: 2,
          startDistanceMeters: 1640,

          driverId: 502,
          driverName: "Kusk Två",

          trainerId: 602,
          trainerName: "Tränare Två",

          rawRunnerJson: {
            number: 2,
          },
        },
      ],

      rawRaceJson: {
        name: "Forskningsloppet",
      },

      rawMeetingJson: {
        meetingName:
          "Lunchtrav Åby",
      },
    },
  };
}

function buildOddsRows(
  item: ResearchArchiveRaceItem,
) {
  const paths: Record<
    number,
    Array<[number, number, number]>
  > = {
    1: [
      [3600, 10, 3],
      [1800, 9, 2.8],
      [900, 8, 2.6],
      [600, 7.5, 2.4],
      [300, 7, 2.2],
      [120, 6.5, 2.1],
      [90, 6, 2],
    ],

    2: [
      [3600, 5.2, 1.9],
      [1800, 5.2, 1.9],
      [900, 5.1, 1.9],
      [600, 5.1, 1.85],
      [300, 5.05, 1.8],
      [120, 5, 1.8],
      [90, 5, 1.8],
    ],
  };

  return Object.entries(paths).flatMap(
    ([runnerRaw, points]) => {
      const runnerNumber =
        Number(runnerRaw);

      const runner =
        item.race.runners.find(
          (candidate) =>
            candidate.number ===
            runnerNumber,
        );

      if (!runner) {
        return [];
      }

      return points.flatMap(
        ([
          secondsBeforeStart,
          winOdds,
          placeOdds,
        ]) => {
          const pointTimestamp =
            new Date(
              START_MS -
                secondsBeforeStart *
                  1_000,
            ).toISOString();

          return [
            {
              race_id: item.race.id,
              runner_number:
                runnerNumber,
              horse_id:
                runner.horseId,
              horse_name:
                runner.name,
              market: "WIN" as const,
              odds_decimal:
                winOdds,
              point_ts:
                pointTimestamp,
              source: "ATG",
            },
            {
              race_id: item.race.id,
              runner_number:
                runnerNumber,
              horse_id:
                runner.horseId,
              horse_name:
                runner.name,
              market:
                "PLACE" as const,
              odds_decimal:
                placeOdds,
              point_ts:
                pointTimestamp,
              source: "ATG",
            },
          ];
        },
      );
    },
  );
}

describe("researchWorkerArchiveRun", () => {
  it("gör inga databasanrop när brytaren är av", async () => {
    const adapter: ResearchArchivePersistenceAdapter =
      {
        async loadExistingLockStates() {
          throw new Error(
            "Ska inte anropas",
          );
        },

        async loadOddsRows() {
          throw new Error(
            "Ska inte anropas",
          );
        },

        async persistRows() {
          throw new Error(
            "Ska inte anropas",
          );
        },
      };

    const summary =
      await archiveResearchRacesAtLock({
        enabled: false,
        raceDate: "2026-07-29",
        nowMs: LOCK_MS,
        races: [buildRaceItem()],
        adapter,
      });

    expect(summary.enabled).toBe(false);
    expect(summary.eligibleRaces).toBe(0);
    expect(summary.archivedRaces).toBe(0);
    expect(summary.failedRaces).toBe(0);
  });

  it("arkiverar ett komplett lopp deterministiskt", async () => {
    const item = buildRaceItem();

    let persistedSnapshotComplete:
      | boolean
      | null = null;

    const adapter: ResearchArchivePersistenceAdapter =
      {
        async loadExistingLockStates() {
          return new Map();
        },

        async loadOddsRows() {
          return buildOddsRows(item);
        },

        async persistRows(rows) {
          persistedSnapshotComplete =
            rows.snapshotComplete;

          return {
            raceKey: rows.raceKey,
            snapshotKey:
              rows.snapshotKey,

            runners:
              rows.runnerSnapshotRows
                .length,

            indicators:
              rows.indicatorRows.length,

            permanentOddsPoints:
              rows.oddsPointRows.length,

            metrics:
              rows.metricRows.length,

            products:
              rows.productRows.length,

            snapshotComplete:
              rows.snapshotComplete,
          };
        },
      };

    const summary =
      await archiveResearchRacesAtLock({
        enabled: true,
        raceDate: "2026-07-29",
        nowMs: LOCK_MS,
        races: [item],
        adapter,
      });

    expect(summary.enabled).toBe(true);
    expect(summary.eligibleRaces).toBe(1);
    expect(summary.archivedRaces).toBe(1);
    expect(summary.completeSnapshots).toBe(1);
    expect(summary.partialSnapshots).toBe(0);
    expect(summary.failedRaces).toBe(0);

    expect(
      persistedSnapshotComplete,
    ).toBe(true);
  });

  it("skriver inte om ett redan arkiverat låssnapshot", async () => {
    const item = buildRaceItem();

    const raceKey =
      buildResearchRaceKey({
        raceDate: "2026-07-29",
        trackId: item.track.id,
        raceNumber:
          item.race.raceNumber,
        sourceRaceId:
          item.race.id,
      });

    let oddsRead = false;
    let persisted = false;

    const adapter: ResearchArchivePersistenceAdapter =
      {
        async loadExistingLockStates() {
          return new Map([[raceKey, true]]);
        },

        async loadOddsRows() {
          oddsRead = true;
          return [];
        },

        async persistRows() {
          persisted = true;

          throw new Error(
            "Ska inte anropas",
          );
        },
      };

    const summary =
      await archiveResearchRacesAtLock({
        enabled: true,
        raceDate: "2026-07-29",
        nowMs: LOCK_MS,
        races: [item],
        adapter,
      });

    expect(summary.eligibleRaces).toBe(1);
    expect(summary.skippedExisting).toBe(1);
    expect(summary.archivedRaces).toBe(0);

    expect(oddsRead).toBe(false);
    expect(persisted).toBe(false);
  });

  it(
    "försöker skriva om ett partiellt LOCK-snapshot",
    async () => {
      const item = buildRaceItem();

      const raceKey =
        buildResearchRaceKey({
          raceDate: "2026-07-29",
          trackId: item.track.id,
          raceNumber:
            item.race.raceNumber,
          sourceRaceId:
            item.race.id,
        });

      let oddsRead = false;
      let persisted = false;

      const adapter:
        ResearchArchivePersistenceAdapter =
          {
            async loadExistingLockStates() {
              return new Map([
                [
                  raceKey,
                  false,
                ],
              ]);
            },

            async loadOddsRows() {
              oddsRead = true;

              return buildOddsRows(
                item,
              );
            },

            async persistRows(rows) {
              persisted = true;

              return {
                raceKey:
                  rows.raceKey,

                snapshotKey:
                  rows.snapshotKey,

                runners:
                  rows.runnerSnapshotRows
                    .length,

                indicators:
                  rows.indicatorRows
                    .length,

                permanentOddsPoints:
                  rows.oddsPointRows
                    .length,

                metrics:
                  rows.metricRows
                    .length,

                products:
                  rows.productRows
                    .length,

                snapshotComplete:
                  rows.snapshotComplete,
              };
            },
          };

      const summary =
        await archiveResearchRacesAtLock({
          enabled: true,
          raceDate: "2026-07-29",
          nowMs: LOCK_MS,
          races: [item],
          adapter,
        });

      expect(
        summary.retriedPartial,
      ).toBe(1);

      expect(
        summary.skippedExisting,
      ).toBe(0);

      expect(
        summary.archivedRaces,
      ).toBe(1);

      expect(oddsRead).toBe(true);
      expect(persisted).toBe(true);
    },
  );

  it("isolerar ett arkivfel utan att kasta vidare", async () => {
    const adapter: ResearchArchivePersistenceAdapter =
      {
        async loadExistingLockStates() {
          return new Map();
        },

        async loadOddsRows() {
          throw new Error(
            "Simulerat oddsfel",
          );
        },

        async persistRows() {
          throw new Error(
            "Ska inte nås",
          );
        },
      };

    const summary =
      await archiveResearchRacesAtLock({
        enabled: true,
        raceDate: "2026-07-29",
        nowMs: LOCK_MS,
        races: [buildRaceItem()],
        adapter,
      });

    expect(summary.eligibleRaces).toBe(1);
    expect(summary.archivedRaces).toBe(0);
    expect(summary.failedRaces).toBe(1);

    expect(summary.errors[0]).toContain(
      "Simulerat oddsfel",
    );
  });

  it("ignorerar lopp utanför låsfönstret", async () => {
    let databaseRead = false;

    const adapter: ResearchArchivePersistenceAdapter =
      {
        async loadExistingLockStates() {
          databaseRead = true;
          return new Map();
        },

        async loadOddsRows() {
          return [];
        },

        async persistRows() {
          throw new Error(
            "Ska inte nås",
          );
        },
      };

    const summary =
      await archiveResearchRacesAtLock({
        enabled: true,
        raceDate: "2026-07-29",

        nowMs:
          START_MS -
          10 * 60_000,

        races: [buildRaceItem()],
        adapter,
      });

    expect(databaseRead).toBe(true);
    expect(summary.eligibleRaces).toBe(0);
    expect(summary.archivedRaces).toBe(0);
  });
});
