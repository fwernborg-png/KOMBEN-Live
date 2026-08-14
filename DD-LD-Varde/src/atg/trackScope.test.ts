import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isExcludedAtgNonRacingTrackName,
} from "./trackScope";

describe(
  "ATG track scope",
  () => {
    it(
      "excludes ATG Riders League",
      () => {
        expect(
          isExcludedAtgNonRacingTrackName(
            "ATG Riders League Mantorp",
          ),
        ).toBe(true);

        expect(
          isExcludedAtgNonRacingTrackName(
            "  atg   riders league BORÅS ",
          ),
        ).toBe(true);
      },
    );

    it(
      "keeps real racing tracks",
      () => {
        expect(
          isExcludedAtgNonRacingTrackName(
            "Mantorp",
          ),
        ).toBe(false);

        expect(
          isExcludedAtgNonRacingTrackName(
            "Bro Park",
          ),
        ).toBe(false);

        expect(
          isExcludedAtgNonRacingTrackName(
            "Övrevoll",
          ),
        ).toBe(false);
      },
    );
  },
);
