import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseResearchRaceMeta,
  parseResearchRunnerMeta,
} from "./researchRaceParser";

describe(
  "international gallop research parsing",
  () => {
    it(
      "parses gallop sport, surface and 900m distance",
      () => {
        const parsed =
          parseResearchRaceMeta({
            name:
              "Test Handicap",
            sport:
              "gallop",
            distance:
              900,
            track: {
              surface:
                "turf",
            },
          });

        expect(parsed.sport)
          .toBe("GALLOP");

        expect(parsed.surface)
          .toBe("turf");

        expect(parsed.distanceMeters)
          .toBe(900);

        expect(parsed.isHandicapRace)
          .toBe(true);
      },
    );

    it(
      "normalizes ATG gallop weight and handicap",
      () => {
        const parsed =
          parseResearchRunnerMeta({
            weight:
              57_500,

            horse: {
              age:
                4,

              handicap:
                65,
            },

            rider: {
              id:
                123,

              name:
                "Test Rider",
            },
          });

        expect(
          parsed.handicapRating,
        ).toBe(65);

        expect(
          parsed.carriedWeightKg,
        ).toBe(57.5);

        expect(
          parsed.riderId,
        ).toBe(123);

        expect(
          parsed.riderName,
        ).toBe(
          "Test Rider",
        );
      },
    );

    it(
      "treats ATG handicap zero as missing",
      () => {
        const parsed =
          parseResearchRunnerMeta({
            weight:
              60_000,

            horse: {
              handicap:
                0,
            },
          });

        expect(
          parsed.handicapRating,
        ).toBeNull();

        expect(
          parsed.carriedWeightKg,
        ).toBe(60);
      },
    );

    it(
      "also accepts an already normalized kg value",
      () => {
        const parsed =
          parseResearchRunnerMeta({
            weight:
              59.5,

            horse: {
              handicap:
                72,
            },
          });

        expect(
          parsed.carriedWeightKg,
        ).toBe(59.5);

        expect(
          parsed.handicapRating,
        ).toBe(72);
      },
    );
  },
);
