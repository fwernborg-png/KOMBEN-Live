import type {
  WinPlaceCandidate,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";

export const ENSAMVARGEN_RULE_VERSION = "ENSAMVARGEN_V1.0";

export const ENSAMVARGEN_STRATEGY_CODE = "ENSAMVARGEN";

export const ENSAMVARGEN_STAKE_SEK = 100;

export const ENSAMVARGEN_PROSPECTIVE_START_DATE = "2026-08-10";

export const ENSAMVARGEN_LOCK_TARGET_SECONDS = 90;
export const ENSAMVARGEN_LOCK_WINDOW_OPENS_SECONDS = 120;
export const ENSAMVARGEN_LOCK_WINDOW_CLOSES_SECONDS = 60;

export const ENSAMVARGEN_MIN_DROP_PERCENT_INCLUSIVE = 5;
export const ENSAMVARGEN_MAX_DROP_PERCENT_EXCLUSIVE = 10;
export const ENSAMVARGEN_MIN_LOCK_ODDS_INCLUSIVE = 6;

export const ENSAMVARGEN_MIN_VALID_ODDS_POINTS = 2;

const COLLECTION_MINUTES = 60;

export type EnsamvargenEvaluation = {
  active: boolean;
  candidate: WinPlaceCandidate | null;
  qualifyingCandidates: WinPlaceCandidate[];
  activeStarters: number;
  excludedReason: string | null;
};

function isValidOdds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 200 &&
    Math.abs(value - 99.99) >= 0.001
  );
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  if (!Number.isFinite(average) || average <= 0) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;

  return (Math.sqrt(variance) / average) * 100;
}

function isCancelled(raceStatus: string | null | undefined) {
  return /install|inst[äa]lld|inst[äa]llt|cancel/i.test(raceStatus ?? "");
}

function buildCandidates(args: {
  runners: WinPlaceRunnerInput[];
  plannedStartTime: string;
  nowMs: number;
}) {
  const { runners, plannedStartTime, nowMs } = args;

  const startMs = Date.parse(plannedStartTime);

  const collectionStartMs = startMs - COLLECTION_MINUTES * 60_000;

  const activeRunners = runners.filter((runner) => !runner.scratched);

  const candidates = activeRunners
    .map((runner): WinPlaceCandidate | null => {
      const history = runner.oddsHistory
        .filter(
          (point) =>
            point.timestamp >= collectionStartMs &&
            point.timestamp <= nowMs &&
            isValidOdds(point.odds),
        )
        .sort((a, b) => a.timestamp - b.timestamp);

      if (history.length < ENSAMVARGEN_MIN_VALID_ODDS_POINTS) {
        return null;
      }

      const startOdds = history[0]?.odds ?? null;

      const currentWinOdds = history[history.length - 1]?.odds ?? null;

      if (!isValidOdds(startOdds) || !isValidOdds(currentWinOdds)) {
        return null;
      }

      const cvRaw = coefficientOfVariation(history.map((point) => point.odds));

      if (cvRaw === null) {
        return null;
      }

      const oddsDropPercent = ((startOdds - currentWinOdds) / startOdds) * 100;

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
    })
    .filter((candidate): candidate is WinPlaceCandidate => candidate !== null);

  return {
    activeRunners,
    candidates,
  };
}

export function isEnsamvargenProspectiveDate(raceDate: string) {
  return raceDate >= ENSAMVARGEN_PROSPECTIVE_START_DATE;
}

export function isInEnsamvargenSignalWindow(
  plannedStartTime: string,
  nowMs: number,
) {
  const startMs = Date.parse(plannedStartTime);

  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  const remainingSeconds = (startMs - nowMs) / 1_000;

  return (
    remainingSeconds <= ENSAMVARGEN_LOCK_WINDOW_OPENS_SECONDS &&
    remainingSeconds >= ENSAMVARGEN_LOCK_WINDOW_CLOSES_SECONDS
  );
}

export function evaluateEnsamvargen(args: {
  raceDate: string;
  plannedStartTime: string;
  raceStatus?: string | null;
  isMonte: boolean;
  runners: WinPlaceRunnerInput[];
  nowMs: number;
  hasFreshCurrentOddsPoint?: boolean;
}): EnsamvargenEvaluation {
  const {
    raceDate,
    plannedStartTime,
    raceStatus,
    isMonte,
    runners,
    nowMs,
    hasFreshCurrentOddsPoint = true,
  } = args;

  const activeStarters = runners.filter((runner) => !runner.scratched).length;

  if (!isEnsamvargenProspectiveDate(raceDate)) {
    return {
      active: false,
      candidate: null,
      qualifyingCandidates: [],
      activeStarters,
      excludedReason: "Före Ensamvargens prospektiva startdatum",
    };
  }

  if (isMonte || isCancelled(raceStatus)) {
    return {
      active: false,
      candidate: null,
      qualifyingCandidates: [],
      activeStarters,
      excludedReason: "Inte giltigt lopp",
    };
  }

  if (!hasFreshCurrentOddsPoint) {
    return {
      active: true,
      candidate: null,
      qualifyingCandidates: [],
      activeStarters,
      excludedReason: "Aktuell oddspunkt saknas",
    };
  }

  const { activeRunners, candidates } = buildCandidates({
    runners,
    plannedStartTime,
    nowMs,
  });

  /*
   * Eftersom regeln kräver EXAKT EN häst
   * inom intervallet måste samtliga aktiva
   * hästar kunna bedömas.
   */
  if (candidates.length !== activeRunners.length) {
    return {
      active: true,
      candidate: null,
      qualifyingCandidates: [],
      activeStarters,
      excludedReason: "Otillräcklig oddshistorik för hela startfältet",
    };
  }

  const qualifyingCandidates = candidates.filter(
    (candidate) =>
      candidate.oddsDropPercent + 1e-9 >=
        ENSAMVARGEN_MIN_DROP_PERCENT_INCLUSIVE &&
      candidate.oddsDropPercent < ENSAMVARGEN_MAX_DROP_PERCENT_EXCLUSIVE - 1e-9,
  );

  if (qualifyingCandidates.length !== 1) {
    return {
      active: true,
      candidate: null,
      qualifyingCandidates,
      activeStarters,
      excludedReason: `Exakt en häst måste vara sänkt 5,00–9,99 %, hittade ${qualifyingCandidates.length}`,
    };
  }

  const candidate = qualifyingCandidates[0];

  if (candidate.currentWinOdds + 1e-9 < ENSAMVARGEN_MIN_LOCK_ODDS_INCLUSIVE) {
    return {
      active: true,
      candidate: null,
      qualifyingCandidates,
      activeStarters,
      excludedReason: `Låsoddset ${candidate.currentWinOdds.toFixed(2)} är under 6,00`,
    };
  }

  return {
    active: true,
    candidate,
    qualifyingCandidates,
    activeStarters,
    excludedReason: null,
  };
}
