import type { PlaceEvaluation, PlaceBet } from "./types";

export type LiveSignalMode =
  | "PRELIM_WATCH"
  | "LOCKED_PLAY"
  | "NO_PLAY"
  | "INSUFFICIENT_DATA"
  | "LOCK_TIME_PASSED";

export type LiveSignalState = {
  mode: LiveSignalMode;
  title: string;
  statusText: string;
  highlightedRunnerNumber: number | null;
  evaluatedRunnerNumber: number | null;
};

export function deriveLiveSignalState(args: {
  nowMs: number;
  lockTimeMs: number | null;
  preview: PlaceEvaluation | null;
  lockedEvaluation: PlaceEvaluation | null;
  lockedBet: PlaceBet | null;
}): LiveSignalState {
  const { nowMs, lockTimeMs, preview, lockedEvaluation, lockedBet } = args;
  const lockPassed = lockTimeMs !== null && Number.isFinite(lockTimeMs) && nowMs >= lockTimeMs;

  if (lockedEvaluation) {
    const evaluatedRunnerNumber = lockedEvaluation.smoothest?.runnerNumber ?? null;
    if (lockedEvaluation.decision === "PLAY") {
      return {
        mode: "LOCKED_PLAY",
        title: "BÄSTA PLATSHÄST",
        statusText: "LÅST PLATSSPEL",
        highlightedRunnerNumber: lockedBet?.horseNumber ?? evaluatedRunnerNumber,
        evaluatedRunnerNumber,
      };
    }

    if (lockedEvaluation.decision === "INSUFFICIENT_DATA") {
      return {
        mode: "INSUFFICIENT_DATA",
        title: "INGET PLATSSPEL – OTILLRÄCKLIG DATA",
        statusText: "INGET PLATSSPEL",
        highlightedRunnerNumber: null,
        evaluatedRunnerNumber,
      };
    }

    const lockMissed = lockedEvaluation.reasons.some((reason) => reason.includes("LÅSTID PASSERAD"));
    if (lockMissed) {
      return {
        mode: "LOCK_TIME_PASSED",
        title: "INGET PLATSSPEL – LÅSTID PASSERAD",
        statusText: "INGET PLATSSPEL",
        highlightedRunnerNumber: null,
        evaluatedRunnerNumber,
      };
    }

    return {
      mode: "NO_PLAY",
      title: "INGET PLATSSPEL",
      statusText: "INGET PLATSSPEL",
      highlightedRunnerNumber: null,
      evaluatedRunnerNumber,
    };
  }

  if (!preview) {
    return {
      mode: lockPassed ? "LOCK_TIME_PASSED" : "NO_PLAY",
      title: lockPassed ? "INGET PLATSSPEL – LÅSTID PASSERAD" : "INGET PLATSSPEL",
      statusText: "INGET PLATSSPEL",
      highlightedRunnerNumber: null,
      evaluatedRunnerNumber: null,
    };
  }

  const previewRunner = preview.smoothest?.runnerNumber ?? null;

  if (lockPassed) {
    return {
      mode: "LOCK_TIME_PASSED",
      title: "INGET PLATSSPEL – LÅSTID PASSERAD",
      statusText: "INGET PLATSSPEL",
      highlightedRunnerNumber: null,
      evaluatedRunnerNumber: previewRunner,
    };
  }

  if (preview.decision === "PLAY" && previewRunner !== null) {
    return {
      mode: "PRELIM_WATCH",
      title: "PRELIMINÄR PLATSKANDIDAT – BEVAKAR",
      statusText: "BEVAKAS",
      highlightedRunnerNumber: previewRunner,
      evaluatedRunnerNumber: previewRunner,
    };
  }

  if (preview.decision === "INSUFFICIENT_DATA") {
    return {
      mode: "INSUFFICIENT_DATA",
      title: "INGET PLATSSPEL – OTILLRÄCKLIG DATA",
      statusText: "INGET PLATSSPEL",
      highlightedRunnerNumber: null,
      evaluatedRunnerNumber: previewRunner,
    };
  }

  return {
    mode: "NO_PLAY",
    title: "INGET PLATSSPEL",
    statusText: "INGET PLATSSPEL",
    highlightedRunnerNumber: null,
    evaluatedRunnerNumber: previewRunner,
  };
}
