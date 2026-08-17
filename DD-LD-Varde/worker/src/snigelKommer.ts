import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

import {
  MODEL_MIN_WIN_ODDS_INCLUSIVE,
} from "../../src/winPlaceModel/config";

export const SNIGEL_KOMMER_RULE_VERSION =
  "SNIGEL_KOMMER_V1.0";

export const SNIGEL_KOMMER_STRATEGY_CODE =
  "SNIGEL_KOMMER";

export const SNIGEL_KOMMER_STAKE_SEK = 100;

export const SNIGEL_KOMMER_LOCK_TARGET_SECONDS = 90;
export const SNIGEL_KOMMER_LOCK_WINDOW_OPENS_SECONDS = 120;
export const SNIGEL_KOMMER_LOCK_WINDOW_CLOSES_SECONDS = 60;

const MIN_VALID_ODDS_POINTS = 5;

export type SnigelKommerEvaluation = {
  active: boolean;
  candidate: WinPlaceCandidate | null;
  activeStarters: number;
  excludedReason: string | null;
};

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
            history[0]?.odds ?? null;

          const latestHistoryOdds =
            history[
              history.length - 1
            ]?.odds ?? null;

          const currentWinOdds =
            latestHistoryOdds;

          if (
            !isValidOdds(startOdds) ||
            !isValidOdds(currentWinOdds)
          ) {
            return null;
          }

          const cvRaw =
            coefficientOfVariation(
              history.map(
                (point) => point.odds,
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
              runner.horseId ?? null,

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

  /*
   * Jämnaste kan bara utses säkert
   * om samtliga aktiva hästar har
   * tillräcklig oddshistorik.
   */
  if (
    candidates.length !==
    activeRunners.length
  ) {
    return [];
  }

  return candidates;
}

function selectSmoothest(
  candidates: WinPlaceCandidate[],
) {
  return (
    [...candidates].sort(
      (a, b) =>
        a.cvRaw - b.cvRaw ||
        a.runnerNumber - b.runnerNumber,
    )[0] ?? null
  );
}

export function isInSnigelKommerSignalWindow(
  plannedStartTime: string,
  nowMs: number,
) {
  const startMs =
    Date.parse(plannedStartTime);

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(nowMs)
  ) {
    return false;
  }

  const remainingSeconds =
    (startMs - nowMs) / 1_000;

  return (
    remainingSeconds <=
      SNIGEL_KOMMER_LOCK_WINDOW_OPENS_SECONDS &&
    remainingSeconds >=
      SNIGEL_KOMMER_LOCK_WINDOW_CLOSES_SECONDS
  );
}

export function evaluateSnigelKommer(
  args: {
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
): SnigelKommerEvaluation {
  const {
    trackName,
    meetingName,
    raceStatus,
    isMonte,
    runners,
    hasCompleteOddsHistory = true,
    hasFreshCurrentOddsPoint = true,
  } = args;

  const activeStarters =
    runners.filter(
      (runner) => !runner.scratched,
    ).length;

  if (
    isMonte ||
    isGallopMeeting(
      trackName,
      meetingName,
    ) ||
    isCancelled(raceStatus)
  ) {
    return {
      active: false,
      candidate: null,
      activeStarters,
      excludedReason:
        "Inte giltigt travlopp",
    };
  }

  if (
    activeStarters !== 9 &&
    activeStarters !== 10
  ) {
    return {
      active: true,
      candidate: null,
      activeStarters,
      excludedReason:
        "Snigel kräver 9 eller 10 startande",
    };
  }

  if (
    !hasCompleteOddsHistory ||
    !hasFreshCurrentOddsPoint
  ) {
    return {
      active: true,
      candidate: null,
      activeStarters,
      excludedReason:
        "Otillräcklig oddshistorik",
    };
  }

  const candidates =
    buildCandidates(runners);

  if (!candidates.length) {
    return {
      active: true,
      candidate: null,
      activeStarters,
      excludedReason:
        "Jämnaste kan inte utses säkert",
    };
  }

  const smoothest =
    selectSmoothest(candidates);

  if (!smoothest) {
    return {
      active: true,
      candidate: null,
      activeStarters,
      excludedReason:
        "Ingen jämnaste häst",
    };
  }

  if (
    smoothest.currentWinOdds + Number.EPSILON <
    MODEL_MIN_WIN_ODDS_INCLUSIVE
  ) {
    return {
      active: true,
      candidate: null,
      activeStarters,
      excludedReason:
        `Vinnarodds under ${MODEL_MIN_WIN_ODDS_INCLUSIVE.toFixed(2)}`,
    };
  }

  /*
   * SNIGEL KOMMER V1.0
   *
   * Spela VINNARE på Jämnaste
   * endast när oddset har STIGIT
   * från första odds till lås.
   *
   * oddsDropPercent < 0
   * betyder:
   * currentWinOdds > startOdds.
   */
  if (
    smoothest.oddsDropPercent >= 0
  ) {
    return {
      active: true,
      candidate: null,
      activeStarters,
      excludedReason:
        "Jämnastes odds har inte stigit",
    };
  }

  return {
    active: true,
    candidate: smoothest,
    activeStarters,
    excludedReason: null,
  };
}
