import {
  describe,
  expect,
  it,
} from "vitest";

import {
  shouldEvaluateTravStrategy,
  shouldIncludeResearchTrack,
  shouldIncludeStrategyTrack,
} from "./researchTrackScope";

describe(
  "research track scope",
  () => {
    it(
      "keeps the live strategy track scope Sweden-only",
      () => {
        expect(
          shouldIncludeStrategyTrack(
            "SE",
          ),
        ).toBe(true);

        expect(
          shouldIncludeStrategyTrack(
            "NO",
          ),
        ).toBe(false);

        expect(
          shouldIncludeStrategyTrack(
            "ZA",
          ),
        ).toBe(false);

        expect(
          shouldIncludeStrategyTrack(
            null,
          ),
        ).toBe(false);
      },
    );

    it(
      "allows only trot for Travfest strategies",
      () => {
        expect(
          shouldEvaluateTravStrategy(
            "TROT",
          ),
        ).toBe(true);

        expect(
          shouldEvaluateTravStrategy(
            "trot",
          ),
        ).toBe(true);

        expect(
          shouldEvaluateTravStrategy(
            "GALLOP",
          ),
        ).toBe(false);

        expect(
          shouldEvaluateTravStrategy(
            "gallop",
          ),
        ).toBe(false);

        expect(
          shouldEvaluateTravStrategy(
            null,
          ),
        ).toBe(false);
      },
    );

    it(
      "includes Swedish research",
      () => {
        expect(
          shouldIncludeResearchTrack({
            countryCode: "SE",
            sport: "trot",
          }),
        ).toBe(true);
      },
    );

    it(
      "includes approved foreign gallop",
      () => {
        for (
          const countryCode of [
            "DK",
            "NO",
            "ZA",
          ]
        ) {
          expect(
            shouldIncludeResearchTrack({
              countryCode,
              sport: "gallop",
            }),
          ).toBe(true);
        }
      },
    );

    it(
      "rejects unapproved gallop markets",
      () => {
        for (
          const countryCode of [
            "GB",
            "IE",
            "FR",
            "DE",
            "IT",
            "HK",
            "US",
            "CA",
          ]
        ) {
          expect(
            shouldIncludeResearchTrack({
              countryCode,
              sport: "gallop",
            }),
          ).toBe(false);
        }

        expect(
          shouldIncludeResearchTrack({
            countryCode: null,
            sport: "gallop",
          }),
        ).toBe(false);
      },
    );

    it(
      "includes foreign trot for research",
      () => {
        expect(
          shouldIncludeResearchTrack({
            countryCode: "FR",
            sport: "trot",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "DK",
            sport: "trot",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "NO",
            sport: "trot",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "DE",
            sport: "trot",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "IT",
            sport: "trot",
          }),
        ).toBe(true);
      },
    );

    it(
      "still rejects unknown foreign sports",
      () => {
        expect(
          shouldIncludeResearchTrack({
            countryCode: "FR",
            sport: "jumping",
          }),
        ).toBe(false);
      },
    );
  },
);
