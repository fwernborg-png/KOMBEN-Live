import { describe, expect, it } from "vitest";
import {
  buildResearchArchiveRaceInput,
  isResearchArchiveEnabled,
  mapResearchArchiveOddsRows,
  mergeResearchProducts,
  type WorkerResearchRace,
  type WorkerResearchTrack,
} from "./researchWorkerIntegration";

const START_MS = Date.parse(
  "2026-07-29T18:00:00.000Z",
);

const LOCK_MS = START_MS - 90_000;

function buildTrack(): WorkerResearchTrack {
  return {
    id: 6,
    name: "Åby",
    countryCode: "SE",
  };
}

function buildRace(): WorkerResearchRace {
  return {
    raceNumber: 5,
    id: "race-5",

    startTime: new Date(
      START_MS,
    ).toISOString(),

    status: "START_LIST",

    isMonte: false,

    eventId: "event-1",
    meetingId: "meeting-1",
    meetingName: "Lunchtrav Åby",

    raceName: "Testloppet",

    startMethod: "AUTO",
    distanceMeters: 1640,

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
        productId: "v85-1",
        legNumber: 3,
        totalLegs: 8,
        rawProductJson: {},
      },
    ],

    runners: [
      {
        number: 1,
        horseId: 1001,
        name: "Testhästen",

        oddsRaw: 650,
        placeOddsRaw: 210,

        scratched: false,

        stats: {
          earningsPerStart: 20_000,
          winPercent: 25,
          driverWinPercent: 18,
          startPoints: 1_500,
          gallopPercent: 5,
        },

        horseAge: 5,
        horseSex: "VALACK",

        startLane: 1,
        startDistanceMeters: 1640,

        driverId: 501,
        driverName: "Test Kusk",

        trainerId: 601,
        trainerName: "Test Tränare",

        rawRunnerJson: {
          number: 1,
        },
      },
    ],

    rawRaceJson: {
      name: "Testloppet",
    },

    rawMeetingJson: {
      meetingName: "Lunchtrav Åby",
    },
  };
}

describe("researchWorkerIntegration", () => {
  it("är avstängd som standard", () => {
    expect(
      isResearchArchiveEnabled(undefined),
    ).toBe(false);

    expect(
      isResearchArchiveEnabled("false"),
    ).toBe(false);

    expect(
      isResearchArchiveEnabled("true"),
    ).toBe(true);

    expect(
      isResearchArchiveEnabled("1"),
    ).toBe(true);
  });

  it("bygger komplett forskningsinput", () => {
    const input =
      buildResearchArchiveRaceInput({
        raceDate: "2026-07-29",
        track: buildTrack(),
        race: buildRace(),
      });

    expect(input.sourceRaceId).toBe("race-5");
    expect(input.trackName).toBe("Åby");
    expect(input.currencyCode).toBe("SEK");

    expect(input.startMethod).toBe("AUTO");
    expect(input.distanceMeters).toBe(1640);

    expect(input.runners).toHaveLength(1);

    expect(
      input.runners[0].currentWinOddsDecimal,
    ).toBe(6.5);

    expect(
      input.runners[0].currentPlaceOddsDecimal,
    ).toBe(2.1);

    expect(input.runners[0].startLane).toBe(1);
  });

  it("sparar Tyskland och Italien med EUR", () => {
    for (
      const [countryCode, name] of [
        ["DE", "Berlin"],
        ["IT", "Milano"],
      ] as const
    ) {
      const input =
        buildResearchArchiveRaceInput({
          raceDate: "2026-08-15",
          track: {
            ...buildTrack(),
            countryCode,
            name,
          },
          race: buildRace(),
        });

      expect(input.countryCode).toBe(
        countryCode,
      );
      expect(input.currencyCode).toBe(
        "EUR",
      );
    }
  });

  it("stoppar lopp som saknar starttid", () => {
    const race = buildRace();
    race.startTime = undefined;

    expect(() =>
      buildResearchArchiveRaceInput({
        raceDate: "2026-07-29",
        track: buildTrack(),
        race,
      }),
    ).toThrow("Planerad starttid saknas");
  });

  it("slår ihop produkter utan dubbletter", () => {
    const product = {
      productCode: "V85",
      productId: "v85-1",
      legNumber: 3,
      totalLegs: 8,
      rawProductJson: {},
    };

    const merged = mergeResearchProducts(
      [product],
      [product],
      [
        {
          productCode: "V4",
          productId: "v4-1",
          legNumber: 1,
          totalLegs: 4,
          rawProductJson: {},
        },
      ],
    );

    expect(merged).toHaveLength(2);

    expect(
      merged.map(
        (item) => item.productCode,
      ),
    ).toEqual(["V85", "V4"]);
  });

  it("låter kalenderprodukt ersätta ospecifik produkt utan dubbelrad", () => {
    const merged =
      mergeResearchProducts(
        [
          {
            productCode: "V64",
            productId: null,
            legNumber: null,
            totalLegs: null,
            rawProductJson: {
              detectedFromText: true,
            },
          },
        ],
        [
          {
            productCode: "V64",
            productId:
              "V64_2026-08-07_19_4",
            legNumber: 3,
            totalLegs: 6,
            rawProductJson: {
              source:
                "ATG_CALENDAR_GAMES",
            },
          },
        ],
      );

    expect(merged).toHaveLength(1);

    expect(merged[0]).toEqual(
      expect.objectContaining({
        productCode: "V64",
        productId:
          "V64_2026-08-07_19_4",
        legNumber: 3,
        totalLegs: 6,
      }),
    );
  });

  it("stoppar oddspunkter efter låsningen", () => {
    const mapped = mapResearchArchiveOddsRows({
      race: buildRace(),
      actualLockTimeMs: LOCK_MS,

      rows: [
        {
          race_id: "race-5",
          runner_number: 1,
          horse_id: 1001,
          horse_name: "Testhästen",
          market: "WIN",
          odds_decimal: "6.50",
          point_ts: new Date(
            LOCK_MS,
          ).toISOString(),
          source: "ATG",
        },
        {
          race_id: "race-5",
          runner_number: 1,
          horse_id: 1001,
          horse_name: "Testhästen",
          market: "PLACE",
          odds_decimal: 2.1,
          point_ts: new Date(
            LOCK_MS + 30_000,
          ).toISOString(),
          source: "ATG",
        },
      ],
    });

    expect(mapped).toHaveLength(1);
    expect(mapped[0].market).toBe("WIN");
    expect(mapped[0].oddsDecimal).toBe(6.5);
  });
});
