import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildResearchEventRows,
  buildResearchFinalMetricRows,
  buildResearchResultRows,
  type ResearchCompletionRace,
} from "./researchCompletion";

function race(
  overrides:
    Partial<ResearchCompletionRace> = {},
): ResearchCompletionRace {
  return {
    raceNumber: 4,
    id: "race-4",

    startTime:
      "2026-07-30T18:00:00.000Z",

    status: "results",

    finishOrder: [
      2,
      1,
      3,
    ],

    runners: [
      {
        number: 1,
        horseId: 101,
        name: "Ettan",

        oddsRaw: 400,
        placeOddsRaw: 160,
        scratched: false,

        horseAge: 5,
        horseSex: "MARE",

        startLane: 1,
        startDistanceMeters: 1640,

        driverId: 11,
        driverName: "Kusk Ett",

        trainerId: 21,
        trainerName: "Tränare Ett",

        rawRunnerJson: {
          result: {
            position: 2,
          },
        },
      },
      {
        number: 2,
        horseId: 102,
        name: "Tvåan",

        oddsRaw: 250,
        placeOddsRaw: 130,
        scratched: false,

        horseAge: 6,
        horseSex: "GELDING",

        startLane: 2,
        startDistanceMeters: 1640,

        driverId: 12,
        driverName: "Kusk Två",

        trainerId: 22,
        trainerName: "Tränare Två",

        rawRunnerJson: {
          result: {
            position: 1,
          },
        },
      },
      {
        number: 3,
        horseId: 103,
        name: "Trean",

        oddsRaw: 800,
        placeOddsRaw: 220,
        scratched: false,

        horseAge: 7,
        horseSex: "GELDING",

        startLane: 3,
        startDistanceMeters: 1640,

        driverId: 13,
        driverName: "Kusk Tre",

        trainerId: 23,
        trainerName: "Tränare Tre",

        rawRunnerJson: {
          result: {
            position: 3,
          },

          galloped: true,
        },
      },
      {
        number: 4,
        horseId: 104,
        name: "Fyran",

        oddsRaw: 1200,
        placeOddsRaw: null,
        scratched: false,

        horseAge: 4,
        horseSex: "MARE",

        startLane: 4,
        startDistanceMeters: 1640,

        driverId: 14,
        driverName: "Kusk Fyra",

        trainerId: 24,
        trainerName: "Tränare Fyra",

        rawRunnerJson: {
          didNotFinish: true,
        },
      },
      {
        number: 5,
        horseId: 105,
        name: "Femman",

        oddsRaw: null,
        placeOddsRaw: null,
        scratched: true,

        horseAge: 5,
        horseSex: "MARE",

        startLane: 5,
        startDistanceMeters: 1640,

        driverId: 15,
        driverName: "Kusk Fem",

        trainerId: 25,
        trainerName: "Tränare Fem",

        rawRunnerJson: {},
      },
      {
        number: 6,
        horseId: 106,
        name: "Sexan",

        oddsRaw: 1500,
        placeOddsRaw: null,
        scratched: false,

        horseAge: 8,
        horseSex: "GELDING",

        startLane: 6,
        startDistanceMeters: 1640,

        driverId: 16,
        driverName: "Kusk Sex",

        trainerId: 26,
        trainerName: "Tränare Sex",

        rawRunnerJson: {
          disqualified: true,
        },
      },
      {
        number: 7,
        horseId: 107,
        name: "Sjuan",

        oddsRaw: 1800,
        placeOddsRaw: null,
        scratched: false,

        horseAge: 6,
        horseSex: "GELDING",

        startLane: 7,
        startDistanceMeters: 1640,

        driverId: 17,
        driverName: "Kusk Sju",

        trainerId: 27,
        trainerName: "Tränare Sju",

        rawRunnerJson: {},
      },
      {
        number: 8,
        horseId: 108,
        name: "Åttan",

        oddsRaw: 2000,
        placeOddsRaw: null,
        scratched: false,

        horseAge: 6,
        horseSex: "GELDING",

        startLane: 8,
        startDistanceMeters: 1640,

        driverId: 18,
        driverName: "Kusk Åtta",

        trainerId: 28,
        trainerName: "Tränare Åtta",

        rawRunnerJson: {},
      },
    ],

    rawRaceJson: {
      status: "results",
    },

    ...overrides,
  };
}

