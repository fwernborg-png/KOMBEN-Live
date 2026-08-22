import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateGallopS1ShadowV1,
  GALLOP_S1_SHADOW_PROSPECTIVE_LOCK_START_ISO,
  selectGallopS1ShadowCandidate,
  type GallopS1ShadowMetric,
} from "./gallopS1ShadowV1";

function metric(
  overrides:
    Partial<GallopS1ShadowMetric> =
      {},
): GallopS1ShadowMetric {
  return {
    runnerNumber: 1,
    horseId: 1001,
    horseName: "Testhästen",
    scratched: false,
    startOdds: 10,
    lockOdds: 7,
    dropPercent: 30,
    validOddsPoints: 10,
    cvPercent: 5,
    ...overrides,
  };
}

function evaluate(
  overrides: {
    countryCode?: string;
    sport?: string | null;
    lockTimestampIso?: string;
    metrics?:
      GallopS1ShadowMetric[];
  } = {},
) {
  return evaluateGallopS1ShadowV1({
    countryCode:
      overrides.countryCode ??
      "SE",

    sport:
      overrides.sport ??
      "GALLOP",

    lockTimestampIso:
      overrides
        .lockTimestampIso ??
      GALLOP_S1_SHADOW_PROSPECTIVE_LOCK_START_ISO,

    metrics:
      overrides.metrics ??
      [metric()],
  });
}

describe(
  "GALLOP S1 10% odds 5–12.5 V1",
  () => {
    it(
      "väljer största sänkningen som S1",
      () => {
        const candidate =
          selectGallopS1ShadowCandidate(
            [
              metric({
                runnerNumber: 1,
                dropPercent: 20,
              }),
              metric({
                runnerNumber: 2,
                dropPercent: 35,
                lockOdds: 8,
              }),
            ],
          );

        expect(
          candidate?.runnerNumber,
        ).toBe(2);
      },
    );

    it(
      "använder lockodds och startnummer som deterministisk tie-break",
      () => {
        const candidate =
          selectGallopS1ShadowCandidate(
            [
              metric({
                runnerNumber: 4,
                dropPercent: 30,
                lockOdds: 8,
              }),
              metric({
                runnerNumber: 2,
                dropPercent: 30,
                lockOdds: 7,
              }),
            ],
          );

        expect(
          candidate?.runnerNumber,
        ).toBe(2);
      },
    );

    it(
      "väljer aldrig en struken häst som S1",
      () => {
        const candidate =
          selectGallopS1ShadowCandidate(
            [
              metric({
                runnerNumber: 1,
                dropPercent: 60,
                lockOdds: 7,
                scratched: true,
              }),
              metric({
                runnerNumber: 2,
                dropPercent: 25,
                lockOdds: 8,
                scratched: false,
              }),
            ],
          );

        expect(
          candidate?.runnerNumber,
        ).toBe(2);
      },
    );

    it(
      "godkänner exakt 10 procents sänkning",
      () => {
        const result =
          evaluate({
            metrics: [
              metric({
                dropPercent: 10,
                lockOdds: 7,
              }),
            ],
          });

        expect(
          result.decision,
        ).toBe("PLAY");
      },
    );

    it(
      "godkänner båda oddsgränserna 5.00 och 12.50",
      () => {
        expect(
          evaluate({
            metrics: [
              metric({
                lockOdds: 5,
              }),
            ],
          }).decision,
        ).toBe("PLAY");

        expect(
          evaluate({
            metrics: [
              metric({
                lockOdds: 12.5,
              }),
            ],
          }).decision,
        ).toBe("PLAY");
      },
    );

    it(
      "stoppar odds utanför intervallet",
      () => {
        expect(
          evaluate({
            metrics: [
              metric({
                lockOdds: 4.99,
              }),
            ],
          }).decision,
        ).toBe("NO_PLAY");

        expect(
          evaluate({
            metrics: [
              metric({
                lockOdds: 12.51,
              }),
            ],
          }).decision,
        ).toBe("NO_PLAY");
      },
    );

    it(
      "stoppar sänkning under 10 procent",
      () => {
        expect(
          evaluate({
            metrics: [
              metric({
                dropPercent: 9.99,
              }),
            ],
          }).decision,
        ).toBe("NO_PLAY");
      },
    );

    it(
      "tillåter SE, DK, NO och ZA men inget annat land",
      () => {
        for (
          const countryCode of
          [
            "SE",
            "DK",
            "NO",
            "ZA",
          ]
        ) {
          expect(
            evaluate({
              countryCode,
            }).decision,
          ).toBe("PLAY");
        }

        expect(
          evaluate({
            countryCode: "GB",
          }).decision,
        ).toBe("EXCLUDED");
      },
    );

    it(
      "släpper aldrig in data före prospektiv start",
      () => {
        expect(
          evaluate({
            lockTimestampIso:
              "2026-08-22T09:59:59.999Z",
          }).decision,
        ).toBe("EXCLUDED");
      },
    );

    it(
      "släpper aldrig in trav",
      () => {
        expect(
          evaluate({
            sport: "TROT",
          }).decision,
        ).toBe("EXCLUDED");
      },
    );
  },
);
