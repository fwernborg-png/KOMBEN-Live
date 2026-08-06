import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifySpeedCellFromRgba,
  findSpeedAnalysisMarker,
  getSpeedAnalysisInterest,
  hasProbableLeaderBorderFromRgba,
  parseRankText,
  parseSpeedFilenameMetadata,
  speedHorseNamesMatch,
  validateSpeedAnalysisDocument,
} from "./logic";

import type {
  SpeedAnalysisDocument,
  SpeedAnalysisMarker,
  SpeedAnalysisRunner,
} from "./types";

function solidPixels(
  red: number,
  green: number,
  blue: number,
  count = 100,
): Uint8ClampedArray {
  const values =
    new Uint8ClampedArray(
      count *
      4,
    );

  for (
    let index = 0;
    index <
      count;
    index += 1
  ) {
    values[index * 4] =
      red;

    values[
      index * 4 +
      1
    ] =
      green;

    values[
      index * 4 +
      2
    ] =
      blue;

    values[
      index * 4 +
      3
    ] =
      255;
  }

  return values;
}

function runner(
  legNumber: number,
  runnerNumber: number,
): SpeedAnalysisRunner {
  return {
    legNumber,
    runnerNumber,

    horseName:
      `Häst ${legNumber}-${runnerNumber}`,

    normalizedHorseName:
      `hast${legNumber}${runnerNumber}`,

    spetsText: "",

    botText: "12,0",
    s1000Text: "10,0",
    s500Text: "8,0",

    botColor: "NONE",
    s1000Color: "NONE",
    s500Color: "NONE",

    probableLeader:
      runnerNumber === 1,

    ownProbableLeader:
      false,

    rankPosition: null,
    rankText: "",

    sourcePage: 2,
  };
}

function marker(
  overrides:
    Partial<SpeedAnalysisMarker> = {},
): SpeedAnalysisMarker {
  return {
    ...runner(
      1,
      1,
    ),

    id: null,
    importId: null,

    product: "V86",

    raceDate:
      "2026-08-05",

    trackName:
      "Mantorp",

    trackKey:
      "mantorp",

    sourceFilename:
      "V86-260805-Mantorp.pdf",

    horseName:
      "Graces Bird",

    normalizedHorseName:
      "gracesbird",

    s1000Color:
      "GREEN",

    s500Color:
      "GREEN",

    rankPosition: 1,

    ...overrides,
  };
}

