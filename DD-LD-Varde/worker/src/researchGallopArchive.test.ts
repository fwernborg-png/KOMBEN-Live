import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildResearchLockArchiveRows,
} from "./researchArchive";

import {
  buildResearchArchiveRaceInput,
} from "./researchWorkerIntegration";

describe(
  "international gallop research archive",
  () => {
    it(
      "carries ZA gallop metadata into permanent archive rows",
      () => {
        const race =
          buildResearchArchiveRaceInput({
            raceDate:
              "2026-08-13",

            track: {
              id: 89,
              name: "Vaal",
              countryCode: "ZA",
            },

            race: {
              raceNumber: 2,
              id:
                "vinnare_2026-08-13_89_2",

              startTime:
                "2026-08-13T12:30:00.000Z",

              status: "STARTED",

              isMonte: false,

              sport: "GALLOP",
              surface: "turf",
              going: null,
              isHandicapRace: true,

              eventId: null,
              meetingId: null,
              meetingName: "Vaal",

              raceName:
                "Test Handicap",

              startMethod:
                "UNKNOWN",

              distanceMeters:
                1000,

              raceClassCode: null,
              raceCategory: null,

              earningsMin: null,
              earningsMax: null,

              ageMin: null,
              ageMax: null,

              firstAdditionalDistanceMeters:
                null,

              prizeMoneyTotal: null,
              firstPrize: null,

              products: [],

              runners: [
                {
                  number: 1,

                  horseId: 12345,
                  name: "Test Horse",

                  oddsRaw: 600,
                  placeOddsRaw: 200,

                  scratched: false,

                  stats: {
                    earningsPerStart:
                      null,
                    winPercent:
                      null,
                    driverWinPercent:
                      null,
                    startPoints:
                      null,
                    gallopPercent:
                      null,
                  },

                  horseAge: 4,
                  horseSex: null,

                  startLane: 1,
                  startDistanceMeters:
                    1000,

                  handicapRating:
                    72,

                  carriedWeightKg:
                    59.5,

                  riderId:
                    777,

                  riderName:
                    "Test Rider",

                  driverId:
                    777,

                  driverName:
                    "Test Rider",

                  trainerId: null,
                  trainerName: null,

                  rawRunnerJson: {
                    weight: 59500,

                    horse: {
                      handicap: 72,
                    },
                  },
                },
              ],

              rawRaceJson: {
                sport: "gallop",

                track: {
                  surface: "turf",
                },
              },

              rawMeetingJson: {},
            },
          });

        expect(
          race.countryCode,
        ).toBe("ZA");

        expect(
          race.currencyCode,
        ).toBe("ZAR");

        expect(
          race.sport,
        ).toBe("GALLOP");

        expect(
          race.runners[0]
            ?.handicapRating,
        ).toBe(72);

        const actualLockTimeMs =
          Date.parse(
            "2026-08-13T12:28:30.000Z",
          );

        const times = [
          "2026-08-13T11:30:00.000Z",
          "2026-08-13T12:00:00.000Z",
          "2026-08-13T12:15:00.000Z",
          "2026-08-13T12:25:00.000Z",
          "2026-08-13T12:28:00.000Z",
        ];

        const odds =
          times.map(
            (timestamp, index) => ({
              runnerNumber: 1,
              horseId: 12345,
              horseName:
                "Test Horse",

              market:
                "WIN" as const,

              oddsDecimal:
                8 - index * 0.5,

              pointTimestampMs:
                Date.parse(timestamp),

              scratched: false,
              source: "ATG",
            }),
          );

        const rows =
          buildResearchLockArchiveRows({
            race,
            odds,
            actualLockTimeMs,
          });

        expect(
          rows.snapshotComplete,
        ).toBe(true);

        expect(
          rows.raceRow
            .country_code,
        ).toBe("ZA");

        expect(
          rows.raceRow
            .currency_code,
        ).toBe("ZAR");

        expect(
          rows.raceRow
            .sport_type,
        ).toBe("GALLOP");

        expect(
          rows.raceRow
            .surface,
        ).toBe("turf");

        expect(
          rows.raceRow
            .is_handicap_race,
        ).toBe(true);

        const runner =
          rows.runnerSnapshotRows[0];

        expect(
          runner?.handicap_rating,
        ).toBe(72);

        expect(
          runner?.carried_weight_kg,
        ).toBe(59.5);

        expect(
          runner?.rider_id,
        ).toBe(777);

        expect(
          runner?.rider_name,
        ).toBe("Test Rider");
      },
    );
  },
);
