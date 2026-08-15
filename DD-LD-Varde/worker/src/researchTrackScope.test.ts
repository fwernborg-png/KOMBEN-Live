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
      "keeps strategies Sweden-only",
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
      "includes foreign gallop",
      () => {
        expect(
          shouldIncludeResearchTrack({
            countryCode: "NO",
            sport: "gallop",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "ZA",
            sport: "gallop",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "DE",
            sport: "gallop",
          }),
        ).toBe(true);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "IT",
            sport: "gallop",
          }),
        ).toBe(true);
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
