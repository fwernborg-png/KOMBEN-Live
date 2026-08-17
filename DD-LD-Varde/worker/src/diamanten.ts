import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

export const DIAMANTEN_RULE_VERSION = "DIAMANTEN_V1.0";
export const DIAMANTEN_STRATEGY_CODE = "DIAMANTEN";
export const DIAMANTEN_PROSPECTIVE_START_DATE = "2026-08-11";

export const DIAMANTEN_STAKE_SEK = 100;

export const DIAMANTEN_LOCK_TARGET_SECONDS = 90;
export const DIAMANTEN_LOCK_WINDOW_OPENS_SECONDS = 120;
export const DIAMANTEN_LOCK_WINDOW_CLOSES_SECONDS = 60;

export const DIAMANTEN_DISTANCE_METERS = 2140;

export const DIAMANTEN_MIN_ACTIVE_STARTERS = 7;
export const DIAMANTEN_MAX_ACTIVE_STARTERS = 10;

export const DIAMANTEN_MIN_LOCK_ODDS_INCLUSIVE = 6;
export const DIAMANTEN_MAX_LOCK_ODDS_INCLUSIVE = 25;

export const DIAMANTEN_REQUIRED_STRENGTH = 3;
export const DIAMANTEN_MIN_VALID_ODDS_POINTS = 5;

export type DiamantenRunnerInput =
  WinPlaceRunnerInput & {
    indicatorDataComplete: boolean;
    oddsDataComplete: boolean;
  };

export type DiamantenEvaluation = {
  active: boolean;
  candidates: WinPlaceCandidate[];
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

function isCancelled(
  raceStatus: string | null | undefined,
) {
  return /install|inst[äa]lld|inst[äa]llt|cancel/i.test(
    raceStatus ?? "",
  );
}

function isGallopRace(
  trackName: string,
  raceCategory: string | null | undefined,
) {
  const normalizedTrack =
    trackName.trim().toLowerCase();

  const normalizedCategory =
    (raceCategory ?? "").toLowerCase();

  return (
    normalizedCategory.includes("galopp") ||
    normalizedTrack.includes("galopp") ||
    normalizedTrack === "bro park"
  );
}

function buildCandidate(
  runner: DiamantenRunnerInput,
): WinPlaceCandidate | null {
  const history =
    runner.oddsHistory
      .filter((point) =>
        isValidOdds(point.odds),
      )
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp,
      );

  if (
    history.length <
    DIAMANTEN_MIN_VALID_ODDS_POINTS
  ) {
    return null;
  }

  const startOdds =
    history[0]?.odds ?? null;

  const currentWinOdds =
    runner.currentWinOddsDecimal;

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
}

export function isDiamantenProspectiveDate(
  raceDate: string,
) {
  return (
    raceDate >=
    DIAMANTEN_PROSPECTIVE_START_DATE
  );
}

export function isInDiamantenSignalWindow(
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
      DIAMANTEN_LOCK_WINDOW_OPENS_SECONDS &&
    remainingSeconds >=
      DIAMANTEN_LOCK_WINDOW_CLOSES_SECONDS
  );
}

export function evaluateDiamanten(args: {
  raceDate: string;

  trackName: string;

  meetingName:
    string | null | undefined;

  raceCategory:
    string | null | undefined;

  raceStatus?:
    string | null;

  isMonte: boolean;

  startMethod:
    string | null | undefined;

  distanceMeters:
    number | null;

  runners:
    DiamantenRunnerInput[];
}): DiamantenEvaluation {
  const {
    raceDate,
    trackName,
    meetingName: _meetingName,
    raceCategory,
    raceStatus,
    isMonte,
    startMethod,
    distanceMeters,
    runners,
  } = args;

  const activeRunners =
    runners.filter(
      (runner) => !runner.scratched,
    );

  const activeStarters =
    activeRunners.length;

  if (
    !isDiamantenProspectiveDate(
      raceDate,
    )
  ) {
    return {
      active: false,
      candidates: [],
      activeStarters,
      excludedReason:
        "Före Diamantens prospektiva startdatum",
    };
  }

  if (
    isMonte ||
    isCancelled(raceStatus) ||
    isGallopRace(
      trackName,
      raceCategory,
    )
  ) {
    return {
      active: false,
      candidates: [],
      activeStarters,
      excludedReason:
        "Inte giltigt travlopp",
    };
  }

  if (
    (startMethod ?? "")
      .trim()
      .toUpperCase() !== "AUTO"
  ) {
    return {
      active: false,
      candidates: [],
      activeStarters,
      excludedReason:
        "Startmetoden är inte autostart",
    };
  }

  if (
    distanceMeters !==
    DIAMANTEN_DISTANCE_METERS
  ) {
    return {
      active: false,
      candidates: [],
      activeStarters,
      excludedReason:
        "Distansen är inte 2140 meter",
    };
  }

  if (
    activeStarters <
      DIAMANTEN_MIN_ACTIVE_STARTERS ||
    activeStarters >
      DIAMANTEN_MAX_ACTIVE_STARTERS
  ) {
    return {
      active: false,
      candidates: [],
      activeStarters,
      excludedReason:
        "Startfältet är inte 7–10 aktiva hästar",
    };
  }

  const candidates =
    activeRunners
      .filter(
        (runner) =>
          runner.strength ===
            DIAMANTEN_REQUIRED_STRENGTH &&
          runner.indicatorDataComplete &&
          runner.oddsDataComplete &&
          isValidOdds(
            runner.currentWinOddsDecimal,
          ) &&
          runner.currentWinOddsDecimal >=
            DIAMANTEN_MIN_LOCK_ODDS_INCLUSIVE &&
          runner.currentWinOddsDecimal <=
            DIAMANTEN_MAX_LOCK_ODDS_INCLUSIVE,
      )
      .map(buildCandidate)
      .filter(
        (
          candidate,
        ): candidate is WinPlaceCandidate =>
          candidate !== null,
      )
      .sort(
        (a, b) =>
          a.runnerNumber -
          b.runnerNumber,
      );

  return {
    active: true,
    candidates,
    activeStarters,
    excludedReason:
      candidates.length > 0
        ? null
        : "Ingen Diamanten-kandidat",
  };
}
