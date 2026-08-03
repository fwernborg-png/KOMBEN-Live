import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

import {
  evaluateResearchTrialSignals,
  isResearchTrialSignalDate,
} from "./researchTrialSignals";

function history(
  values: number[],
) {
  return values.map(
    (odds, index) => ({
      odds,
      timestamp:
        1_000 +
        index * 60_000,
    }),
  );
}

function runner(
  overrides:
    Partial<WinPlaceRunnerInput> &
    Pick<
      WinPlaceRunnerInput,
      "number"
    >,
): WinPlaceRunnerInput {
  return {
    number:
      overrides.number,

    name:
      overrides.name ??
      `Häst ${overrides.number}`,

    horseId:
      overrides.horseId ??
      overrides.number * 100,

    startLane:
      overrides.startLane ??
      overrides.number,

    scratched:
      overrides.scratched ??
      false,

    currentWinOddsDecimal:
      overrides
        .currentWinOddsDecimal ??
      null,

    indicatorsGreen:
      overrides
        .indicatorsGreen ??
      [],

    strength:
      overrides.strength ??
      0,

    oddsHistory:
      overrides.oddsHistory ??
      history([
        8,
        7.9,
        7.8,
        7.7,
        7.6,
      ]),
  };
}

const base = {
  raceDate:
    "2026-08-10",

  trackName:
    "Bergsåker",

  meetingName:
    "Bergsåker",

  raceStatus:
    "STARTLISTA",

  isMonte:
    false,

  hasCompleteOddsHistory:
    true,

  hasFreshCurrentOddsPoint:
    true,
};

describe(
  "tvåveckorstestets signaler",
  () => {
    it(
      "är aktivt 3–16 augusti",
      () => {
        expect(
          isResearchTrialSignalDate(
            "2026-08-03",
          ),
        ).toBe(true);

        expect(
          isResearchTrialSignalDate(
            "2026-08-16",
          ),
        ).toBe(true);

        expect(
          isResearchTrialSignalDate(
            "2026-08-17",
          ),
        ).toBe(false);
      },
    );

    it(
      "ger vinnare på favoriten med startodds 3–5 och styrka minst 4",
      () => {
        const result =
          evaluateResearchTrialSignals({
            ...base,

            runners: [
              runner({
                number: 1,
                strength: 4,
                currentWinOddsDecimal:
                  2.8,
                oddsHistory:
                  history([
                    4,
                    3.8,
                    3.4,
                    3,
                    2.9,
                  ]),
              }),

              runner({
                number: 2,
                strength: 6,
                currentWinOddsDecimal:
                  3.2,
                oddsHistory:
                  history([
                    3.5,
                    3.45,
                    3.4,
                    3.3,
                    3.2,
                  ]),
              }),
            ],
          });

        expect(
          result
            .winnerCandidate
            ?.runnerNumber,
        ).toBe(1);
      },
    );

    it(
      "väljer inte nästfavoriten om favoriten missar startoddset",
      () => {
        const result =
          evaluateResearchTrialSignals({
            ...base,

            runners: [
              runner({
                number: 1,
                strength: 5,
                currentWinOddsDecimal:
                  2.3,
                oddsHistory:
                  history([
                    2.5,
                    2.45,
                    2.4,
                    2.35,
                    2.3,
                  ]),
              }),

              runner({
                number: 2,
                strength: 6,
                currentWinOddsDecimal:
                  3.6,
                oddsHistory:
                  history([
                    4,
                    3.9,
                    3.8,
                    3.7,
                    3.6,
                  ]),
              }),
            ],
          });

        expect(
          result
            .winnerCandidate,
        ).toBeNull();
      },
    );

    it(
      "ger plats på jämnaste med låsodds högst 10 och styrka högst 3",
      () => {
        const result =
          evaluateResearchTrialSignals({
            ...base,

            runners: [
              runner({
                number: 1,
                strength: 2,
                currentWinOddsDecimal:
                  9,
                oddsHistory:
                  history([
                    9,
                    9.01,
                    9,
                    9.02,
                    9,
                  ]),
              }),

              runner({
                number: 2,
                strength: 3,
                currentWinOddsDecimal:
                  7.8,
                oddsHistory:
                  history([
                    8,
                    7.7,
                    7.9,
                    7.6,
                    7.8,
                  ]),
              }),
            ],
          });

        expect(
          result
            .placeCandidate
            ?.runnerNumber,
        ).toBe(1);
      },
    );

    it(
      "väljer inte näst jämnaste om den jämnaste har för hög styrka",
      () => {
        const result =
          evaluateResearchTrialSignals({
            ...base,

            runners: [
              runner({
                number: 1,
                strength: 4,
                currentWinOddsDecimal:
                  7,
                oddsHistory:
                  history([
                    7,
                    7.01,
                    7,
                    7.01,
                    7,
                  ]),
              }),

              runner({
                number: 2,
                strength: 2,
                currentWinOddsDecimal:
                  8,
                oddsHistory:
                  history([
                    8,
                    7.9,
                    8.1,
                    8,
                    7.95,
                  ]),
              }),
            ],
          });

        expect(
          result
            .placeCandidate,
        ).toBeNull();
      },
    );

    it(
      "utesluter monté och galopp",
      () => {
        const runners = [
          runner({
            number: 1,
            strength: 4,
            currentWinOddsDecimal:
              3.5,
            oddsHistory:
              history([
                4,
                3.9,
                3.8,
                3.7,
                3.6,
              ]),
          }),
        ];

        expect(
          evaluateResearchTrialSignals({
            ...base,
            isMonte: true,
            runners,
          }).winnerCandidate,
        ).toBeNull();

        expect(
          evaluateResearchTrialSignals({
            ...base,
            trackName:
              "Jägersro Galopp",
            runners,
          }).winnerCandidate,
        ).toBeNull();
      },
    );
  },
);
