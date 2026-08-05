import {
  describe,
  expect,
  it,
} from "vitest";

import {
  computeResearchHistorySummary,
  groupResearchHistoryRows,
} from "./analytics";

import type {
  ResearchHistoryRow,
} from "./types";

function row(
  overrides:
    Partial<ResearchHistoryRow> = {},
): ResearchHistoryRow {
  return {
    raceKey:
      "race-1",

    raceDate:
      "2026-07-30",

    trackName:
      "Solvalla",

    raceNumber: 1,

    raceName:
      "Testloppet",

    plannedStartTime:
      "2026-07-30T18:00:00.000Z",

    startMethod:
      "AUTO",

    distanceMeters:
      1640,

    raceCategory: null,
    raceClassCode: null,

    earningsMin: null,
    earningsMax: 250000,

    starters: 10,

    selectionKind:
      "MOST_SHORTENED",

    runnerNumber: 4,

    horseName:
      "Testhästen",

    startLane: 4,

    startDistanceMeters: 1640,
    distanceHandicapMeters: 0,

    driverId: "12345",
    driverName: "Test Kusk",

    strengthTotal: 5,

    startOdds: 10,
    lockOdds: 5,
    finalOdds: 4.5,

    oddsDropToLockPercent: 50,
    oddsDropToFinalPercent: 55,

    cvPercent: 4,
    validOddsPoints: 60,

    isFavoriteAtLock: false,

    krValue: 6000,
    stValue: 15,
    driverValue: 12,
    spValue: 1200,
    gallopValue: 8,
    oddsIndicatorValue: 50,

    started: true,
    scratchedAfterLock: false,
    betVoid: false,

    finishPositionOfficial: 1,

    winnerOfficial: true,
    placedOfficial: true,

    galloped: false,
    disqualified: false,
    didNotFinish: false,

    officialWinOddsDecimal: 4.5,
    officialPlaceOddsDecimal: 1.8,

    resultStatus:
      "OFFICIAL",

    metricQualityStatus:
      "COMPLETE",

    indicatorDataComplete: true,
    oddsDataComplete: true,

    ...overrides,
  };
}

describe(
  "computeResearchHistorySummary",
  () => {
    it(
      "räknar simulerad vinnare, plats och kombinerad ROI",
      () => {
        const rows = [
          row(),

          row({
            raceKey:
              "race-2",

            raceNumber: 2,

            horseName:
              "Misshästen",

            finishPositionOfficial: 7,

            winnerOfficial: false,
            placedOfficial: false,

            officialWinOddsDecimal: 8,
            officialPlaceOddsDecimal: 2.2,
          }),
        ];

        const summary =
          computeResearchHistorySummary(
            rows,
          );

        expect(summary.races).toBe(2);
        expect(summary.bets).toBe(2);

        expect(summary.wins).toBe(1);
        expect(summary.places).toBe(1);

        expect(
          summary.winRatePercent,
        ).toBe(50);

        expect(
          summary.placeRatePercent,
        ).toBe(50);

        expect(
          summary.winnerMarket.stake,
        ).toBe(200);

        expect(
          summary.winnerMarket.returnAmount,
        ).toBe(450);

        expect(
          summary.winnerMarket.roiPercent,
        ).toBe(125);

        expect(
          summary.placeMarket.returnAmount,
        ).toBe(180);

        expect(
          summary.placeMarket.roiPercent,
        ).toBe(-10);

        expect(
          summary.combinedMarket.stake,
        ).toBe(400);

        expect(
          summary.combinedMarket.returnAmount,
        ).toBe(630);

        expect(
          summary.combinedMarket.roiPercent,
        ).toBeCloseTo(
          57.5,
          8,
        );
      },
    );

    it(
      "räknar flera hästar i samma lopp som ett lopp",
      () => {
        const summary =
          computeResearchHistorySummary([
            row({
              selectionKind:
                "ALL_RUNNERS",

              runnerNumber: 1,
              horseName:
                "Häst ett",
            }),

            row({
              selectionKind:
                "ALL_RUNNERS",

              runnerNumber: 2,
              horseName:
                "Häst två",

              finishPositionOfficial: 5,

              winnerOfficial: false,
              placedOfficial: false,
            }),
          ]);

        expect(
          summary.races,
        ).toBe(1);

        expect(
          summary.bets,
        ).toBe(2);
      },
    );

    it(
      "räknar inte ett VOID-lopp som insats",
      () => {
        const summary =
          computeResearchHistorySummary([
            row({
              betVoid: true,
              started: false,
              scratchedAfterLock: true,
              winnerOfficial: false,
              placedOfficial: false,
              officialWinOddsDecimal: null,
              officialPlaceOddsDecimal: null,
            }),
          ]);

        expect(summary.races).toBe(1);
        expect(summary.bets).toBe(0);
        expect(summary.voids).toBe(1);

        expect(
          summary.winnerMarket.stake,
        ).toBe(0);
      },
    );

    it(
      "markerar ROI som okänd när ett träffodds saknas",
      () => {
        const summary =
          computeResearchHistorySummary([
            row({
              officialPlaceOddsDecimal:
                null,
            }),
          ]);

        expect(
          summary.placeMarket.payoutMissing,
        ).toBe(1);

        expect(
          summary.placeMarket.roiPercent,
        ).toBeNull();

        expect(
          summary.combinedMarket.roiPercent,
        ).toBeNull();
      },
    );
  },
);

describe(
  "groupResearchHistoryRows",
  () => {
    it(
      "grupperar på distans",
      () => {
        const groups =
          groupResearchHistoryRows(
            [
              row(),

              row({
                raceKey:
                  "race-2",

                distanceMeters:
                  2140,
              }),

              row({
                raceKey:
                  "race-3",

                distanceMeters:
                  1640,
              }),
            ],
            "DISTANCE",
          );

        expect(groups).toHaveLength(2);

        expect(
          groups[0].label,
        ).toBe("1640 meter");

        expect(
          groups[0].races,
        ).toBe(2);
      },
    );
  },
);
