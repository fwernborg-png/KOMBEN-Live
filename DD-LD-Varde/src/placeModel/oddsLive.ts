import type { OddsPoint } from "./types";

const INVALID_ODDS_RAW = new Set([9999]);

export function isValidRawWinOdds(value: number | null): value is number {
  if (value === null) return false;
  if (!Number.isFinite(value)) return false;
  if (value <= 0) return false;
  if (INVALID_ODDS_RAW.has(Math.round(value))) return false;
  return true;
}

export function calculateOddsDropPercent(firstOddsRaw: number | null, currentOddsRaw: number | null): number | null {
  if (!isValidRawWinOdds(firstOddsRaw) || !isValidRawWinOdds(currentOddsRaw)) return null;
  return ((firstOddsRaw - currentOddsRaw) / firstOddsRaw) * 100;
}

export function pickFirstOddsRawInCollectionWindow(history: OddsPoint[]): number | null {
  if (!history.length) return null;
  const first = history[0]?.odds;
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

export function hasT60Coverage(args: {
  history: OddsPoint[];
  raceStartMs: number;
  toleranceMs?: number;
}) {
  const { history, raceStartMs, toleranceMs = 2 * 60_000 } = args;
  if (!Number.isFinite(raceStartMs)) return false;
  if (!history.length) return false;

  const collectionStartMs = raceStartMs - 60 * 60_000;
  const firstTs = history[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  return firstTs <= collectionStartMs + toleranceMs;
}

export function formatDropPercent(value: number | null): string {
  if (value === null) return "–";
  if (Math.abs(value) < 0.05) return "0,0 %";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")} %`;
}
