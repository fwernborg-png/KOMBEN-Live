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
      },
    );

    it(
      "does not open foreign trot",
      () => {
        expect(
          shouldIncludeResearchTrack({
            countryCode: "FR",
            sport: "trot",
          }),
        ).toBe(false);

        expect(
          shouldIncludeResearchTrack({
            countryCode: "DK",
            sport: "trot",
          }),
        ).toBe(false);
      },
    );
  },
);
