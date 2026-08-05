import type {
  SmoothestCandidate,
} from "../../src/placeModel/types";

import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

import {
  SMALLKARAMELL_RULE_CONFIG_V1,
} from "../../src/winPlaceModel/config";

import {
  selectWinPlaceCandidate,
} from "../../src/winPlaceModel/engine";

export const RESEARCH_TRIAL_SIGNAL_START_DATE =
  "2026-08-03";

export const RESEARCH_TRIAL_SIGNAL_END_DATE =
  "2026-08-16";

export const RESEARCH_TRIAL_SIGNAL_VERSION =
  "RESEARCH_TRIAL_2026-08-03_2026-08-16_V1.1";

export const RESEARCH_TRIAL_WINNER_RULE = {
  minStartOddsInclusive: 3,
  maxStartOddsInclusive: 5,
  minStrengthInclusive: 4,
} as const;

export const RESEARCH_TRIAL_PLACE_RULE = {
  maxLockOddsInclusive: 10,
  maxStrengthInclusive: 3,
} as const;

const MIN_VALID_ODDS_POINTS = 5;

function isValidOdds(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 200 &&
    Math.abs(value - 99.99) >= 0.001
  );
}

function coefficientOfVariation(
  values: number[],
): number | null {
  if (values.length < 2) {
    return null;
  }

  const average =
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length;

  if (
    !Number.isFinite(average) ||
    average <= 0
  ) {
    return null;
  }

  const variance =
    values.reduce(
      (sum, value) =>
        sum + (value - average) ** 2,
      0,
    ) / values.length;

  return (
    Math.sqrt(variance) /
    average
  ) * 100;
}

function buildCandidates(
  runners: WinPlaceRunnerInput[],
): WinPlaceCandidate[] {
  const activeRunners =
    runners.filter(
      (runner) => !runner.scratched,
    );

  const candidates =
    activeRunners
      .map(
        (
          runner,
        ): WinPlaceCandidate | null => {
          const history =
            runner.oddsHistory
              .filter(
                (point) =>
                  isValidOdds(point.odds),
              )
              .sort(
                (a, b) =>
                  a.timestamp -
                  b.timestamp,
              );

          if (
            history.length <
            MIN_VALID_ODDS_POINTS
          ) {
            return null;
          }

          const startOdds =
            history[0]?.odds ??
            null;

          const latestHistoryOdds =
            history[
              history.length - 1
            ]?.odds ?? null;

          const currentWinOdds =
            isValidOdds(
              runner
                .currentWinOddsDecimal,
            )
              ? runner
                  .currentWinOddsDecimal
              : latestHistoryOdds;

          if (
            !isValidOdds(startOdds) ||
            !isValidOdds(
              currentWinOdds,
            )
          ) {
            return null;
          }

          const cvRaw =
            coefficientOfVariation(
              history.map(
                (point) =>
                  point.odds,
              ),
            );

          if (cvRaw === null) {
            return null;
          }

          return {
            runnerNumber:
              runner.number,

            runnerName:
              runner.name,

            horseId:
              runner.horseId ??
              null,

            startLane:
              runner.startLane,

            startOdds,
            currentWinOdds,

            oddsDropPercent:
              (
                (
                  startOdds -
                  currentWinOdds
                ) /
                startOdds
              ) * 100,

            validOddsPoints:
              history.length,

            cvRaw,

            cvDisplay:
              Number(
                cvRaw.toFixed(2),
              ),

            strength:
              runner.strength,

            indicatorsGreen:
              runner.indicatorsGreen,
          };
        },
      )
      .filter(
        (
          candidate,
        ): candidate is WinPlaceCandidate =>
          candidate !== null,
      );

  if (
    candidates.length !==
    activeRunners.length
  ) {
    return [];
  }

  return candidates;
}

function toPlaceCandidate(
  candidate: WinPlaceCandidate,
): SmoothestCandidate {
  return {
    runnerNumber:
      candidate.runnerNumber,

    runnerName:
      candidate.runnerName,

    startLane:
      candidate.startLane,

    startOdds:
      candidate.startOdds,

    currentWinOdds:
      candidate.currentWinOdds,

    oddsDropPercent:
      candidate.oddsDropPercent,

    validOddsPoints:
      candidate.validOddsPoints,

    cvRaw:
      candidate.cvRaw,

    cvDisplay:
      candidate.cvDisplay,

    strength:
      candidate.strength,

    indicatorsGreen:
      candidate.indicatorsGreen,
  };
}

function isGallopMeeting(
  trackName: string,
  meetingName:
    string | null | undefined,
) {
  const text = [
    trackName,
    meetingName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("galopp") ||
    text.includes("bro park")
  );
}