describe(
  "researchCompletion",
  () => {
    it(
      "bygger resultat för samtliga hästar",
      () => {
        const rows =
          buildResearchResultRows({
            raceKey:
              "ATG:2026-07-30:1:4:race-4",

            race: race(),

            resultReceivedAt:
              "2026-07-30T18:05:00.000Z",
          });

        expect(rows).toHaveLength(8);

        const winner =
          rows.find(
            (row) =>
              row.runner_number === 2,
          );

        expect(
          winner?.winner_official,
        ).toBe(true);

        expect(
          winner?.finish_position_official,
        ).toBe(1);

        expect(
          winner?.placed_official,
        ).toBe(true);

        expect(
          winner?.paid_place_count,
        ).toBe(3);

        const galloper =
          rows.find(
            (row) =>
              row.runner_number === 3,
          );

        expect(
          galloper?.galloped,
        ).toBe(true);

        const scratched =
          rows.find(
            (row) =>
              row.runner_number === 5,
          );

        expect(
          scratched?.started,
        ).toBe(false);

        expect(
          scratched
            ?.scratched_after_lock,
        ).toBe(true);
      },
    );

    it(
      "bygger VOID-resultat för inställt lopp",
      () => {
        const rows =
          buildResearchResultRows({
            raceKey:
              "ATG:2026-07-30:1:4:race-4",

            race: race({
              status: "Inställd",
              finishOrder: [],
            }),

            resultReceivedAt:
              "2026-07-30T18:05:00.000Z",
          });

        expect(
          rows.every(
            (row) =>
              row.result_status ===
              "VOID",
          ),
        ).toBe(true);

        expect(
          rows.every(
            (row) =>
              row.finish_position_official ===
              null,
          ),
        ).toBe(true);
      },
    );

    it(
      "upptäcker ändringar efter LOCK",
      () => {
        const current =
          race({
            startTime:
              "2026-07-30T18:02:00.000Z",

            status: "started",

            runners:
              race().runners.map(
                (runner) =>
                  runner.number === 1
                    ? {
                        ...runner,

                        scratched: true,

                        startLane: 3,

                        driverId: 99,

                        driverName:
                          "Ny Kusk",

                        oddsRaw: 200,
                      }
                    : runner,
              ),
          });

        const events =
          buildResearchEventRows({
            raceKey:
              "ATG:2026-07-30:1:4:race-4",

            previousRace: {
              race_key:
                "ATG:2026-07-30:1:4:race-4",

              source_race_id:
                "race-4",

              race_date:
                "2026-07-30",

              track_id: 1,
              track_name: "Test",
              race_number: 4,

              planned_start_time:
                "2026-07-30T18:00:00.000Z",

              race_status:
                "upcoming",

              scheduled_starters: 8,
              expected_runner_count: 8,

              archived_result_count: 0,
              archived_odds_point_count: 0,

              archive_status:
                "COLLECTING",
            },

            previousRunners:
              race().runners.map(
                (runner) => ({
                  runner_snapshot_key:
                    `lock-${runner.number}`,

                  snapshot_key:
                    "lock",

                  race_key:
                    "ATG:2026-07-30:1:4:race-4",

                  runner_number:
                    runner.number,

                  horse_id:
                    runner.horseId,

                  horse_name:
                    runner.name,

                  start_lane:
                    runner.startLane,

                  driver_id:
                    runner.driverId,

                  driver_name:
                    runner.driverName,

                  scratched:
                    runner.scratched,

                  current_win_odds:
                    runner.number === 1
                      ? 4
                      : 10,

                  current_place_odds:
                    null,

                  start_win_odds:
                    10,
                }),
              ),

            currentRace:
              current,

            eventTimestamp:
              "2026-07-30T17:59:00.000Z",
          });

        const types =
          events.map(
            (event) =>
              event.event_type,
          );

        expect(types).toContain(
          "START_TIME_CHANGED",
        );

        expect(types).toContain(
          "RACE_STATUS_CHANGED",
        );

        expect(types).toContain(
          "START_FIELD_CHANGED",
        );

        expect(types).toContain(
          "SCRATCHED",
        );

        expect(types).toContain(
          "DRIVER_CHANGED",
        );

        expect(types).toContain(
          "START_LANE_CHANGED",
        );

        expect(types).toContain(
          "LARGE_ODDS_MOVE",
        );
      },
    );

    it(
      "uppdaterar slutodds och slutliga trendmått",
      () => {
        const rows =
          buildResearchFinalMetricRows({
            raceKey:
              "ATG:2026-07-30:1:4:race-4",

            race: race(),

            metricRows: [
              {
                metric_key:
                  "metric-1",

                race_key:
                  "ATG:2026-07-30:1:4:race-4",

                runner_number: 1,

                start_odds: 10,

                data_quality_status:
                  "COMPLETE",
              },
            ],

            oddsPointRows: [
              {
                odds_point_key:
                  "t10",

                race_key:
                  "ATG:2026-07-30:1:4:race-4",

                runner_number: 1,

                capture_type: "T10",

                win_odds_decimal: 8,
              },
              {
                odds_point_key:
                  "t5",

                race_key:
                  "ATG:2026-07-30:1:4:race-4",

                runner_number: 1,

                capture_type: "T5",

                win_odds_decimal: 6,
              },
              {
                odds_point_key:
                  "t2",

                race_key:
                  "ATG:2026-07-30:1:4:race-4",

                runner_number: 1,

                capture_type: "T2",

                win_odds_decimal: 5,
              },
            ],

            calculatedAt:
              "2026-07-30T18:05:00.000Z",
          });

        expect(rows).toHaveLength(1);

        expect(
          rows[0].final_odds,
        ).toBe(4);

        expect(
          rows[0]
            .odds_drop_to_final_percent,
        ).toBe(60);

        expect(
          rows[0]
            .odds_drop_last_10_minutes_percent,
        ).toBe(50);

        expect(
          rows[0]
            .odds_drop_last_5_minutes_percent,
        ).toBeCloseTo(
          33.333333,
        );

        expect(
          rows[0]
            .odds_drop_last_2_minutes_percent,
        ).toBe(20);
      },
    );
  },
);
