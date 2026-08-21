import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

export const FEGISEN_RULE_VERSION = "FEGISEN_V1.0";
export const FEGISEN_STRATEGY_CODE = "FEGISEN";
export const FEGISEN_PROSPECTIVE_START_DATE = "2026-08-21";
export const FEGISEN_STAKE_SEK = 100;

export const FEGISEN_LOCK_TARGET_SECONDS = 90;
export const FEGISEN_LOCK_WINDOW_OPENS_SECONDS = 120;
export const FEGISEN_LOCK_WINDOW_CLOSES_SECONDS = 60;

export const FEGISEN_MIN_STARTERS = 10;
export const FEGISEN_MAX_STARTERS = 12;
export const FEGISEN_MIN_WIN_ODDS = 2;
export const FEGISEN_MAX_WIN_ODDS_EXCLUSIVE = 3;

export type FegisenEvaluation = {
  active: boolean;
  candidate: WinPlaceCandidate | null;
  favorite: WinPlaceCandidate | null;
  activeStarters: number;
  excludedReason: string | null;
};

function validOdds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 200 &&
    Math.abs(value - 99.99) >= 0.001
  );
}

function toCandidate(
  runner: WinPlaceRunnerInput,
): WinPlaceCandidate | null {
  const history = [...runner.oddsHistory]
    .filter((point) => validOdds(point.odds))
    .sort((a, b) => a.timestamp - b.timestamp);

  const latestHistoryOdds =
    history[history.length - 1]?.odds ?? null;

  const currentWinOdds =
    validOdds(latestHistoryOdds)
      ? latestHistoryOdds
      : validOdds(runner.currentWinOddsDecimal)
        ? runner.currentWinOddsDecimal
        : null;

  if (currentWinOdds === null) return null;

  const startOdds = history[0]?.odds ?? currentWinOdds;

  const oddsDropPercent =
    startOdds > 0
      ? ((startOdds - currentWinOdds) / startOdds) * 100
      : 0;

  const values = history.map((point) => point.odds);

  const average =
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) /
        values.length
      : currentWinOdds;

  const variance =
    values.length >= 2 && average > 0
      ? values.reduce(
          (sum, value) => sum + (value - average) ** 2,
          0,
        ) / values.length
      : 0;

  const cvRaw =
    average > 0
      ? (Math.sqrt(variance) / average) * 100
      : 0;

  return {
    runnerNumber: runner.number,
    runnerName: runner.name,
    horseId: runner.horseId ?? null,
    startLane: runner.startLane,
    startOdds,
    currentWinOdds,
    oddsDropPercent,
    validOddsPoints: history.length,
    cvRaw,
    cvDisplay: Number(cvRaw.toFixed(2)),
    strength: runner.strength,
    indicatorsGreen: runner.indicatorsGreen,
  };
}

function findFavorite(
  runners: WinPlaceRunnerInput[],
): WinPlaceCandidate | null {
  const candidates = runners
    .map(toCandidate)
    .filter(
      (candidate): candidate is WinPlaceCandidate =>
        candidate !== null,
    );

  if (candidates.length !== runners.length) {
    return null;
  }

  return (
    [...candidates].sort(
      (a, b) =>
        a.currentWinOdds - b.currentWinOdds ||
        a.runnerNumber - b.runnerNumber,
    )[0] ?? null
  );
}

export function isInFegisenSignalWindow(
  plannedStartTime: string,
  nowMs: number,
) {
  const startMs = Date.parse(plannedStartTime);

  if (!Number.isFinite(startMs)) return false;

  const secondsLeft = (startMs - nowMs) / 1000;

  return (
    secondsLeft <= FEGISEN_LOCK_WINDOW_OPENS_SECONDS &&
    secondsLeft >= FEGISEN_LOCK_WINDOW_CLOSES_SECONDS
  );
}

export function evaluateFegisen(args: {
  startMethod: string | null | undefined;
  isMonte: boolean;
  isGallop?: boolean;
  runners: WinPlaceRunnerInput[];
  hasFreshCurrentOddsPoint?: boolean;
}): FegisenEvaluation {
  const {
    startMethod,
    isMonte,
    isGallop = false,
    runners,
    hasFreshCurrentOddsPoint = true,
  } = args;

  const activeStarters =
    runners.filter((runner) => !runner.scratched).length;

  const reject = (
    reason: string,
    active = false,
    favorite: WinPlaceCandidate | null = null,
  ): FegisenEvaluation => ({
    active,
    candidate: null,
    favorite,
    activeStarters,
    excludedReason: reason,
  });

  if (isGallop) return reject("Galopplopp");

  if (isMonte) return reject("Montélopp");

  if (!/auto/i.test(startMethod ?? "")) {
    return reject("Inte autostart");
  }

  if (
    runners.length < FEGISEN_MIN_STARTERS ||
    runners.length > FEGISEN_MAX_STARTERS
  ) {
    return reject("Kräver 10–12 hästar");
  }

  if (runners.some((runner) => runner.scratched)) {
    return reject("Struken häst finns vid lås");
  }

  if (!hasFreshCurrentOddsPoint) {
    return reject("Aktuell oddspunkt saknas", true);
  }

  const favorite = findFavorite(runners);

  if (!favorite) {
    return reject("Favorit kan inte utses säkert", true);
  }

  if (
    favorite.currentWinOdds < FEGISEN_MIN_WIN_ODDS ||
    favorite.currentWinOdds >= FEGISEN_MAX_WIN_ODDS_EXCLUSIVE
  ) {
    return reject(
      "Favoritens odds är inte 2,00–2,99",
      true,
      favorite,
    );
  }

  return {
    active: true,
    candidate: favorite,
    favorite,
    activeStarters,
    excludedReason: null,
  };
}
