import {
  describe,
  expect,
  it,
} from "vitest";

import {
  shouldIncludeResearchTrack,
  shouldIncludeStrategyTrack,
} from "./researchTrackScope";

describe(
  "research track scope",
  () => {
    it(
      "keeps strategies Swedish trot only",
      () => {
        expect(
          shouldIncludeStrategyTrack({
            countryCode: "SE",
            sport: "trot",
          }),
        ).toBe(true);

        expect(
          shouldIncludeStrategyTrack({
            countryCode: "SE",
            sport: "gallop",
          }),
        ).toBe(false);

        expect(
          shouldIncludeStrategyTrack({
            countryCode: "NO",
            sport: "trot",
          }),
        ).toBe(false);

        expect(
          shouldIncludeStrategyTrack({
            countryCode: "ZA",
            sport: "gallop",
          }),
        ).toBe(false);

        expect(
          shouldIncludeStrategyTrack({
            countryCode: null,
            sport: "trot",
          }),
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
