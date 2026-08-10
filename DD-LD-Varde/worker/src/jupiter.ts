import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

export const JUPITER_RULE_VERSION =
  "JUPITER_V1.0";

export const JUPITER_STRATEGY_CODE =
  "JUPITER";

export const JUPITER_STAKE_SEK = 100;

export const JUPITER_LOCK_TARGET_SECONDS = 90;
export const JUPITER_LOCK_WINDOW_OPENS_SECONDS = 120;
export const JUPITER_LOCK_WINDOW_CLOSES_SECONDS = 60;

export function getJupiterPlaceHitMaxOfficialFinishPosition(
  activeStarters: number,
) {
  return activeStarters >= 7 ? 3 : 2;
}

/*
 * Jämnaste kräver matematiskt minst två punkter.
 * Detta är inte ett extra spelvillkor.
 */
const MIN_VALID_ODDS_POINTS = 2;

export type JupiterEvaluation = {
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

  /*
   * Jupiter ska använda Jämnaste.
   * Om någon aktiv häst saknar tillräcklig
   * data utses ingen Jämnaste säkert.
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

export function isInJupiterSignalWindow(
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
      JUPITER_LOCK_WINDOW_OPENS_SECONDS &&
    remainingSeconds >=
      JUPITER_LOCK_WINDOW_CLOSES_SECONDS
  );
}

export function evaluateJupiter(
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
): JupiterEvaluation {
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

  /*
   * JUPITER V1.0
   *
   * PLATS på Jämnaste.
   *
   * Låsodds:
   * 3,00 <= odds < 4,00
   *
   * Oddset får inte ha stigit:
   * oddsDropPercent >= 0
   */

  if (
    smoothest.currentWinOdds < 3 ||
    smoothest.currentWinOdds >= 4
  ) {
    return {
      active: true,
      candidate: null,
      smoothest,
      activeStarters,
      excludedReason:
        "Jämnastes låsodds är inte 3,00–3,99",
    };
  }

  if (
    smoothest.oddsDropPercent < 0
  ) {
    return {
      active: true,
      candidate: null,
      smoothest,
      activeStarters,
      excludedReason:
        "Jämnastes odds har stigit",
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
