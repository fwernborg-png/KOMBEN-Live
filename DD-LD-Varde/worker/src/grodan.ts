import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

export const GRODAN_RULE_VERSION =
  "GRODAN_V1.0";

export const GRODAN_STRATEGY_CODE =
  "GRODAN";

export const GRODAN_STAKE_SEK = 100;

export const GRODAN_PROSPECTIVE_START_DATE =
  "2026-08-11";

export const GRODAN_LOCK_TARGET_SECONDS = 90;
export const GRODAN_LOCK_WINDOW_OPENS_SECONDS = 120;
export const GRODAN_LOCK_WINDOW_CLOSES_SECONDS = 60;

export const GRODAN_MIN_LOCK_ODDS_INCLUSIVE = 4;
export const GRODAN_MAX_LOCK_ODDS_INCLUSIVE = 9.99;

const MIN_VALID_ODDS_POINTS = 2;

export type GrodanEvaluation = {
  active: boolean;
  candidate: WinPlaceCandidate | null;
  smoothest: WinPlaceCandidate | null;
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

          const currentWinOdds =
            history[
              history.length - 1
            ]?.odds ?? null;

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

export function getGrodanPlaceHitMaxOfficialFinishPosition(
  activeStarters: number,
) {
  return activeStarters >= 7 ? 3 : 2;
}

export function isGrodanProspectiveDate(
  raceDate: string,
) {
  return (
    raceDate >=
    GRODAN_PROSPECTIVE_START_DATE
  );
}

export function isInGrodanSignalWindow(
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
      GRODAN_LOCK_WINDOW_OPENS_SECONDS &&
    remainingSeconds >=
      GRODAN_LOCK_WINDOW_CLOSES_SECONDS
  );
}

export function evaluateGrodan(
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
): GrodanEvaluation {
  const {
    raceDate,
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
    !isGrodanProspectiveDate(
      raceDate,
    )
  ) {
    return {
      active: false,
      candidate: null,
      smoothest: null,
      activeStarters,
      excludedReason:
        "Före Grodans prospektiva startdatum",
    };
  }

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
      smoothest: null,
      activeStarters,
      excludedReason:
        "Inte giltigt travlopp",
    };
  }

  if (
    !hasCompleteOddsHistory ||
    !hasFreshCurrentOddsPoint
  ) {
    return {
      active: true,
      candidate: null,
      smoothest: null,
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
      smoothest: null,
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
      smoothest: null,
      activeStarters,
      excludedReason:
        "Ingen jämnaste häst",
    };
  }

  if (
    smoothest.currentWinOdds <
      GRODAN_MIN_LOCK_ODDS_INCLUSIVE ||
    smoothest.currentWinOdds >
      GRODAN_MAX_LOCK_ODDS_INCLUSIVE
  ) {
    return {
      active: true,
      candidate: null,
      smoothest,
      activeStarters,
      excludedReason:
        "Jämnastes låsodds är inte 4,00–9,99",
    };
  }

  if (
    !smoothest.indicatorsGreen.includes(
      "G",
    )
  ) {
    return {
      active: true,
      candidate: null,
      smoothest,
      activeStarters,
      excludedReason:
        "Jämnaste har inte G grön",
    };
  }

  return {
    active: true,
    candidate: smoothest,
    smoothest,
    activeStarters,
    excludedReason: null,
  };
}