function isCancelled(
  raceStatus:
    string | null | undefined,
) {
  return /install|inst[äa]lld|inst[äa]llt|cancel/i.test(
    raceStatus ?? "",
  );
}

export function isResearchTrialSignalDate(
  raceDate: string,
) {
  return (
    raceDate >=
      RESEARCH_TRIAL_SIGNAL_START_DATE &&
    raceDate <=
      RESEARCH_TRIAL_SIGNAL_END_DATE
  );
}

export function evaluateResearchTrialSignals(
  args: {
    raceDate: string;
    trackName: string;

    meetingName?:
      string | null;

    raceStatus?:
      string | null;

    isMonte: boolean;

    runners:
      WinPlaceRunnerInput[];

    hasCompleteOddsHistory?:
      boolean;

    hasFreshCurrentOddsPoint?:
      boolean;
  },
) {
  const {
    raceDate,
    trackName,
    meetingName,
    raceStatus,
    isMonte,
    runners,
    hasCompleteOddsHistory =
      true,
    hasFreshCurrentOddsPoint =
      true,
  } = args;

  if (
    !isResearchTrialSignalDate(
      raceDate,
    )
  ) {
    return {
      active: false,
      winnerCandidate: null,
      placeCandidate: null,
      smallkaramellCandidate: null,
      excludedReason:
        "Utanför testperioden",
    };
  }

  if (
    isMonte ||
    isGallopMeeting(
      trackName,
      meetingName,
    ) ||
    isCancelled(raceStatus) ||
    !hasCompleteOddsHistory ||
    !hasFreshCurrentOddsPoint
  ) {
    return {
      active: true,
      winnerCandidate: null,
      placeCandidate: null,
      smallkaramellCandidate: null,
      excludedReason:
        "Loppet uppfyller inte grundkraven",
    };
  }

  const candidates =
    buildCandidates(runners);

  if (!candidates.length) {
    return {
      active: true,
      winnerCandidate: null,
      placeCandidate: null,
      smallkaramellCandidate: null,
      excludedReason:
        "Otillräcklig oddshistorik",
    };
  }

  const favorite =
    [...candidates].sort(
      (a, b) =>
        a.currentWinOdds -
          b.currentWinOdds ||
        a.runnerNumber -
          b.runnerNumber,
    )[0] ?? null;

  const winnerCandidate =
    favorite !== null &&
    favorite.startOdds +
      Number.EPSILON >=
      RESEARCH_TRIAL_WINNER_RULE
        .minStartOddsInclusive &&
    favorite.startOdds <=
      RESEARCH_TRIAL_WINNER_RULE
        .maxStartOddsInclusive +
        Number.EPSILON &&
    favorite.strength >=
      RESEARCH_TRIAL_WINNER_RULE
        .minStrengthInclusive
      ? favorite
      : null;

  const smoothest =
    [...candidates].sort(
      (a, b) => {
        if (a.cvRaw !== b.cvRaw) {
          return a.cvRaw - b.cvRaw;
        }

        if (
          a.strength !==
          b.strength
        ) {
          return (
            b.strength -
            a.strength
          );
        }

        if (
          a.currentWinOdds !==
          b.currentWinOdds
        ) {
          return (
            a.currentWinOdds -
            b.currentWinOdds
          );
        }

        if (
          a.oddsDropPercent !==
          b.oddsDropPercent
        ) {
          return (
            b.oddsDropPercent -
            a.oddsDropPercent
          );
        }

        return (
          a.runnerNumber -
          b.runnerNumber
        );
      },
    )[0] ?? null;

  const placeCandidate =
    smoothest !== null &&
    smoothest.currentWinOdds <=
      RESEARCH_TRIAL_PLACE_RULE
        .maxLockOddsInclusive +
        Number.EPSILON &&
    smoothest.strength <=
      RESEARCH_TRIAL_PLACE_RULE
        .maxStrengthInclusive
      ? toPlaceCandidate(
          smoothest,
        )
      : null;

  const rankedS2 =
    selectWinPlaceCandidate(
      candidates,
      SMALLKARAMELL_RULE_CONFIG_V1.selectionRank,
    );

  const smallkaramellCandidate =
    rankedS2 !== null &&
    rankedS2.currentWinOdds <=
      SMALLKARAMELL_RULE_CONFIG_V1.maxCurrentWinOddsInclusive +
        Number.EPSILON
      ? rankedS2
      : null;

  return {
    active: true,
    winnerCandidate,
    placeCandidate,
    smallkaramellCandidate,
    excludedReason: null,
  };
}