describe(
  "Speedanalysen",
  () => {
    it(
      "läser båda filnamnsformaten",
      () => {
        expect(
          parseSpeedFilenameMetadata(
            "V86-260805-Mantorp.pdf",
          ),
        ).toEqual({
          product: "V86",
          raceDate:
            "2026-08-05",
          trackName:
            "Mantorp",
        });

        expect(
          parseSpeedFilenameMetadata(
            "Sp260801-Rattvik.pdf",
          ),
        ).toEqual({
          product: "V85",
          raceDate:
            "2026-08-01",
          trackName:
            "Rattvik",
        });
      },
    );

    it(
      "tolkar rankorden ett, två och tre",
      () => {
        expect(
          parseRankText(
            "ETT",
          ),
        ).toBe(1);

        expect(
          parseRankText(
            "Två",
          ),
        ).toBe(2);

        expect(
          parseRankText(
            "Tre",
          ),
        ).toBe(3);
      },
    );

    it(
      "skiljer grön, gul och röd cell",
      () => {
        expect(
          classifySpeedCellFromRgba(
            solidPixels(
              0,
              176,
              80,
            ),
          ),
        ).toBe("GREEN");

        expect(
          classifySpeedCellFromRgba(
            solidPixels(
              255,
              255,
              0,
            ),
          ),
        ).toBe("YELLOW");

        expect(
          classifySpeedCellFromRgba(
            solidPixels(
              255,
              0,
              0,
            ),
          ),
        ).toBe("RED");
      },
    );

    it(
      "känner igen den klargröna spetsramen",
      () => {
        expect(
          hasProbableLeaderBorderFromRgba(
            solidPixels(
              0,
              255,
              0,
            ),
          ),
        ).toBe(true);
      },
    );

    it(
      "matchar hästnamn trots skiljetecken och mindre PDF-skillnader",
      () => {
        expect(
          speedHorseNamesMatch(
            "H.C.'s Crazy Horse",
            "H.C.s Crazy Horse",
          ),
        ).toBe(true);

        expect(
          speedHorseNamesMatch(
            "Monnier Mearas",
            "Monnier Mearas A",
          ),
        ).toBe(true);
      },
    );

    it(
      "ger högsta intresse när dubbelgrönt sammanfaller med oddssignal",
      () => {
        expect(
          getSpeedAnalysisInterest(
            marker(),
            true,
          ),
        ).toBe("HOT");

        expect(
          getSpeedAnalysisInterest(
            marker(),
            false,
          ),
        ).toBe("EXTRA");
      },
    );

    it(
      "hittar rätt markerad häst",
      () => {
        expect(
          findSpeedAnalysisMarker(
            [
              marker(),
            ],
            {
              trackName:
                "Mantorp",

              runnerNumber: 1,

              horseName:
                "Graces Bird",
            },
          )?.legNumber,
        ).toBe(1);
      },
    );

    it(
      "stoppar import när ett lopp har två spetshästar",
      () => {
        const runners =
          Array.from(
            {
              length: 8,
            },
            (
              _leg,
              legIndex,
            ) =>
              Array.from(
                {
                  length: 5,
                },
                (
                  _row,
                  runnerIndex,
                ) =>
                  runner(
                    legIndex + 1,
                    runnerIndex + 1,
                  ),
              ),
          ).flat();

        runners[1] = {
          ...runners[1],
          probableLeader: true,
        };

        const document:
          SpeedAnalysisDocument = {
            product: "V86",

            raceDate:
              "2026-08-05",

            trackName:
              "Mantorp",

            trackKey:
              "mantorp",

            sourceFilename:
              "test.pdf",

            pageCount: 6,

            runners,

            parserWarnings: [],
          };

        expect(
          validateSpeedAnalysisDocument(
            document,
          ).errors,
        ).toContain(
          "V86-1 måste ha exakt en PDF-spetshäst, men 2 hittades.",
        );
      },
    );

    it(
      "stoppar fler än ett eget spetsval i samma lopp",
      () => {
        const runners =
          Array.from(
            {
              length: 8,
            },
            (
              _leg,
              legIndex,
            ) =>
              Array.from(
                {
                  length: 5,
                },
                (
                  _row,
                  runnerIndex,
                ) =>
                  runner(
                    legIndex + 1,
                    runnerIndex + 1,
                  ),
              ),
          ).flat();

        runners[0] = {
          ...runners[0],
          ownProbableLeader: true,
        };

        runners[1] = {
          ...runners[1],
          ownProbableLeader: true,
        };

        const document:
          SpeedAnalysisDocument = {
            product: "V86",

            raceDate:
              "2026-08-05",

            trackName:
              "Mantorp",

            trackKey:
              "mantorp",

            sourceFilename:
              "test.pdf",

            pageCount: 6,

            runners,

            parserWarnings: [],
          };

        expect(
          validateSpeedAnalysisDocument(
            document,
          ).errors,
        ).toContain(
          "V86-1 får ha högst en egen spetshäst, men 2 hittades.",
        );
      },
    );

    it(
      "godkänner åtta avdelningar och minst 40 hästar",
      () => {
        const runners =
          Array.from(
            {
              length: 8,
            },
            (
              _leg,
              legIndex,
            ) =>
              Array.from(
                {
                  length: 5,
                },
                (
                  _row,
                  runnerIndex,
                ) =>
                  runner(
                    legIndex + 1,
                    runnerIndex + 1,
                  ),
              ),
          ).flat();

        const document:
          SpeedAnalysisDocument = {
            product: "V86",

            raceDate:
              "2026-08-05",

            trackName:
              "Mantorp",

            trackKey:
              "mantorp",

            sourceFilename:
              "test.pdf",

            pageCount: 6,

            runners,

            parserWarnings: [],
          };

        expect(
          validateSpeedAnalysisDocument(
            document,
          ).errors,
        ).toEqual([]);
      },
    );
  },
);
