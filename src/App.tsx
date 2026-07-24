import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "./lib/supabase";

type Track = {
  id: number;
  name: string;
  startTime?: string;
  products: string[];
  countryCode: "SE" | "FR";
};

type CalendarResponse = {
  tracks?: unknown[];
};

type RunnerStats = {
  earningsPerStart: number | null;
  winPercent: number | null;
  driverWinPercent: number | null;
  startPoints: number | null;
  gallopPercent: number | null;
};

type Runner = {
  number: number;
  horseId: number | null;
  name: string;
  driver: string;
  odds: number | null;
  scratched: boolean;
  stats: RunnerStats;
};

type Race = {
  raceNumber: number;
  id: string;
  startTime?: string;
  status?: string;
  runners: Runner[];
  isMonte: boolean;
  isP21: boolean;
  finishOrder: number[];
};

type OddsPoint = {
  odds: number;
  timestamp: number;
};

type OddsHistory = Record<string, OddsPoint[]>;

type SavedBet = {
  id: string;
  date: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  a1Number: number;
  a1Name: string;
  a2Number: number;
  a2Name: string;
  firstNumber: number;
  secondNumber: number;
  comboOdds: number | null;
  hit: boolean;
  winningOrder: "A1-A2" | "A2-A1" | "MISS";
  stake: number;
  returnAmount: number;
  net: number;
  lockedAt: string;
  savedAt: string;
  automatic?: boolean;
  needsComboOdds?: boolean;
};

const BETS_STORAGE_KEY = "komben-live-bets-v1";
const ODDS_STORAGE_KEY = "komben-live-odds-history-v1";
const AUTO_SELECTIONS_STORAGE_KEY = "komben-live-auto-selections-v1";
const TRACK_RACE_SELECTIONS_STORAGE_KEY = "komben-live-track-race-selections-v1";
const ALL_RACES_REFRESH_SECONDS = 60;
const MAX_HISTORY_POINTS = 720;

type AutoSelection = {
  raceId: string;
  raceNumber: number;
  a1: TrendRunner;
  a2: TrendRunner;
  lockedAt: string;
};

type ModelBreakdown = {
  totalMovement: number;
  persistence: number;
  recentDevelopment: number;
  marketPicture: number;
  favoriteDevelopment: number;
  currentOddsLevel: number;
  dataQuality: number;
};

type TrendRunner = Runner & {
  firstOdds: number | null;
  previousOdds: number | null;
  changePercent: number | null;
  latestAbsoluteChange: number | null;
  direction: "down" | "up" | "same";
  recentOdds: number[];
  historyOdds: number[];
  samples: number;
  momentum: string;
  modelScore?: number;
  modelQualified?: boolean;
  modelBreakdown?: ModelBreakdown;
  modelReasons?: string[];
};

type StablePressureAnalysis = {
  qualifies: boolean;
  score: number;
  firstOdds: number | null;
  currentOdds: number | null;
  totalDropPercent: number;
  measurementCount: number;
  observedMinutes: number;
  totalSteps: number;
  downwardSteps: number;
  unchangedSteps: number;
  upwardSteps: number;
  downwardStepRatio: number;
  controlledStepRatio: number;
  upwardMovementRatio: number;
  largestSingleRisePercent: number;
  last15ChangePercent: number | null;
  last5ChangePercent: number | null;
};

type StablePressureCandidate = {
  runner: TrendRunner;
  analysis: StablePressureAnalysis;
};

type UnknownRecord = Record<string, unknown>;
type RacesByTrack = Record<number, Race[]>;
type MeetingRaceRef = {
  raceNumber: number;
  raceId: string | null;
  startTime?: string;
};
type MeetingRacesByTrack = Record<number, MeetingRaceRef[]>;
type AppTab = "overview" | "race" | "journal" | "stats";
type StatKey = "KR" | "ST" | "K" | "SP" | "G" | "ODD";
type StatDefinition = {
  key: StatKey;
  shortLabel: string;
  label: string;
  best: "high" | "low";
};
type RunnerIndicator = {
  key: StatKey;
  label: string;
  shortLabel: string;
  value: number | null;
  rank: number | null;
  available: number;
  positive: boolean;
  tooltip: string;
};
type RunnerInsights = {
  consistency: number | null;
  strength: number;
  indicators: RunnerIndicator[];
};
type RaceInsights = {
  byRunner: Record<number, RunnerInsights>;
  smoothest: TrendRunner | null;
  biggestDrop: TrendRunner | null;
};

const API = import.meta.env.DEV
  ? "/atg-api"
  : "https://www.atg.se/services/racinginfo/v1/api";
const REFRESH_SECONDS = 60;
const FETCH_TIMEOUT_MS = 12000;
const FETCH_RETRY_ATTEMPTS = 1;
const TARGET_PRODUCTS = ["V4", "V64", "V65", "V85", "V86"] as const;

const APP_TABS: Array<{ id: AppTab; label: string }> = [
  { id: "overview", label: "Oversikt" },
  { id: "race", label: "Lopp" },
  { id: "journal", label: "Speljournal" },
  { id: "stats", label: "Statistik" },
];

const STAT_DEFINITIONS: StatDefinition[] = [
  { key: "KR", shortLabel: "KR", label: "Kronor per start", best: "high" },
  { key: "ST", shortLabel: "ST", label: "Segerprocent", best: "high" },
  { key: "K", shortLabel: "K", label: "Kuskprocent", best: "high" },
  { key: "SP", shortLabel: "SP", label: "Startpoang", best: "high" },
  { key: "G", shortLabel: "G", label: "Galopp", best: "low" },
  { key: "ODD", shortLabel: "ODD", label: "Oddsmodell", best: "high" },
];


const STABLE_PRESSURE_SETTINGS = {
  minimumMeasurements: 4,
  minimumObservedMinutes: 3,
  minimumTotalDropPercent: 8,
  minimumControlledStepRatio: 0.8,
  minimumDownwardStepRatio: 0.3,
  toleratedSmallRisePercent: 0.75,
  maximumSingleRisePercent: 4,
  maximumUpwardMovementRatio: 0.35,
  maximumLast15RisePercent: 1.5,
  maximumLast5RisePercent: 1.5,
} as const;

const SWEDISH_TRACK_NAMES = new Set(
  [
    "arvika",
    "axevalla",
    "bergsaker",
    "boden",
    "bollnas",
    "dannero",
    "eskilstuna",
    "farjestad",
    "gavle",
    "hagmyren",
    "halmstad",
    "hoting",
    "jagersro",
    "kalmar",
    "karlshamn",
    "lindesberg",
    "lycksele",
    "mantorp",
    "rattvik",
    "romme",
    "skelleftea",
    "solanget",
    "solvalla",
    "tingsryd",
    "umaker",
    "vaggeryd",
    "visby",
    "aby",
    "amal",
    "arjang",
    "orebro",
    "ostersund",
  ].map((name) => name.toLowerCase()),
);

function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatTime(value?: string) {
  if (!value) return "–";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";

  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, "").replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percentValue(value: unknown) {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  if (parsed > 0 && parsed <= 1) return parsed * 100;
  // ATG skickar ofta procent som basispunkter, t.ex. 1249 = 12,49 %.
  if (parsed > 100) return parsed / 100;
  return parsed;
}

function firstNumeric(value: unknown, paths: string[][], parser: (raw: unknown) => number | null = asNumber) {
  for (const path of paths) {
    let current: unknown = value;
    for (const key of path) {
      if (!isRecord(current)) {
        current = null;
        break;
      }
      current = current[key];
    }
    const parsed = parser(current);
    if (parsed !== null) return parsed;
  }
  return null;
}

function latestYearNumeric(
  yearsValue: unknown,
  paths: string[][],
  parser: (raw: unknown) => number | null = asNumber,
) {
  if (!isRecord(yearsValue)) return null;

  const yearEntries = Object.entries(yearsValue)
    .filter(([key, value]) => /^\d{4}$/.test(key) && isRecord(value))
    .sort((a, b) => Number(b[0]) - Number(a[0]));

  for (const [, yearRecord] of yearEntries) {
    const parsed = firstNumeric(yearRecord, paths, parser);
    if (parsed !== null) return parsed;
  }

  return null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((item) => collectStrings(item, depth + 1));
}

function extractTargetProducts(value: unknown) {
  const text = collectStrings(value).join(" ").toUpperCase();
  return TARGET_PRODUCTS.filter((product) =>
    new RegExp(`(^|[^A-Z0-9])${product}([^A-Z0-9]|$)`).test(text),
  );
}

function isSwedishTrackName(name: string) {
  return SWEDISH_TRACK_NAMES.has(normalizeText(name));
}

function parseCountryCode(value: unknown): "SE" | "FR" | null {
  const country = normalizeText(
    asString((value as UnknownRecord)?.countryCode) ||
      asString((value as UnknownRecord)?.country) ||
      asString((value as UnknownRecord)?.nation),
  );

  if (country === "se" || country === "swe" || country === "sweden" || country === "sverige") {
    return "SE";
  }

  if (country === "fr" || country === "fra" || country === "france" || country === "frankrike") {
    return "FR";
  }

  return null;
}

function parseTrack(value: unknown): Track | null {
  if (!isRecord(value)) return null;

  const id =
    asNumber(value.id) ??
    asNumber(value.trackId) ??
    asNumber(value.number);
  const name =
    asString(value.name) ||
    asString(value.trackName) ||
    asString(value.displayName);
  if (id === null || !name) return null;

  const startTime =
    asString(value.startTime) ||
    asString(value.firstStartTime) ||
    asString(value.firstRaceStartTime);
  const products = extractTargetProducts(value);
  const parsedCountry = parseCountryCode(value);
  const isSwedish = parsedCountry === "SE" || isSwedishTrackName(name);
  if (!isSwedish) return null;

  return { id, name, startTime, products, countryCode: "SE" };
}

function parseMeetingRaceRefs(trackValue: unknown): MeetingRaceRef[] {
  if (!isRecord(trackValue)) return [];
  const raceCandidates = [
    ...getArray(trackValue, "races"),
    ...getArray(trackValue, "starts"),
    ...getArray(trackValue, "raceSummaries"),
  ];

  const refs = raceCandidates
    .map((race) => {
      if (!isRecord(race)) return null;

      const raceId = asString(race.id) || asString(race.raceId) || null;
      const raceNumber =
        asNumber(race.number) ??
        asNumber(race.raceNumber) ??
        (raceId
          ? Number((raceId.match(/(?:_|-)(\d{1,2})$/)?.[1] ?? ""))
          : null);

      if (!raceNumber || !Number.isFinite(raceNumber) || raceNumber <= 0) return null;

      return {
        raceNumber,
        raceId,
        startTime:
          asString(race.startTime) ||
          asString(race.scheduledStartTime) ||
          asString(race.postTime) ||
          undefined,
      } as MeetingRaceRef;
    })
    .filter((ref): ref is MeetingRaceRef => ref !== null)
    .sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return a.raceNumber - b.raceNumber;
    });

  const uniqueByNumber = new Map<number, MeetingRaceRef>();
  for (const ref of refs) {
    if (!uniqueByNumber.has(ref.raceNumber)) {
      uniqueByNumber.set(ref.raceNumber, ref);
    }
  }
  return [...uniqueByNumber.values()];
}

function getRecord(value: unknown, key: string): UnknownRecord | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return [];
  const child = value[key];
  return Array.isArray(child) ? child : [];
}

function formatOdds(rawOdds: number | null) {
  if (rawOdds === null || rawOdds <= 0) return "–";
  return (rawOdds / 100).toFixed(2).replace(".", ",");
}

function runnerKey(raceId: string, runnerNumber: number) {
  return `${raceId}:${runnerNumber}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function appendMinuteSnapshot(
  history: OddsPoint[],
  odds: number,
  timestamp: number,
) {
  const last = history[history.length - 1];
  // En datapunkt per minut, även när oddset står still. Det gör jämnheten mätbar.
  if (last && timestamp - last.timestamp < 55_000) return history;
  return [...history, { odds, timestamp }].slice(-MAX_HISTORY_POINTS);
}

function raceCollectionWindow(startTime?: string) {
  if (!startTime) return null;
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) return null;
  return { startMs, collectionStartMs: startMs - 60 * 60_000 };
}

function shouldCollectOdds(startTime: string | undefined, timestamp: number) {
  const window = raceCollectionWindow(startTime);
  if (!window) return false;
  return timestamp >= window.collectionStartMs && timestamp < window.startMs;
}

function historyInsideLastHour(history: OddsPoint[], startTime?: string) {
  const window = raceCollectionWindow(startTime);
  if (!window) return [];
  return history.filter(
    (point) =>
      point.timestamp >= window.collectionStartMs &&
      point.timestamp < window.startMs,
  );
}

function percentChange(first: number | null, current: number | null) {
  if (!first || !current || first <= 0) return null;
  return ((current - first) / first) * 100;
}

function absoluteOddsChange(previous: number | null, current: number | null) {
  if (previous === null || current === null) return null;
  return (current - previous) / 100;
}


function totalTrendColor(changePercent: number | null) {
  if (changePercent === null || Math.abs(changePercent) < 0.05) return "#f8fafc";
  return changePercent < 0 ? "#4ade80" : "#fb7185";
}

function totalTrendArrow(changePercent: number | null) {
  if (changePercent === null || Math.abs(changePercent) < 0.05) return "→";
  return changePercent < 0 ? "↓" : "↑";
}

function trendStrengthLabel(changePercent: number | null) {
  if (changePercent === null || Math.abs(changePercent) < 0.05) return "STABIL";
  const strength = Math.abs(changePercent);
  const direction = changePercent < 0 ? "STÄRKS" : "TAPPAR";
  if (strength >= 30) return `${direction} MYCKET`;
  if (strength >= 15) return `${direction} TYDLIGT`;
  return direction;
}

function momentumDisplay(momentum: string) {
  if (momentum === "Starkt ned") return "Stärks starkt kortsiktigt";
  if (momentum === "Ned") return "Stärks kortsiktigt";
  if (momentum === "Starkt upp") return "Tappar starkt kortsiktigt";
  if (momentum === "Upp") return "Tappar kortsiktigt";
  return momentum;
}

function momentumLabel(history: OddsPoint[]) {
  if (history.length < 3) return "För lite data";

  const recent = history.slice(-5);
  let down = 0;
  let up = 0;

  for (let i = 1; i < recent.length; i += 1) {
    if (recent[i].odds < recent[i - 1].odds) down += 1;
    if (recent[i].odds > recent[i - 1].odds) up += 1;
  }

  if (down >= 3 && down > up) return "Starkt ned";
  if (down === 2 && down > up) return "Ned";
  if (up >= 3 && up > down) return "Starkt upp";
  if (up === 2 && up > down) return "Upp";
  return "Stabil";
}

function checkpointOdds(
  history: OddsPoint[],
  raceStartTime: string | undefined,
  minutesBefore: number,
) {
  const window = raceCollectionWindow(raceStartTime);
  if (!window || !history.length) return null;

  const targetMs = window.startMs - minutesBefore * 60_000;
  if (Date.now() < targetMs) return null;

  // För 60-minutersoddset används den första mätningen vid eller strax efter
  // kontrollpunkten. Den punkten ändras aldrig när nya odds kommer in.
  const toleranceMs = minutesBefore === 60 ? 2 * 60_000 : 4 * 60_000;
  const point = history.find(
    (item) =>
      item.timestamp >= targetMs &&
      item.timestamp <= targetMs + toleranceMs,
  );

  return point?.odds ?? null;
}


function oddsStepChangePercent(previousOdds: number, currentOdds: number) {
  if (previousOdds <= 0) return 0;
  return ((currentOdds - previousOdds) / previousOdds) * 100;
}

function periodOddsChangePercent(
  history: OddsPoint[],
  raceStartTime: string | undefined,
  maximumMinutesBefore: number,
) {
  const window = raceCollectionWindow(raceStartTime);
  if (!window) return null;

  const periodStartMs = window.startMs - maximumMinutesBefore * 60_000;
  const points = history.filter(
    (point) => point.timestamp >= periodStartMs && point.timestamp < window.startMs,
  );

  if (points.length < 2) return null;
  return oddsStepChangePercent(points[0].odds, points[points.length - 1].odds);
}

function analyzeStablePressure(
  history: OddsPoint[],
  raceStartTime: string | undefined,
): StablePressureAnalysis {
  const settings = STABLE_PRESSURE_SETTINGS;
  const sortedHistory = [...history]
    .filter(
      (point) =>
        Number.isFinite(point.odds) &&
        point.odds > 0 &&
        Number.isFinite(point.timestamp),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const empty: StablePressureAnalysis = {
    qualifies: false,
    score: 0,
    firstOdds: sortedHistory[0]?.odds ?? null,
    currentOdds: sortedHistory[sortedHistory.length - 1]?.odds ?? null,
    totalDropPercent: 0,
    measurementCount: sortedHistory.length,
    observedMinutes: 0,
    totalSteps: Math.max(0, sortedHistory.length - 1),
    downwardSteps: 0,
    unchangedSteps: 0,
    upwardSteps: 0,
    downwardStepRatio: 0,
    controlledStepRatio: 0,
    upwardMovementRatio: 1,
    largestSingleRisePercent: 0,
    last15ChangePercent: null,
    last5ChangePercent: null,
  };

  if (sortedHistory.length < 2) return empty;

  const firstOdds = sortedHistory[0].odds;
  const currentOdds = sortedHistory[sortedHistory.length - 1].odds;
  const observedMinutes =
    (sortedHistory[sortedHistory.length - 1].timestamp - sortedHistory[0].timestamp) /
    60_000;
  const totalDropPercent = ((firstOdds - currentOdds) / firstOdds) * 100;

  let downwardSteps = 0;
  let unchangedSteps = 0;
  let upwardSteps = 0;
  let controlledSteps = 0;
  let totalDownwardMovement = 0;
  let totalUpwardMovement = 0;
  let largestSingleRisePercent = 0;

  for (let index = 1; index < sortedHistory.length; index += 1) {
    const change = oddsStepChangePercent(
      sortedHistory[index - 1].odds,
      sortedHistory[index].odds,
    );

    if (change < -0.001) {
      downwardSteps += 1;
      totalDownwardMovement += Math.abs(change);
    } else if (change > 0.001) {
      upwardSteps += 1;
      totalUpwardMovement += change;
      largestSingleRisePercent = Math.max(largestSingleRisePercent, change);
    } else {
      unchangedSteps += 1;
    }

    if (change <= settings.toleratedSmallRisePercent) controlledSteps += 1;
  }

  const totalSteps = sortedHistory.length - 1;
  const downwardStepRatio = downwardSteps / totalSteps;
  const controlledStepRatio = controlledSteps / totalSteps;
  const totalMovement = totalDownwardMovement + totalUpwardMovement;
  const upwardMovementRatio =
    totalMovement > 0 ? totalUpwardMovement / totalMovement : 1;
  const last15ChangePercent = periodOddsChangePercent(
    sortedHistory,
    raceStartTime,
    15,
  );
  const last5ChangePercent = periodOddsChangePercent(
    sortedHistory,
    raceStartTime,
    5,
  );

  const last15IsControlled =
    last15ChangePercent === null ||
    last15ChangePercent <= settings.maximumLast15RisePercent;
  const last5IsControlled =
    last5ChangePercent === null ||
    last5ChangePercent <= settings.maximumLast5RisePercent;

  const qualifies =
    sortedHistory.length >= settings.minimumMeasurements &&
    observedMinutes >= settings.minimumObservedMinutes &&
    totalDropPercent >= settings.minimumTotalDropPercent &&
    controlledStepRatio >= settings.minimumControlledStepRatio &&
    downwardStepRatio >= settings.minimumDownwardStepRatio &&
    largestSingleRisePercent <= settings.maximumSingleRisePercent &&
    upwardMovementRatio <= settings.maximumUpwardMovementRatio &&
    last15IsControlled &&
    last5IsControlled;

  const score =
    totalDropPercent * 2.5 +
    controlledStepRatio * 40 +
    downwardStepRatio * 20 -
    largestSingleRisePercent * 5 -
    upwardMovementRatio * 30 -
    Math.max(0, last15ChangePercent ?? 0) * 4 -
    Math.max(0, last5ChangePercent ?? 0) * 5;

  return {
    qualifies,
    score,
    firstOdds,
    currentOdds,
    totalDropPercent,
    measurementCount: sortedHistory.length,
    observedMinutes,
    totalSteps,
    downwardSteps,
    unchangedSteps,
    upwardSteps,
    downwardStepRatio,
    controlledStepRatio,
    upwardMovementRatio,
    largestSingleRisePercent,
    last15ChangePercent,
    last5ChangePercent,
  };
}

function findBestStablePressureHorse(
  race: Race,
  runners: TrendRunner[],
  oddsHistory: OddsHistory,
): StablePressureCandidate | null {
  const candidates = runners
    .filter((runner) => !runner.scratched && runner.odds !== null && runner.odds > 0)
    .map((runner) => {
      const storedHistory = oddsHistory[runnerKey(race.id, runner.number)] ?? [];
      const history = historyInsideLastHour(storedHistory, race.startTime);
      return {
        runner,
        analysis: analyzeStablePressure(history, race.startTime),
      };
    })
    .filter((candidate) => candidate.analysis.qualifies)
    .sort((a, b) => {
      const scoreDifference = b.analysis.score - a.analysis.score;
      if (scoreDifference !== 0) return scoreDifference;
      return b.analysis.totalDropPercent - a.analysis.totalDropPercent;
    });

  return candidates[0] ?? null;
}

function formatPercent(value: number | null) {
  if (value === null || Math.abs(value) < 0.05) return "0,0 %";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")} %`;
}

function formatClockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatStatValue(key: StatKey, value: number | null) {
  if (value === null) return "Saknas";
  if (key === "KR") return `${value.toFixed(0).replace(".", ",")} kr`;
  if (key === "ST" || key === "K" || key === "G") return `${value.toFixed(1).replace(".", ",")} %`;
  if (key === "ODD") return `${value.toFixed(0)} p`;
  return value.toFixed(1).replace(".", ",");
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function consistencyValue(historyOdds: number[]) {
  if (historyOdds.length < 3) return null;
  const avg = mean(historyOdds);
  if (!avg) return null;
  return (standardDeviation(historyOdds) / avg) * 100;
}

function runnerOddsSignal(runner: TrendRunner) {
  if (runner.modelScore !== undefined) return runner.modelScore;
  if (runner.changePercent === null) return null;
  return -runner.changePercent;
}

function buildRaceInsights(runners: TrendRunner[]) {
  const activeRunners = runners.filter((runner) => !runner.scratched);
  const valuesByKey = new Map<StatKey, Array<{ runnerNumber: number; value: number }>>();

  for (const definition of STAT_DEFINITIONS) {
    const entries = activeRunners
      .map((runner) => {
        const value =
          definition.key === "KR"
            ? runner.stats.earningsPerStart
            : definition.key === "ST"
              ? runner.stats.winPercent
              : definition.key === "K"
                ? runner.stats.driverWinPercent
                : definition.key === "SP"
                  ? runner.stats.startPoints
                  : definition.key === "G"
                    ? runner.stats.gallopPercent
                    : runnerOddsSignal(runner);
        return value === null ? null : { runnerNumber: runner.number, value };
      })
      .filter((entry): entry is { runnerNumber: number; value: number } => entry !== null)
      .sort((a, b) => definition.best === "low" ? a.value - b.value : b.value - a.value);

    valuesByKey.set(definition.key, entries);
  }

  const byRunner: Record<number, RunnerInsights> = {};
  for (const runner of activeRunners) {
    const indicators = STAT_DEFINITIONS.map((definition) => {
      const ranking = valuesByKey.get(definition.key) ?? [];
      const matchIndex = ranking.findIndex((entry) => entry.runnerNumber === runner.number);
      const rank = matchIndex >= 0 ? matchIndex + 1 : null;
      const value =
        definition.key === "KR"
          ? runner.stats.earningsPerStart
          : definition.key === "ST"
            ? runner.stats.winPercent
            : definition.key === "K"
              ? runner.stats.driverWinPercent
              : definition.key === "SP"
                ? runner.stats.startPoints
                : definition.key === "G"
                  ? runner.stats.gallopPercent
                  : runnerOddsSignal(runner);
      const available = ranking.length;
      const positive = rank !== null && rank <= 4;
      const tooltip = value === null
        ? `${definition.label}: saknas`
        : `${definition.label}: ${formatStatValue(definition.key, value)}\nRankad ${rank} av ${available}${definition.key === "G" ? ", dar lagst varde ar bast" : ""}`;

      return {
        key: definition.key,
        label: definition.label,
        shortLabel: definition.shortLabel,
        value,
        rank,
        available,
        positive,
        tooltip,
      } satisfies RunnerIndicator;
    });

    byRunner[runner.number] = {
      consistency: consistencyValue(runner.historyOdds),
      strength: indicators.filter((indicator) => indicator.positive).length,
      indicators,
    };
  }

  const smoothest = [...activeRunners]
    .filter((runner) => byRunner[runner.number]?.consistency !== null)
    .sort((a, b) => (byRunner[a.number]?.consistency ?? Number.POSITIVE_INFINITY) - (byRunner[b.number]?.consistency ?? Number.POSITIVE_INFINITY))[0] ?? null;
  const biggestDrop = [...activeRunners]
    .filter((runner) => runner.changePercent !== null)
    .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))[0] ?? null;

  return {
    byRunner,
    smoothest,
    biggestDrop,
  } satisfies RaceInsights;
}

function sparklinePoints(values: number[], width = 96, height = 24) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function parseDriver(start: UnknownRecord) {
  const driver = getRecord(start, "driver");
  if (!driver) return "–";

  const shortName = asString(driver.shortName);
  if (shortName) return shortName;

  return [asString(driver.firstName), asString(driver.lastName)]
    .filter(Boolean)
    .join(" ") || "–";
}

function extractRunnerStats(start: UnknownRecord): RunnerStats {
  const horse = getRecord(start, "horse");
  const driver = getRecord(start, "driver");
  const horseStatistics = getRecord(horse, "statistics");
  const horseLife = getRecord(horseStatistics, "life");
  const horseYears = getRecord(horseStatistics, "years");
  const driverStatistics = getRecord(driver, "statistics");
  const driverYears = getRecord(driverStatistics, "years");

  const horseYearWinPercent = latestYearNumeric(horseYears, [["winPercentage"], ["winPercent"]], percentValue);
  const driverYearWinPercent = latestYearNumeric(driverYears, [["winPercentage"], ["winPercent"]], percentValue);

  // Null means the current ATG payload does not expose the field for this runner.
  return {
    earningsPerStart: firstNumeric(start, [
      ["earningsPerStart"],
      ["moneyPerStart"],
      ["statistics", "earningsPerStart"],
      ["statistics", "moneyPerStart"],
      ["horse", "statistics", "life", "earningsPerStart"],
      ["horse", "statistics", "life", "moneyPerStart"],
      ["horse", "statistics", "earningsPerStart"],
      ["horse", "statistics", "moneyPerStart"],
      ["horse", "life", "earningsPerStart"],
      ["career", "earningsPerStart"],
      ["horse", "career", "earningsPerStart"],
    ]),
    winPercent: firstNumeric(start, [
      ["winPercent"],
      ["winPercentage"],
      ["statistics", "winPercent"],
      ["statistics", "winPercentage"],
      ["horse", "statistics", "life", "winPercent"],
      ["horse", "statistics", "life", "winPercentage"],
      ["horse", "statistics", "winPercent"],
      ["horse", "statistics", "winPercentage"],
      ["career", "winPercent"],
      ["career", "winPercentage"],
    ], percentValue) ??
      firstNumeric(horseLife, [["winPercent"], ["winPercentage"]], percentValue) ??
      horseYearWinPercent,
    driverWinPercent:
      firstNumeric(driver ?? start, [
        ["winPercent"],
        ["winPercentage"],
        ["statistics", "winPercent"],
        ["statistics", "winPercentage"],
        ["career", "winPercentage"],
      ], percentValue) ?? driverYearWinPercent,
    startPoints: firstNumeric(start, [
      ["startPoints"],
      ["startPoang"],
      ["statistics", "startPoints"],
      ["statistics", "startPoang"],
      ["horse", "statistics", "life", "startPoints"],
      ["horse", "statistics", "life", "startPoang"],
      ["horse", "statistics", "startPoints"],
      ["horse", "statistics", "startPoang"],
    ]) ?? firstNumeric(horseLife, [["startPoints"], ["startPoang"]]),
    gallopPercent: firstNumeric(start, [
      ["gallopPercent"],
      ["galoppPercent"],
      ["gallopRate"],
      ["statistics", "gallopPercent"],
      ["statistics", "galoppPercent"],
      ["horse", "statistics", "life", "gallopPercent"],
      ["horse", "statistics", "life", "galoppPercent"],
      ["horse", "statistics", "gallopPercent"],
      ["horse", "statistics", "galoppPercent"],
      ["career", "gallopPercent"],
    ], percentValue),
  };
}

function parseRunner(value: unknown, fallbackNumber: number): Runner | null {
  if (!isRecord(value)) return null;

  const horse = getRecord(value, "horse") ?? value;
  const horseId = asNumber((horse as UnknownRecord).id);
  const number =
    asNumber(value.number) ??
    asNumber(value.startNumber) ??
    asNumber(horse.number) ??
    fallbackNumber;

  const name =
    asString(horse.name) ||
    asString(value.horseName) ||
    asString(value.name) ||
    `Häst ${number}`;

  const pools = getRecord(value, "pools");
  const winnerPool = pools
    ? getRecord(pools, "vinnare") ?? getRecord(pools, "winner") ?? getRecord(pools, "win")
    : undefined;

  const odds =
    (winnerPool ? asNumber(winnerPool.odds) : null) ??
    asNumber(value.odds);

  const scratched =
    value.scratched === true ||
    value.withdrawn === true ||
    asString(value.status).toLowerCase() === "scratched";

  return {
    number,
    horseId,
    name,
    driver: parseDriver(value),
    odds,
    scratched,
    stats: extractRunnerStats(value),
  };
}

async function fetchHorseGallopPercent(horseId: number, signal?: AbortSignal): Promise<number | null> {
  if (!Number.isFinite(horseId) || horseId <= 0) return null;

  try {
    const response = await fetch(`${API}/horses/${horseId}/results`, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as UnknownRecord;
    const records = getArray(payload, "records").filter(isRecord);

    // Qualifier starts are excluded to match competitive race behavior.
    const relevant = records.filter((record) => {
      const race = getRecord(record, "race");
      const raceType = asString(race?.type).toLowerCase();
      return raceType !== "qualifier";
    });

    if (relevant.length < 3) return null;

    const gallopCount = relevant.reduce((sum, record) => {
      const place = asString(record.place).toLowerCase().trim();
      const gallopedFlag = record.galloped === true;
      const gallopByPlace = place === "g" || place === "dg" || place.includes("galopp");
      return sum + (gallopedFlag || gallopByPlace ? 1 : 0);
    }, 0);

    return (gallopCount / relevant.length) * 100;
  } catch {
    return null;
  }
}

function parseFinishPosition(value: unknown) {
  if (!isRecord(value)) return null;
  const result = getRecord(value, "result");
  const position =
    asNumber(value.finishPosition) ??
    asNumber(value.position) ??
    asNumber(value.place) ??
    asNumber(value.rank) ??
    (result ?
      asNumber(result.finishPosition) ??
      asNumber(result.position) ??
      asNumber(result.place) ??
      asNumber(result.rank)
      : null);
  return position && position > 0 ? position : null;
}

function buildTrendRunnersForRace(race: Race, oddsHistory: OddsHistory): TrendRunner[] {
  return race.runners.map((runner) => {
    const storedHistory = oddsHistory[runnerKey(race.id, runner.number)] ?? [];
    const history = historyInsideLastHour(storedHistory, race.startTime);
    // 60 minuter är maxfönstret, inte ett krav.
    // Öppnas appen sent används första tillgängliga mätningen som startvärde.
    const firstOdds = history[0]?.odds ?? null;
    const previousOdds = history.length >= 2 ? history[history.length - 2].odds : runner.odds;
    const currentOdds = runner.odds;
    const changePercent = percentChange(firstOdds, currentOdds);
    const latestAbsoluteChange = absoluteOddsChange(previousOdds, currentOdds);
    let direction: TrendRunner["direction"] = "same";
    if (previousOdds && currentOdds) {
      if (currentOdds < previousOdds) direction = "down";
      if (currentOdds > previousOdds) direction = "up";
    }
    return {
      ...runner,
      firstOdds,
      previousOdds,
      changePercent,
      latestAbsoluteChange,
      direction,
      recentOdds: history.slice(-5).map((point) => point.odds),
      historyOdds: history.map((point) => point.odds),
      samples: history.length,
      momentum: momentumLabel(history),
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function decimalOdds(value: number | null) {
  return value === null ? null : value / 100;
}

function evaluateCandidates(runners: TrendRunner[]) {
  const eligible = runners.filter(
    (runner) =>
      !runner.scratched &&
      runner.odds !== null &&
      runner.changePercent !== null &&
      runner.samples >= 3,
  );

  const favorite = [...eligible].sort(
    (a, b) => (a.odds ?? Number.POSITIVE_INFINITY) - (b.odds ?? Number.POSITIVE_INFINITY),
  )[0] ?? null;
  const marketMedian = median(
    eligible.map((runner) => runner.changePercent ?? 0),
  );

  return eligible.map((runner) => {
    const history = runner.historyOdds;
    const allChanges: number[] = [];
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const current = history[index];
      if (previous > 0) allChanges.push(((current - previous) / previous) * 100);
    }

    const downSteps = allChanges.filter((change) => change < -0.05).length;
    const upSteps = allChanges.filter((change) => change > 0.05).length;
    const stepCount = Math.max(1, allChanges.length);
    const downRatio = downSteps / stepCount;
    const upRatio = upSteps / stepCount;
    const totalChange = runner.changePercent ?? 0;
    const firstDecimal = decimalOdds(runner.firstOdds);
    const currentDecimal = decimalOdds(runner.odds);
    const absoluteDrop =
      firstDecimal !== null && currentDecimal !== null
        ? firstDecimal - currentDecimal
        : 0;

    // 1. Total oddsrörelse: procent och faktisk oddssänkning vägs ihop.
    const totalPercentPoints = clamp((-totalChange / 35) * 22, -12, 22);
    const absolutePoints = clamp((absoluteDrop / 4) * 8, -5, 8);
    const totalMovement = totalPercentPoints + absolutePoints;

    // 2. Uthållighet: flera nedsteg är starkare än ett sent engångshopp.
    const persistence = clamp(
      downRatio * 16 - upRatio * 8 + Math.min(runner.samples, 10) * 0.4,
      0,
      20,
    );

    // 3. Senaste utveckling: de sista stegen får extra vikt och rekyl ger avdrag.
    const weightedRecent = allChanges.reduce((sum, change, index) => {
      const weight = index + 1;
      return sum + -change * weight;
    }, 0);
    const totalWeight = allChanges.reduce((sum, _change, index) => sum + index + 1, 0) || 1;
    const recentAverage = weightedRecent / totalWeight;
    const latestChange = allChanges.length ? allChanges[allChanges.length - 1] : 0;
    const reboundPenalty = latestChange > 1 ? Math.min(latestChange * 2.5, 9) : 0;
    const recentDevelopment = clamp(recentAverage * 3.4 - reboundPenalty + 7, 0, 20);

    // 4. Hela marknadsbilden: bättre än medianen i loppet ger plus.
    const relativeToMarket = marketMedian - totalChange;
    const marketPicture = clamp(5 + relativeToMarket * 0.45, 0, 10);

    // 5. Favoritens utveckling: favoriten väljs inte automatiskt.
    let favoriteDevelopment = 5;
    if (favorite) {
      const favoriteChange = favorite.changePercent ?? 0;
      if (runner.number === favorite.number) {
        favoriteDevelopment = clamp(6 - favoriteChange * 0.35, 0, 10);
      } else if (totalChange < -2 && favoriteChange > 3) {
        favoriteDevelopment = clamp(7 + favoriteChange * 0.25, 0, 10);
      } else if (favoriteChange < -5 && totalChange > -3) {
        favoriteDevelopment = 2;
      } else if (totalChange < favoriteChange - 3) {
        favoriteDevelopment = 7;
      }
    }

    // 6. Aktuell oddsnivå: rörelser runt 3–10 i odds är normalt mest trovärdiga.
    const current = currentDecimal ?? 999;
    let currentOddsLevel = 0;
    if (current >= 3 && current <= 10) currentOddsLevel = 5;
    else if (current >= 1.5 && current <= 15) currentOddsLevel = 3.5;
    else if (current <= 25) currentOddsLevel = 2;
    else if (current <= 50) currentOddsLevel = 0.5;

    // 7. Datakvalitet. ATG-svaret innehåller inte alltid omsättning per lopp,
    // så vi använder inte påhittad omsättningsdata. Fler mätningar ger högre tillit.
    const dataQuality = clamp((runner.samples - 2) * 0.75, 0, 5);

    const rawScore =
      totalMovement +
      persistence +
      recentDevelopment +
      marketPicture +
      favoriteDevelopment +
      currentOddsLevel +
      dataQuality;
    const modelScore = Math.round(clamp(rawScore, 0, 100));

    const reasons: string[] = [];
    if (totalChange <= -15) reasons.push("tydlig total oddssänkning");
    if (downRatio >= 0.6 && downSteps >= 2) reasons.push("uthålligt stöd över flera mätningar");
    if (latestChange < -0.5) reasons.push("fortsatt press nedåt nära start");
    if (latestChange > 1) reasons.push("rekyl uppåt försvagar signalen");
    if (relativeToMarket >= 5) reasons.push("starkare än övriga marknaden");
    if (current > 25) reasons.push("högt odds gör rörelsen känsligare");
    if (runner.samples < 5) reasons.push("begränsat dataunderlag");

    // Kandidaten måste både ha tillräcklig score och faktisk nedgång.
    const modelQualified =
      modelScore >= 52 &&
      totalChange <= -2 &&
      runner.samples >= 4 &&
      latestChange < 4;

    return {
      ...runner,
      modelScore,
      modelQualified,
      modelBreakdown: {
        totalMovement: Math.round(totalMovement),
        persistence: Math.round(persistence),
        recentDevelopment: Math.round(recentDevelopment),
        marketPicture: Math.round(marketPicture),
        favoriteDevelopment: Math.round(favoriteDevelopment),
        currentOddsLevel: Math.round(currentOddsLevel),
        dataQuality: Math.round(dataQuality),
      },
      modelReasons: reasons,
    };
  });
}

function rankCandidates(runners: TrendRunner[]) {
  const evaluated = evaluateCandidates(runners)
    .filter((runner) => runner.modelQualified)
    .sort((a, b) => {
      const scoreDifference = (b.modelScore ?? 0) - (a.modelScore ?? 0);
      if (scoreDifference !== 0) return scoreDifference;
      return (a.changePercent ?? 0) - (b.changePercent ?? 0);
    });

  const a1 = evaluated[0];
  const a2 = evaluated[1];

  if (!a1) return [];
  if (!a2) return [a1];

  // A2 tvingas inte fram. Den ska själv nå gränsen och får inte ligga för långt efter A1.
  if ((a2.modelScore ?? 0) < 52 || (a1.modelScore ?? 0) - (a2.modelScore ?? 0) > 24) {
    return [a1];
  }

  return [a1, a2];
}

function parseRace(data: unknown, requestedRaceNumber: number): Race | null {
  if (!isRecord(data)) return null;

  const races = getArray(data, "races");
  const rawRace = races[0];

  if (!isRecord(rawRace)) return null;

  const raceNumber =
    asNumber(rawRace.number) ??
    asNumber(rawRace.raceNumber) ??
    requestedRaceNumber;

  const rawStarts =
    getArray(rawRace, "starts").length > 0
      ? getArray(rawRace, "starts")
      : getArray(rawRace, "horses");

  const runners = rawStarts
    .map((start, index) => parseRunner(start, index + 1))
    .filter((runner): runner is Runner => runner !== null)
    .sort((a, b) => a.number - b.number);

  const finishOrder = rawStarts
    .map((start, index) => {
      const runner = parseRunner(start, index + 1);
      const position = parseFinishPosition(start);
      return runner && position ? { number: runner.number, position } : null;
    })
    .filter((item): item is { number: number; position: number } => item !== null)
    .sort((a, b) => a.position - b.position)
    .map((item) => item.number);

  const raceText = collectStrings(rawRace).join(" ").toLowerCase();

  return {
    raceNumber,
    id: asString(data.id) || `race-${requestedRaceNumber}`,
    startTime:
      asString(rawRace.startTime) ||
      asString(rawRace.scheduledStartTime) ||
      asString(data.startTime),
    status: asString(data.status) || asString(rawRace.status),
    runners,
    isMonte: /mont[eé]/i.test(raceText),
    isP21: /(^|[^a-z0-9])p21([^a-z0-9]|$)/i.test(raceText),
    finishOrder,
  };
}

export default function App() {
  useEffect(() => {
    console.log("[KOMBEN] APP VERSION DEBUG 1");
  }, []);

  const [dbStatus, setDbStatus] = useState("Testar...");
  useEffect(() => {
  async function testConnection() {
    const { error } = await supabase
      .from("komben_races")
      .select("*")
      .limit(1);

    if (error) {
      setDbStatus("❌ " + error.message);
    } else {
      setDbStatus("✅ Databasen fungerar!");
    }
  }

  testConnection();
}, []);
  const [activeTab, setActiveTab] = useState<AppTab>("race");
  const [date, setDate] = useState(today());
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState("");
  const [races, setRaces] = useState<Race[]>([]);
  const [racesByTrack, setRacesByTrack] = useState<RacesByTrack>({});
  const [meetingRacesByTrack, setMeetingRacesByTrack] = useState<MeetingRacesByTrack>({});
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [secondsToRefresh, setSecondsToRefresh] = useState(REFRESH_SECONDS);
  const [oddsHistory, setOddsHistory] = useState<OddsHistory>({});
  const [savedBets, setSavedBets] = useState<SavedBet[]>([]);
  const [lockedSelection, setLockedSelection] = useState<{
    a1: TrendRunner;
    a2: TrendRunner;
    lockedAt: string;
  } | null>(null);
  const [firstNumber, setFirstNumber] = useState("");
  const [secondNumber, setSecondNumber] = useState("");
  const [comboOddsInput, setComboOddsInput] = useState("");
  const [allRacesUpdated, setAllRacesUpdated] = useState("");
  const [backgroundCollecting, setBackgroundCollecting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [gallopPercentByHorseId, setGallopPercentByHorseId] = useState<Record<number, number | null>>({});
  const [autoSelections, setAutoSelections] = useState<AutoSelection[]>([]);
  const [autoStatus, setAutoStatus] = useState("Helkvällsautomaten väntar på en bana.");
  const [pendingOddsInputs, setPendingOddsInputs] = useState<Record<string, string>>({});
  const [selectedRaceByTrack, setSelectedRaceByTrack] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(TRACK_RACE_SELECTIONS_STORAGE_KEY);
      if (!stored) return {};
      const parsed = JSON.parse(stored) as Record<string, string>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [expandedRunnerKey, setExpandedRunnerKey] = useState<string | null>(null);
  const selectedRaceByTrackRef = useRef(selectedRaceByTrack);
  const latestRaceSelectionRef = useRef({ trackId, raceId: selectedRaceId });
  const pendingRaceNumberByTrackRef = useRef<Record<string, string>>({});
  const currentMeetingIdRef = useRef(trackId);
  const currentRaceIdRef = useRef(selectedRaceId);
  const selectedRaceRequestRef = useRef(0);
  const selectedRaceAbortRef = useRef<AbortController | null>(null);
  const loadingOddsRef = useRef(false);
  const gallopFetchInFlightRef = useRef<Set<number>>(new Set());

  const selectedTrack = useMemo(
    () => tracks.find((track) => String(track.id) === trackId),
    [tracks, trackId],
  );

  const selectedRace = useMemo(
    () =>
      races.find((race) => String(race.id) === selectedRaceId) ??
      races.find((race) => String(race.raceNumber) === selectedRaceId),
    [races, selectedRaceId],
  );

  const raceNumber = selectedRace ? String(selectedRace.raceNumber) : "";

  useEffect(() => {
    if (!selectedTrack || !selectedRace) return;
    const normalizedRaceId = String(selectedRace.id);
    if (selectedRaceId === normalizedRaceId) return;
    setSelectedRaceId(normalizedRaceId);
    setSelectedRaceByTrack((current) => ({
      ...current,
      [String(selectedTrack.id)]: normalizedRaceId,
    }));
  }, [selectedTrack, selectedRace, selectedRaceId]);

  useEffect(() => {
    currentMeetingIdRef.current = trackId;
    currentRaceIdRef.current = selectedRaceId;
  }, [trackId, selectedRaceId]);

  const selectedTrackRaces = useMemo(
    () => (selectedTrack ? racesByTrack[selectedTrack.id] ?? [] : []),
    [selectedTrack, racesByTrack],
  );

  const selectedTrackMeetingRefs = useMemo(
    () => (selectedTrack ? meetingRacesByTrack[selectedTrack.id] ?? [] : []),
    [selectedTrack, meetingRacesByTrack],
  );

  const swedishMeetingsCount = tracks.length;
  const swedishRacesCount = useMemo(
    () => Object.values(meetingRacesByTrack).reduce((sum, meetingRaces) => sum + meetingRaces.length, 0),
    [meetingRacesByTrack],
  );

  const countdown = useMemo(() => {
    if (!selectedRace?.startTime) {
      return {
        label: "Ingen starttid",
        phase: "unknown" as const,
        totalSeconds: null as number | null,
      };
    }

    const startMs = new Date(selectedRace.startTime).getTime();

    if (Number.isNaN(startMs)) {
      return {
        label: "Ingen starttid",
        phase: "unknown" as const,
        totalSeconds: null as number | null,
      };
    }

    const diffSeconds = Math.floor((startMs - nowMs) / 1000);

    if (diffSeconds <= 0) {
      return {
        label: "STARTAT",
        phase: "started" as const,
        totalSeconds: diffSeconds,
      };
    }

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;

    const label =
      hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;

    let phase: "normal" | "warning" | "urgent" | "critical" = "normal";

    if (diffSeconds <= 60) {
      phase = "critical";
    } else if (diffSeconds <= 5 * 60) {
      phase = "urgent";
    } else if (diffSeconds <= 10 * 60) {
      phase = "warning";
    }

    return {
      label,
      phase,
      totalSeconds: diffSeconds,
    };
  }, [selectedRace, nowMs]);

  const trendRunners = useMemo<TrendRunner[]>(() => {
    if (!selectedRace) return [];
    const base = buildTrendRunnersForRace(selectedRace, oddsHistory);
    return base.map((runner) => {
      const fallbackGallop = runner.horseId !== null
        ? gallopPercentByHorseId[runner.horseId]
        : undefined;

      if (runner.stats.gallopPercent !== null || fallbackGallop === undefined) {
        return runner;
      }

      return {
        ...runner,
        stats: {
          ...runner.stats,
          gallopPercent: fallbackGallop,
        },
      };
    });
  }, [selectedRace, oddsHistory, gallopPercentByHorseId]);

  const selectedHorseIds = useMemo(() => {
    if (!selectedRace) return [] as number[];
    const ids = selectedRace.runners
      .map((runner) => runner.horseId)
      .filter((horseId): horseId is number => horseId !== null && horseId > 0);
    return [...new Set(ids)];
  }, [selectedRace]);

  const raceInsights = useMemo(() => buildRaceInsights(trendRunners), [trendRunners]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ODDS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OddsHistory;
        if (parsed && typeof parsed === "object") {
          setOddsHistory(parsed);
        }
      }
    } catch (error) {
      console.error("Kunde inte läsa sparad oddshistorik", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ODDS_STORAGE_KEY,
        JSON.stringify(oddsHistory),
      );
    } catch (error) {
      console.error("Kunde inte spara oddshistorik", error);
    }
  }, [oddsHistory]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedBet[];
        if (Array.isArray(parsed)) setSavedBets(parsed);
      }
    } catch (error) {
      console.error("Kunde inte läsa sparad speljournal", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(BETS_STORAGE_KEY, JSON.stringify(savedBets));
    } catch (error) {
      console.error("Kunde inte spara speljournal", error);
    }
  }, [savedBets]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AUTO_SELECTIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AutoSelection[];
        if (Array.isArray(parsed)) setAutoSelections(parsed);
      }
    } catch (error) {
      console.error("Kunde inte läsa automatiska låsningar", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SELECTIONS_STORAGE_KEY, JSON.stringify(autoSelections));
    } catch (error) {
      console.error("Kunde inte spara automatiska låsningar", error);
    }
  }, [autoSelections]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRACK_RACE_SELECTIONS_STORAGE_KEY, JSON.stringify(selectedRaceByTrack));
    } catch (error) {
      console.error("Kunde inte spara loppval per bana", error);
    }
  }, [selectedRaceByTrack]);

  useEffect(() => {
    selectedRaceByTrackRef.current = selectedRaceByTrack;
  }, [selectedRaceByTrack]);

  useEffect(() => {
    latestRaceSelectionRef.current = { trackId, raceId: selectedRaceId };
  }, [trackId, selectedRaceId]);

  useEffect(() => {
    loadingOddsRef.current = loadingOdds;
  }, [loadingOdds]);

  useEffect(() => {
    if (!selectedHorseIds.length) return;

    const missingHorseIds = selectedHorseIds.filter((horseId) =>
      gallopPercentByHorseId[horseId] === undefined &&
      !gallopFetchInFlightRef.current.has(horseId),
    );

    if (!missingHorseIds.length) return;

    const controller = new AbortController();

    for (const horseId of missingHorseIds) {
      gallopFetchInFlightRef.current.add(horseId);
    }

    void (async () => {
      const results = await Promise.all(
        missingHorseIds.map(async (horseId) => {
          const gallopPercent = await fetchHorseGallopPercent(horseId, controller.signal);
          return { horseId, gallopPercent };
        }),
      );

      setGallopPercentByHorseId((current) => {
        const next = { ...current };
        for (const { horseId, gallopPercent } of results) {
          next[horseId] = gallopPercent;
        }
        return next;
      });

      for (const horseId of missingHorseIds) {
        gallopFetchInFlightRef.current.delete(horseId);
      }
    })();

    return () => {
      controller.abort();
      for (const horseId of missingHorseIds) {
        gallopFetchInFlightRef.current.delete(horseId);
      }
    };
  }, [selectedHorseIds, gallopPercentByHorseId]);

  useEffect(() => {
    setLockedSelection(null);
    setFirstNumber("");
    setSecondNumber("");
    setComboOddsInput("");
    setExpandedRunnerKey(null);
  }, [trackId, selectedRaceId]);

  
  const candidates = useMemo(() => rankCandidates(trendRunners), [trendRunners]);

  const stablePressureCandidate = useMemo<StablePressureCandidate | null>(() => {
    if (!selectedRace) return null;
    return findBestStablePressureHorse(selectedRace, trendRunners, oddsHistory);
  }, [selectedRace, trendRunners, oddsHistory]);

  const marketAnalysisProgress = useMemo(() => {
    if (!selectedRace) {
      return { measurementCount: 0, observedMinutes: 0, active: false };
    }

    let largestMeasurementCount = 0;
    let longestObservedMinutes = 0;

    for (const runner of trendRunners) {
      const storedHistory =
        oddsHistory[runnerKey(selectedRace.id, runner.number)] ?? [];
      const history = historyInsideLastHour(
        storedHistory,
        selectedRace.startTime,
      );

      largestMeasurementCount = Math.max(
        largestMeasurementCount,
        history.length,
      );

      if (history.length >= 2) {
        const observedMinutes =
          (history[history.length - 1].timestamp - history[0].timestamp) /
          60_000;

        longestObservedMinutes = Math.max(
          longestObservedMinutes,
          observedMinutes,
        );
      }
    }

    return {
      measurementCount: largestMeasurementCount,
      observedMinutes: Math.max(0, Math.round(longestObservedMinutes)),
      active: largestMeasurementCount >= 2,
    };
  }, [selectedRace, trendRunners, oddsHistory]);

  const raceCollectionSummary = useMemo(() => {
    let active = 0;
    let waiting = 0;

    for (const race of races) {
      const window = raceCollectionWindow(race.startTime);
      if (!window) continue;

      if (nowMs >= window.collectionStartMs && nowMs < window.startMs) {
        active += 1;
      } else if (nowMs < window.collectionStartMs) {
        waiting += 1;
      }
    }

    return { active, waiting, total: races.length };
  }, [races, nowMs]);

  const favoriteRunner = useMemo(() => {
    return [...trendRunners]
      .filter((runner) => !runner.scratched && runner.odds !== null && runner.odds > 0)
      .sort((a, b) => (a.odds ?? Number.POSITIVE_INFINITY) - (b.odds ?? Number.POSITIVE_INFINITY))[0] ?? null;
  }, [trendRunners]);

  const racePictureText = useMemo(() => {
    if (!favoriteRunner || !candidates[0] || !candidates[1]) {
      return "För lite data för en tydlig loppbild ännu.";
    }

    const favChange = favoriteRunner.changePercent ?? 0;
    const a1Change = candidates[0].changePercent ?? 0;
    const a2Change = candidates[1].changePercent ?? 0;

    if (favChange > 4 && a1Change < -5 && a2Change < -5) {
      return "Favoriten försvagas samtidigt som både A1 och A2 sjunker tydligt. Intressant loppbild.";
    }

    if (favChange < -5 && (a1Change > -3 || a2Change > -3)) {
      return "Favoriten stärks tydligt. A1/A2-rörelsen bör värderas försiktigare.";
    }

    if (Math.abs(favChange) < 3 && a1Change < -8 && a2Change < -8) {
      return "Favoriten är stabil medan A1 och A2 får tydliga oddssänkningar.";
    }

    if (favChange > 5) {
      return "Favoriten stiger och tappar stöd. Det öppnar loppbilden.";
    }

    if (favChange < -5) {
      return "Favoriten sjunker och stärks i marknaden.";
    }

    return "Favoriten är relativt stabil. A1 och A2 bedöms främst på sina egna trender.";
  }, [favoriteRunner, candidates]);


  const journalTotals = useMemo(() => {
    const stake = savedBets.reduce((sum, bet) => sum + bet.stake, 0);
    const returnAmount = savedBets.reduce((sum, bet) => sum + bet.returnAmount, 0);
    const net = returnAmount - stake;
    const roi = stake > 0 ? (net / stake) * 100 : 0;
    const hits = savedBets.filter((bet) => bet.hit).length;
    return { stake, returnAmount, net, roi, hits };
  }, [savedBets]);

  const firstOddsRegisteredAt = useMemo(() => {
    if (!selectedRace) return null;
    const timestamps = trendRunners
      .flatMap((runner) => historyInsideLastHour(oddsHistory[runnerKey(selectedRace.id, runner.number)] ?? [], selectedRace.startTime))
      .map((point) => point.timestamp);
    if (!timestamps.length) return null;
    return new Date(Math.min(...timestamps)).toISOString();
  }, [selectedRace, trendRunners, oddsHistory]);

  const minutesToLock = useMemo(() => {
    if (countdown.totalSeconds === null) return null;
    return Math.max(0, Math.floor((countdown.totalSeconds - 60) / 60));
  }, [countdown.totalSeconds]);

  const trackAlerts = useMemo(() => {
    const next: Record<number, string | null> = {};
    for (const track of tracks) {
      const trackRaces = racesByTrack[track.id] ?? [];
      const hasReadyCandidate = trackRaces.some((race) => rankCandidates(buildTrendRunnersForRace(race, oddsHistory)).length > 0);
      const hasStartingSoon = trackRaces.some((race) => {
        if (!race.startTime) return false;
        const diff = new Date(race.startTime).getTime() - nowMs;
        return diff > 0 && diff <= 10 * 60_000;
      });
      next[track.id] = hasReadyCandidate ? "A1/A2 redo" : hasStartingSoon ? "Snart start" : null;
    }
    return next;
  }, [tracks, racesByTrack, oddsHistory, nowMs]);

  const overviewRows = useMemo(() => {
    return tracks.flatMap((track) => {
      const trackRaces = racesByTrack[track.id] ?? [];
      return trackRaces.map((race) => {
        const runners = buildTrendRunnersForRace(race, oddsHistory);
        const insights = buildRaceInsights(runners);
        const ranked = rankCandidates(runners);
        const startMs = race.startTime ? new Date(race.startTime).getTime() : Number.NaN;
        const secondsLeft = Number.isNaN(startMs) ? null : Math.floor((startMs - nowMs) / 1000);
        return {
          track,
          race,
          ranked,
          insights,
          secondsLeft,
          insufficientData: runners.filter((runner) => runner.samples >= 3).length < 2,
        };
      });
    });
  }, [tracks, racesByTrack, oddsHistory, nowMs]);

  function betResultLabel(bet: SavedBet) {
    if (bet.firstNumber <= 0 || bet.secondNumber <= 0) {
      return "Resultat väntar";
    }
    return `Resultat ${bet.firstNumber}-${bet.secondNumber} · ${bet.hit ? `Traff ${bet.winningOrder}` : "Miss"}`;
  }

  function lockCurrentSelection() {
    if (selectedRace?.isMonte) {
      setError("Montélopp räknas inte och ska inte spelas enligt modellen.");
      return;
    }
    if (!candidates[0] || !candidates[1]) {
      setError("Det finns ännu inte två kandidater med tillräcklig trenddata.");
      return;
    }
    setLockedSelection({
      a1: candidates[0],
      a2: candidates[1],
      lockedAt: new Date().toLocaleTimeString("sv-SE"),
    });
    setError("");
  }

  function saveResult() {
    if (!selectedTrack || !selectedRace || !lockedSelection) {
      setError("Lås A1 och A2 innan resultatet sparas.");
      return;
    }

    const first = Number(firstNumber);
    const second = Number(secondNumber);

    if (!first || !second || first === second) {
      setError("Välj olika hästar som etta och tvåa.");
      return;
    }

    const a1 = lockedSelection.a1;
    const a2 = lockedSelection.a2;
    const isA1A2 = first === a1.number && second === a2.number;
    const isA2A1 = first === a2.number && second === a1.number;
    const hit = isA1A2 || isA2A1;

    const parsedOdds = Number(comboOddsInput.replace(",", "."));
    const comboOdds = Number.isFinite(parsedOdds) && parsedOdds > 0 ? parsedOdds : null;

    if (hit && comboOdds === null) {
      setError("Ange komboddset för den vinnande ordningen.");
      return;
    }

    const stake = 100;
    const returnAmount = hit && comboOdds ? 50 * comboOdds : 0;
    const net = returnAmount - stake;

    const bet: SavedBet = {
      id: `${date}-${selectedTrack.id}-${selectedRace.raceNumber}-${Date.now()}`,
      date,
      trackId: selectedTrack.id,
      trackName: selectedTrack.name,
      raceNumber: selectedRace.raceNumber,
      a1Number: a1.number,
      a1Name: a1.name,
      a2Number: a2.number,
      a2Name: a2.name,
      firstNumber: first,
      secondNumber: second,
      comboOdds,
      hit,
      winningOrder: isA1A2 ? "A1-A2" : isA2A1 ? "A2-A1" : "MISS",
      stake,
      returnAmount,
      net,
      lockedAt: lockedSelection.lockedAt,
      savedAt: new Date().toISOString(),
    };

    setSavedBets((current) => [bet, ...current]);
    setFirstNumber("");
    setSecondNumber("");
    setComboOddsInput("");
    setLockedSelection(null);
    setError("");
  }

  function deleteSavedBet(id: string) {
    setSavedBets((current) => current.filter((bet) => bet.id !== id));
  }

  function finalizeComboOdds(id: string) {
    const raw = pendingOddsInputs[id] ?? "";
    const odds = Number(raw.replace(",", "."));
    if (!Number.isFinite(odds) || odds <= 0) {
      setError("Ange ett giltigt kombodds.");
      return;
    }
    setSavedBets((current) => current.map((bet) => {
      if (bet.id !== id) return bet;
      const returnAmount = 50 * odds;
      return { ...bet, comboOdds: odds, returnAmount, net: returnAmount - bet.stake, needsComboOdds: false };
    }));
    setPendingOddsInputs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setError("");
  }


  async function loadTracks() {
    setLoadingTracks(true);
    setError("");
    setRaces([]);
    setRacesByTrack({});
    setMeetingRacesByTrack({});

    try {
      const response = await fetch(`${API}/calendar/day/${date}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`ATG svarade med status ${response.status}`);
      }

      const data = (await response.json()) as CalendarResponse;
      const rawTracks = data.tracks ?? [];

      const swedishMeetings = rawTracks
        .map((rawTrack) => {
          const track = parseTrack(rawTrack);
          if (!track) return null;
          return {
            track,
            meetingRaces: parseMeetingRaceRefs(rawTrack),
          };
        })
        .filter((meeting): meeting is { track: Track; meetingRaces: MeetingRaceRef[] } => meeting !== null)
        .sort((a, b) => a.track.name.localeCompare(b.track.name, "sv"));

      const list = swedishMeetings.map((meeting) => meeting.track);
      const nextMeetingRacesByTrack: MeetingRacesByTrack = {};
      for (const meeting of swedishMeetings) {
        nextMeetingRacesByTrack[meeting.track.id] = meeting.meetingRaces;
      }

      const swedishMeetingsCountNext = swedishMeetings.length;
      const swedishRacesCountNext = swedishMeetings.reduce((sum, meeting) => sum + meeting.meetingRaces.length, 0);

      console.log(`[KOMBEN] Swedish meetings: ${swedishMeetingsCountNext}`);
      console.log(`[KOMBEN] Swedish races: ${swedishRacesCountNext}`);

      setTracks(list);
      setMeetingRacesByTrack(nextMeetingRacesByTrack);
      setUpdated(new Date().toLocaleTimeString("sv-SE"));

      if (list.length) {
        const currentTrackIsValid = list.some((track) => String(track.id) === trackId);
        const nextTrack = currentTrackIsValid
          ? list.find((track) => String(track.id) === trackId) ?? list[0]
          : list[0];
        if (!currentTrackIsValid) {
          setTrackId(String(nextTrack.id));
        }

        void loadRaces(nextTrack, list, nextMeetingRacesByTrack);
      }

      if (!list.length) {
        setError(
          "Inga svenska banor hittades för valt datum.",
        );
      }
    } catch (err) {
      console.error("[KOMBEN] loadTracks error", err);
      setTracks([]);
      setError("Kunde inte hämta banorna från ATG.");
    } finally {
      setLoadingTracks(false);
    }
  }

  function cancelSelectedRaceRequest() {
    selectedRaceAbortRef.current?.abort();
    selectedRaceAbortRef.current = null;
  }

  function stableRaceId(track: Track, raceNumberValue: number) {
    return `${date}_${track.id}_${raceNumberValue}`;
  }

  async function fetchRace(track: Track, number: number, signal?: AbortSignal) {
    const gameId = `vinnare_${date}_${track.id}_${number}`;
    for (let attempt = 0; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
      const timeoutController = new AbortController();
      const timeoutHandle = window.setTimeout(() => {
        timeoutController.abort();
      }, FETCH_TIMEOUT_MS);
      const parentAbort = () => timeoutController.abort();

      if (signal) {
        signal.addEventListener("abort", parentAbort, { once: true });
      }

      try {
        const response = await fetch(`${API}/games/${gameId}`, {
          cache: "no-store",
          signal: timeoutController.signal,
        });

        if (!response.ok) {
          if (response.status >= 500 && attempt < FETCH_RETRY_ATTEMPTS) {
            continue;
          }
          return null;
        }

        const data: unknown = await response.json();
        const parsed = parseRace(data, number);
        if (!parsed) return null;
        return { ...parsed, id: stableRaceId(track, parsed.raceNumber || number) };
      } catch (error) {
        if (signal?.aborted && isAbortError(error)) {
          throw error;
        }

        if (attempt < FETCH_RETRY_ATTEMPTS) {
          continue;
        }

        return null;
      } finally {
        window.clearTimeout(timeoutHandle);
        if (signal) {
          signal.removeEventListener("abort", parentAbort);
        }
      }
    }

    return null;
  }

  function buildPlaceholderRace(track: Track, raceNumberValue: number, startTime?: string): Race {
    return {
      raceNumber: raceNumberValue,
      id: stableRaceId(track, raceNumberValue),
      startTime,
      status: "Väntar på data",
      runners: [],
      isMonte: false,
      isP21: false,
      finishOrder: [],
    };
  }

  async function loadRaces(track = selectedTrack, trackList?: Track[], meetingRaceRefsByTrack?: MeetingRacesByTrack) {
    if (!track) return;
    const tracksToLoad = trackList ?? [track];
    const raceRefsSource = meetingRaceRefsByTrack ?? meetingRacesByTrack;

    setLoadingRaces(true);
    setError("");

    try {
      const fetchedByTrack = await Promise.all(tracksToLoad.map(async (currentTrack) => {
        const meetingRaceRefs = raceRefsSource[currentTrack.id] ?? [];
        const raceNumbers = [...new Set(meetingRaceRefs.map((raceRef) => raceRef.raceNumber).filter((value) => value > 0))];

        if (!raceNumbers.length) {
          return { track: currentTrack, races: [] as Race[] };
        }

        const results = await Promise.all(
          raceNumbers.map((number) => fetchRace(currentTrack, number).catch(() => null)),
        );

        const availableRaces = raceNumbers
          .map((raceNumberValue, index) => {
            const fetchedRace = results[index];
            if (fetchedRace) return fetchedRace;
            const raceRef = meetingRaceRefs.find((ref) => ref.raceNumber === raceNumberValue);
            return buildPlaceholderRace(currentTrack, raceNumberValue, raceRef?.startTime);
          })
          .sort((a, b) => {
            const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
            const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
            if (aTime !== bTime) return aTime - bTime;
            return a.raceNumber - b.raceNumber;
          });

        return { track: currentTrack, races: availableRaces };
      }));

      const nextByTrack: RacesByTrack = {};
      for (const item of fetchedByTrack) {
        nextByTrack[item.track.id] = item.races;
      }

      setRacesByTrack(nextByTrack);

      const selectedTrackId = Number(trackId || track.id);
      const selectedTrackRaces = nextByTrack[selectedTrackId] ?? nextByTrack[track.id] ?? [];
      setRaces(selectedTrackRaces);
      setOddsHistory((current) => {
        const next = { ...current };
        const timestamp = Date.now();

        for (const item of fetchedByTrack) {
          for (const race of item.races) {
            if (!shouldCollectOdds(race.startTime, timestamp)) continue;
            for (const runner of race.runners) {
              if (runner.odds === null || runner.odds <= 0) continue;

              const key = runnerKey(race.id, runner.number);
              const history = next[key] ?? [];
              next[key] = appendMinuteSnapshot(history, runner.odds, timestamp);
            }
          }
        }

        return next;
      });
      setUpdated(new Date().toLocaleTimeString("sv-SE"));

      if (selectedTrackRaces.length) {
        const currentTrackKey = String(selectedTrackId);
        const pendingRaceNumber = pendingRaceNumberByTrackRef.current[currentTrackKey] ?? "";
        const pendingRace = pendingRaceNumber
          ? selectedTrackRaces.find((race) => String(race.raceNumber) === pendingRaceNumber)
          : undefined;
        const rememberedRace = selectedRaceByTrackRef.current[currentTrackKey] ?? "";
        const latestSelection = latestRaceSelectionRef.current;
        const currentRaceForTrack =
          latestSelection.trackId === currentTrackKey
            ? latestSelection.raceId
            : "";
        const preferredRace = currentRaceForTrack || pendingRace?.id || rememberedRace;
        const preferredRaceIsValid =
          preferredRace &&
          selectedTrackRaces.some((race) => String(race.id) === preferredRace);

        if (preferredRaceIsValid) {
          if (currentRaceForTrack !== preferredRace) {
            setSelectedRaceId(preferredRace);
            setSelectedRaceByTrack((current) => ({ ...current, [currentTrackKey]: preferredRace }));
          }
          if (pendingRace) {
            delete pendingRaceNumberByTrackRef.current[currentTrackKey];
          }
        } else {
          const fallbackRace = String(selectedTrackRaces[0].id);
          setSelectedRaceId(fallbackRace);
          setSelectedRaceByTrack((current) => ({ ...current, [currentTrackKey]: fallbackRace }));
        }
      } else {
        setError(
          `Inga lopp hittades för ${track.name}.`,
        );
      }
    } catch (err) {
      console.error("[KOMBEN] loadRaces error", err);
      setError(`Kunde inte hämta loppen för ${track.name}.`);
    } finally {
      setLoadingRaces(false);
    }
  }

  async function refreshAllRaces() {
    if (!tracks.length || backgroundCollecting) return;

    setBackgroundCollecting(true);

    try {
      const timestamp = Date.now();

      const racesPerTrack = tracks.map((track) => ({
        track,
        races: racesByTrack[track.id] ?? [],
      }));

      const eligibleByTrack = racesPerTrack
        .map((entry) => ({
          track: entry.track,
          raceNumbers: entry.races
            .filter((race) => shouldCollectOdds(race.startTime, timestamp))
            .map((race) => race.raceNumber),
        }))
        .filter((entry) => entry.raceNumbers.length > 0);

      if (!eligibleByTrack.length) {
        setAllRacesUpdated(new Date().toLocaleTimeString("sv-SE"));
        setUpdated(new Date().toLocaleTimeString("sv-SE"));
        return;
      }

      const refreshedByTrack = await Promise.all(
        eligibleByTrack.map(async ({ track, raceNumbers }) => {
          const refreshedResults = await Promise.all(
            raceNumbers.map((number) => fetchRace(track, number).catch(() => null)),
          );
          const refreshedRaces = refreshedResults.filter((race): race is Race => race !== null);
          return { trackId: track.id, refreshedRaces };
        }),
      );

      setOddsHistory((current) => {
        const next = { ...current };

        for (const trackUpdate of refreshedByTrack) {
          for (const race of trackUpdate.refreshedRaces) {
            if (!shouldCollectOdds(race.startTime, timestamp)) continue;
            for (const runner of race.runners) {
              if (runner.odds === null || runner.odds <= 0) continue;

              const key = runnerKey(race.id, runner.number);
              const history = next[key] ?? [];
              next[key] = appendMinuteSnapshot(history, runner.odds, timestamp);
            }
          }
        }

        return next;
      });

      setRacesByTrack((current) => {
        const next = { ...current };
        for (const trackUpdate of refreshedByTrack) {
          const existing = next[trackUpdate.trackId] ?? [];
          const merged = existing.map((race) =>
            trackUpdate.refreshedRaces.find(
              (refreshed) => refreshed.id === race.id || refreshed.raceNumber === race.raceNumber,
            ) ?? race,
          );
          next[trackUpdate.trackId] = merged;
        }
        return next;
      });

      setAllRacesUpdated(new Date().toLocaleTimeString("sv-SE"));
      setUpdated(new Date().toLocaleTimeString("sv-SE"));
    } catch (error) {
      console.error("Bakgrundsinsamlingen misslyckades", error);
    } finally {
      setBackgroundCollecting(false);
    }
  }

  async function refreshSelectedRace() {
    if (!selectedTrack || !selectedRace) return;
    if (loadingOddsRef.current) {
      cancelSelectedRaceRequest();
      loadingOddsRef.current = false;
      setLoadingOdds(false);
    }

    cancelSelectedRaceRequest();
    const controller = new AbortController();
    selectedRaceAbortRef.current = controller;
    const requestId = selectedRaceRequestRef.current + 1;
    selectedRaceRequestRef.current = requestId;
    const raceKeyAtStart = `${selectedTrack.id}:${selectedRace.id}`;

    loadingOddsRef.current = true;
    setLoadingOdds(true);
    setError("");

    try {
      const refreshed = await fetchRace(selectedTrack, selectedRace.raceNumber, controller.signal);

      if (!refreshed) {
        throw new Error("Loppet kunde inte hämtas.");
      }

      const requestedMeetingId = selectedTrack.id;
      const requestedRaceId = selectedRace.id;

      if (controller.signal.aborted || requestId !== selectedRaceRequestRef.current) {
        return;
      }

      const latestSelection = latestRaceSelectionRef.current;
      const latestRaceKey = `${latestSelection.trackId}:${latestSelection.raceId}`;
      if (raceKeyAtStart !== latestRaceKey) {
        return;
      }

      if (
        String(requestedMeetingId) !== String(currentMeetingIdRef.current) ||
        String(requestedRaceId) !== String(currentRaceIdRef.current)
      ) {
        return;
      }

      const snapshotTime = Date.now();
      if (shouldCollectOdds(refreshed.startTime, snapshotTime)) {
        setOddsHistory((current) => {
          const next = { ...current };

          for (const runner of refreshed.runners) {
            if (runner.odds === null || runner.odds <= 0) continue;

            const key = runnerKey(refreshed.id, runner.number);
            const history = next[key] ?? [];
            next[key] = appendMinuteSnapshot(history, runner.odds, snapshotTime);
          }

          return next;
        });
      }

      setRaces((current) =>
        current.map((race) =>
          race.id === refreshed.id || race.raceNumber === refreshed.raceNumber ? refreshed : race,
        ),
      );
      setUpdated(new Date().toLocaleTimeString("sv-SE"));
      setSecondsToRefresh(REFRESH_SECONDS);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      console.error(err);
      setError("Kunde inte uppdatera liveoddsen. Försök igen.");
    } finally {
      if (requestId === selectedRaceRequestRef.current) {
        loadingOddsRef.current = false;
        setLoadingOdds(false);
        if (selectedRaceAbortRef.current === controller) {
          selectedRaceAbortRef.current = null;
        }
      }
    }
  }

  useEffect(() => () => {
    cancelSelectedRaceRequest();
  }, []);

  useEffect(() => {
    void loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedTrack) {
      setRaces([]);
      setSelectedRaceId("");
      return;
    }

    const selectedTrackRaces = racesByTrack[selectedTrack.id] ?? [];
    setRaces(selectedTrackRaces);

    if (selectedTrackRaces.some((race) => String(race.id) === selectedRaceId)) {
      return;
    }

    const trackKey = String(selectedTrack.id);
    const pendingRaceNumber = pendingRaceNumberByTrackRef.current[trackKey] ?? "";
    const pendingRace = pendingRaceNumber
      ? selectedTrackRaces.find((race) => String(race.raceNumber) === pendingRaceNumber)
      : undefined;
    if (pendingRace) {
      const pendingRaceId = String(pendingRace.id);
      setSelectedRaceId(pendingRaceId);
      setSelectedRaceByTrack((current) => ({ ...current, [trackKey]: pendingRaceId }));
      delete pendingRaceNumberByTrackRef.current[trackKey];
      return;
    }

    const rememberedRace = selectedRaceByTrackRef.current[String(selectedTrack.id)];
    const rememberedRaceExists = rememberedRace
      ? selectedTrackRaces.some((race) => String(race.id) === rememberedRace)
      : false;

    if (rememberedRaceExists && selectedRaceId !== rememberedRace) {
      setSelectedRaceId(rememberedRace);
      return;
    }

    if (!selectedTrackRaces.some((race) => String(race.id) === selectedRaceId)) {
      const fallbackRace = selectedTrackRaces.length ? String(selectedTrackRaces[0].id) : "";
      setSelectedRaceId(fallbackRace);
      if (fallbackRace) {
        setSelectedRaceByTrack((current) => ({ ...current, [String(selectedTrack.id)]: fallbackRace }));
      }
    }
  }, [selectedTrack, racesByTrack, selectedRaceId]);

  useEffect(() => {
    if (!selectedTrack) return;
    if (loadingRaces) return;
    const meetingRaceRefs = meetingRacesByTrack[selectedTrack.id] ?? [];
    if (!meetingRaceRefs.length) return;
    const loadedRaces = racesByTrack[selectedTrack.id] ?? [];
    if (loadedRaces.length) return;
    void loadRaces(selectedTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack, loadingRaces, meetingRacesByTrack, racesByTrack]);

  useEffect(() => {
    if (!selectedTrack || !selectedRace) return;
    if (loadingOddsRef.current) return;
    const waitingForRaceData =
      selectedRace.status === "Väntar på data" ||
      selectedRace.runners.length === 0;
    if (!waitingForRaceData) return;
    void refreshSelectedRace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack, selectedRaceId, selectedRace?.status, selectedRace?.runners.length]);

  useEffect(() => {
    if (!selectedTrack || !selectedRaceId) return;

    setSecondsToRefresh(REFRESH_SECONDS);

    const countdown = window.setInterval(() => {
      setSecondsToRefresh((current) => {
        if (current <= 1) return REFRESH_SECONDS;
        return current - 1;
      });
    }, 1000);

    const refresh = window.setInterval(() => {
      void refreshSelectedRace();
    }, REFRESH_SECONDS * 1000);

    return () => {
      window.clearInterval(countdown);
      window.clearInterval(refresh);
      cancelSelectedRaceRequest();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, selectedRaceId]);

  useEffect(() => {
    if (!tracks.length) return;

    void refreshAllRaces();

    const collector = window.setInterval(() => {
      void refreshAllRaces();
    }, ALL_RACES_REFRESH_SECONDS * 1000);

    return () => window.clearInterval(collector);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length, Object.keys(racesByTrack).length, date]);

  useEffect(() => {
    if (!tracks.length) {
      setAutoStatus("Helkvällsautomaten väntar på en bana.");
      return;
    }

    const now = Date.now();
    const trackById = new Map(tracks.map((track) => [track.id, track]));
    const existingBetKeys = new Set(
      savedBets
        .filter((bet) => bet.date === date)
        .map((bet) => `${bet.trackId}:${bet.raceNumber}`),
    );
    const selectionsByRace = new Map(autoSelections.map((selection) => [selection.raceId, selection]));

    const newSelections: AutoSelection[] = [];
    const betsToAdd: SavedBet[] = [];

    for (const [trackIdKey, trackRaces] of Object.entries(racesByTrack)) {
      const trackIdValue = Number(trackIdKey);
      const track = trackById.get(trackIdValue);
      if (!track) continue;

      for (const race of trackRaces) {
        if (race.isMonte) continue;
        if (!race.startTime) continue;

        const startMs = new Date(race.startTime).getTime();
        if (Number.isNaN(startMs)) continue;

        const secondsLeft = Math.floor((startMs - now) / 1000);
        if (secondsLeft > 60 || secondsLeft < -120) continue;

        const betKey = `${track.id}:${race.raceNumber}`;
        if (existingBetKeys.has(betKey)) continue;

        let selection = selectionsByRace.get(race.id);
        if (!selection) {
          const ranked = rankCandidates(buildTrendRunnersForRace(race, oddsHistory));
          if (!ranked[0] || !ranked[1]) continue;

          selection = {
            raceId: race.id,
            raceNumber: race.raceNumber,
            a1: ranked[0],
            a2: ranked[1],
            lockedAt: new Date().toLocaleTimeString("sv-SE"),
          };
          newSelections.push(selection);
          selectionsByRace.set(race.id, selection);
        }

        betsToAdd.push({
          id: `${date}-${track.id}-${race.raceNumber}-auto`,
          date,
          trackId: track.id,
          trackName: track.name,
          raceNumber: race.raceNumber,
          a1Number: selection.a1.number,
          a1Name: selection.a1.name,
          a2Number: selection.a2.number,
          a2Name: selection.a2.name,
          firstNumber: 0,
          secondNumber: 0,
          comboOdds: null,
          hit: false,
          winningOrder: "MISS",
          stake: 100,
          returnAmount: 0,
          net: -100,
          lockedAt: selection.lockedAt,
          savedAt: new Date().toISOString(),
          automatic: true,
          needsComboOdds: false,
        });
        existingBetKeys.add(betKey);

        if (
          selectedTrack &&
          selectedRace &&
          selectedTrack.id === track.id &&
          selectedRace.raceNumber === race.raceNumber
        ) {
          setLockedSelection({
            a1: selection.a1,
            a2: selection.a2,
            lockedAt: selection.lockedAt,
          });
        }
      }
    }

    if (newSelections.length) {
      setAutoSelections((current) => {
        const existing = new Set(current.map((selection) => selection.raceId));
        const unique = newSelections.filter((selection) => !existing.has(selection.raceId));
        return unique.length ? [...current, ...unique] : current;
      });
    }

    if (betsToAdd.length) {
      setSavedBets((current) => {
        const existingIds = new Set(current.map((bet) => bet.id));
        const unique = betsToAdd.filter((bet) => !existingIds.has(bet.id));
        return unique.length ? [...unique, ...current] : current;
      });
      setAutoStatus(`Låste och sparade automatiskt ${betsToAdd.map((bet) => `lopp ${bet.raceNumber}`).join(", ")}.`);
    }

    const raceByTrackAndNumber = new Map<string, Race>();
    for (const [trackIdKey, trackRaces] of Object.entries(racesByTrack)) {
      const trackIdValue = Number(trackIdKey);
      for (const race of trackRaces) {
        raceByTrackAndNumber.set(`${trackIdValue}:${race.raceNumber}`, race);
      }
    }

    const correctedById = new Map<string, SavedBet>();
    for (const bet of savedBets) {
      if (!bet.automatic || bet.date !== date) continue;
      if (bet.firstNumber > 0 && bet.secondNumber > 0) continue;

      const race = raceByTrackAndNumber.get(`${bet.trackId}:${bet.raceNumber}`);
      if (!race || race.finishOrder.length < 2) continue;

      const first = race.finishOrder[0];
      const second = race.finishOrder[1];
      const isA1A2 = first === bet.a1Number && second === bet.a2Number;
      const isA2A1 = first === bet.a2Number && second === bet.a1Number;
      const hit = isA1A2 || isA2A1;

      correctedById.set(bet.id, {
        ...bet,
        firstNumber: first,
        secondNumber: second,
        hit,
        winningOrder: isA1A2 ? "A1-A2" : isA2A1 ? "A2-A1" : "MISS",
        needsComboOdds: hit,
        returnAmount: 0,
        net: -bet.stake,
      });
    }

    if (correctedById.size) {
      setSavedBets((current) => current.map((bet) => correctedById.get(bet.id) ?? bet));
      setAutoStatus(`Rättade automatiskt ${correctedById.size} lopp.`);
      return;
    }

    if (!betsToAdd.length) {
      const upcoming = Object.values(racesByTrack)
        .flat()
        .filter((race) => race.startTime && new Date(race.startTime).getTime() > now - 30_000)
        .sort((a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime())[0];

      const next = upcoming?.startTime ? formatTime(upcoming.startTime) : "–";
      setAutoStatus(`Helkvällsautomaten är aktiv. Nästa lopp ${upcoming?.raceNumber ?? "–"} kl. ${next}.`);
    }
  }, [
    nowMs,
    tracks,
    racesByTrack,
    oddsHistory,
    selectedTrack,
    selectedRace,
    savedBets,
    autoSelections,
    date,
  ]);

  function countdownStyle() {
    if (countdown.phase === "critical" || countdown.phase === "started") {
      return {
        background: "rgba(127,29,29,.32)",
        borderColor: "#ef4444",
        color: "#fecaca",
      };
    }

    if (countdown.phase === "urgent") {
      return {
        background: "rgba(194,65,12,.26)",
        borderColor: "#f97316",
        color: "#fed7aa",
      };
    }

    if (countdown.phase === "warning") {
      return {
        background: "rgba(161,98,7,.24)",
        borderColor: "#eab308",
        color: "#fef08a",
      };
    }

    return {
      background: "#111827",
      borderColor: "#334155",
      color: "#f8fafc",
    };
  }

  function favoriteBehavior(change: number | null) {
    if (change === null) return "Okänd";
    if (change <= -5) return "Stärks";
    if (change >= 5) return "Försvagas";
    return "Stabil";
  }

  function selectTrack(nextTrackId: string) {
    setTrackId(nextTrackId);
    const rememberedRace = selectedRaceByTrack[nextTrackId];
    if (rememberedRace) {
      setSelectedRaceId(rememberedRace);
      return;
    }
    setSelectedRaceId("");
  }

  function selectRaceForTrack(track: Track, nextRaceIdentity: number | string) {
    const nextValue = String(nextRaceIdentity);
    const trackKey = String(track.id);
    const trackRaces = racesByTrack[track.id] ?? [];
    const byId = trackRaces.find((race) => String(race.id) === nextValue);
    const byNumber = trackRaces.find((race) => String(race.raceNumber) === nextValue);
    const resolvedRace = byId ?? byNumber;
    if (!resolvedRace) {
      if (trackId !== String(track.id)) {
        setTrackId(String(track.id));
      }
      setSelectedRaceId(nextValue);
      pendingRaceNumberByTrackRef.current[trackKey] = nextValue;
      setSelectedRaceByTrack((current) => ({ ...current, [trackKey]: nextValue }));
      return;
    }

    if (trackId !== String(track.id)) {
      setTrackId(String(track.id));
    }
    const resolvedRaceId = String(resolvedRace.id);
    setSelectedRaceId(resolvedRaceId);
    setSelectedRaceByTrack((current) => ({ ...current, [trackKey]: resolvedRaceId }));
    delete pendingRaceNumberByTrackRef.current[trackKey];
  }

  function openRaceFromOverview(track: Track, nextRaceId: string) {
    setActiveTab("race");
    selectRaceForTrack(track, nextRaceId);
  }

  async function retryLatestFetch() {
    if (loadingTracks || loadingRaces || loadingOddsRef.current) return;
    setError("");

    if (!tracks.length) {
      await loadTracks();
      return;
    }

    if (!selectedTrack) {
      await loadTracks();
      return;
    }

    const selectedTrackRaces = racesByTrack[selectedTrack.id] ?? [];
    if (!selectedTrackRaces.length) {
      await loadRaces(selectedTrack);
      return;
    }

    await refreshSelectedRace();
  }

  function runnerStrength(runner: TrendRunner) {
    return raceInsights.byRunner[runner.number]?.strength ?? 0;
  }

  function renderStrengthDots(strength: number) {
    return Array.from({ length: 6 }, (_, index) => (
      <span key={`strength-${index}`} className={`strength-dot ${index < strength ? "is-on" : ""}`} />
    ));
  }

  function renderIndicators(runner: TrendRunner) {
    const indicators = raceInsights.byRunner[runner.number]?.indicators ?? [];
    return (
      <div className="indicator-stack">
        <div className="indicator-label-row">
          {STAT_DEFINITIONS.map((definition) => (
            <span key={definition.key}>{definition.shortLabel}</span>
          ))}
        </div>
        <div className="indicator-dot-row">
          {indicators.map((indicator) => (
            <button
              key={`${runner.number}-${indicator.key}`}
              type="button"
              title={indicator.tooltip}
              className={`indicator-dot ${indicator.positive ? "is-positive" : ""}`}
              onClick={() => setExpandedRunnerKey((current) => current === `${selectedRace?.id}-${runner.number}` ? null : `${selectedRace?.id}-${runner.number}`)}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderOverviewTab() {
    return (
      <section className="tab-section">
        <div className="panel-header-row">
          <div>
            <p style={s.kicker}>OVERSIKT</p>
            <h2 style={s.raceTitle}>Kvällens banor och lopp</h2>
          </div>
          <div className="panel-meta-row">
            <span>{tracks.length} banor</span>
            <span>Senast {allRacesUpdated || updated || "vantar"}</span>
          </div>
        </div>

        <div className="overview-grid">
          {overviewRows.map(({ track, race, ranked, insights, secondsLeft, insufficientData }) => (
            <button
              key={`${track.id}-${race.id}`}
              type="button"
              className="overview-card"
              onClick={() => openRaceFromOverview(track, race.id)}
            >
              <div className="overview-card-top">
                <strong>{track.name} L{race.raceNumber}</strong>
                <span>{formatTime(race.startTime)}</span>
              </div>
              <div className="overview-card-meta">
                <span>{secondsLeft === null ? "Ingen starttid" : secondsLeft <= 0 ? "Startat" : `${Math.max(1, Math.ceil(secondsLeft / 60))} min kvar`}</span>
                <span>{race.status || "Vantar"}</span>
              </div>
              <div className="overview-card-body">
                <span>A1: {ranked[0] ? `${ranked[0].number}. ${ranked[0].name}` : "For lite data"}</span>
                <span>A2: {ranked[1] ? `${ranked[1].number}. ${ranked[1].name}` : "Ingen tillrackligt tydlig A2"}</span>
                <span>Jamnast: {insights.smoothest ? `${insights.smoothest.number}. ${insights.smoothest.name}` : "Saknas"}</span>
                <span>Mest sankta: {insights.biggestDrop ? `${insights.biggestDrop.number}. ${insights.biggestDrop.name}` : "Saknas"}</span>
                {insufficientData ? <span className="muted-badge">Otillracklig data</span> : null}
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderRaceTab() {
    return (
      <section className="tab-section">
        <div className="track-tabs">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              className={`track-tab ${String(track.id) === trackId ? "is-active" : ""}`}
              onClick={() => selectTrack(String(track.id))}
            >
              <span>{track.name}</span>
              {trackAlerts[track.id] ? <small>{trackAlerts[track.id]}</small> : null}
            </button>
          ))}
        </div>

        {selectedTrack ? (
          <>
            <div className="race-hero-bar">
              <div className="race-hero-main">
                <div className="race-hero-title-row">
                  <h2 className="race-hero-title">LOPP {selectedRace?.raceNumber || "-"}</h2>
                  <span className="race-hero-meta">{formatTime(selectedRace?.startTime)} · {selectedTrack.name} · Spel</span>
                  <span className="flag-chip">SE</span>
                </div>
                <div className="race-hero-subrow">
                  <strong className="countdown-highlight">START OM {countdown.label}</strong>
                  <span className="status-chip">{selectedRace?.status || "Stabil"}</span>
                </div>
              </div>
              <div className="race-hero-side">
                <strong>A1/A2 låses vid 1:00</strong>
                <span>Modell: Trendranking + Momentum</span>
                <span>Första uppclock: {formatTime(firstOddsRegisteredAt ?? undefined)} · Nu: {formatClockTime(nowMs)} · {minutesToLock === null ? "-" : `${minutesToLock} min kvar`}</span>
              </div>
            </div>

            <div className="race-toolbar">
              <div className="selector-panels">
                <div className="selector-panel">
                  <span className="selector-label">Bana</span>
                  <div className="race-chip-row">
                    {tracks.map((track) => (
                      <button
                        key={`toolbar-${track.id}`}
                        type="button"
                        className={`race-chip selector-track-chip ${String(track.id) === trackId ? "is-active" : ""}`}
                        onClick={() => selectTrack(String(track.id))}
                      >
                        {track.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="selector-panel">
                  <span className="selector-label">Lopp</span>
                  <div className="race-chip-row">
                    {(selectedTrackMeetingRefs.length ? selectedTrackMeetingRefs : selectedTrackRaces).map((raceRef) => {
                      const number = raceRef.raceNumber;
                      const raceRefId = "raceId" in raceRef ? raceRef.raceId : raceRef.id;
                      const mappedRace = selectedTrackRaces.find((race) =>
                        (raceRefId && race.id === raceRefId) || race.raceNumber === number,
                      );
                      const raceIdentity = mappedRace?.id ?? String(number);
                      return (
                        <button
                          key={`${selectedTrack.id}-${number}`}
                          type="button"
                          className={`race-chip ${String(number) === raceNumber ? "is-active" : ""}`}
                          onClick={() => selectRaceForTrack(selectedTrack, raceIdentity)}
                        >
                          {number}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="race-status-grid">
                <div><span>Start</span><strong>{formatTime(selectedRace?.startTime)}</strong></div>
                <div><span>Nedrakning</span><strong>{countdown.label}</strong></div>
                <div><span>Status</span><strong>{selectedRace?.status || "Vantar"}</strong></div>
                <div><span>Forsta odds</span><strong>{formatTime(firstOddsRegisteredAt ?? undefined)}</strong></div>
                <div><span>Lasning om</span><strong>{minutesToLock === null ? "-" : `${minutesToLock} min`}</strong></div>
                <div><span>Live</span><strong>{updated || "-"}</strong></div>
              </div>
            </div>

            {selectedRace ? (
              <>
                <div className="race-layout">
                  <div className="race-main-panel">
                    <div className="compact-table-header compact-grid-row">
                      <span>Nr</span>
                      <span>Hast / kusk</span>
                      <span>Startodds</span>
                      <span>V-odds</span>
                      <span>Sankning %</span>
                      <span>Trend 60 min</span>
                      <span>Jamnhet CV %</span>
                      <span>Statistik indikatorer</span>
                      <span>Styrka</span>
                      <span>Mark.</span>
                    </div>

                    <div className="compact-table-body">
                      {trendRunners.map((runner) => {
                        const rowKey = `${selectedRace.id}-${runner.number}`;
                        const isA1 = candidates[0]?.number === runner.number;
                        const isA2 = candidates[1]?.number === runner.number;
                        const runnerInfo = raceInsights.byRunner[runner.number];
                        const isExpanded = expandedRunnerKey === rowKey;
                        const consistency = runnerInfo?.consistency;

                        return (
                          <div key={rowKey} className={`compact-row ${isA1 ? "is-a1" : ""} ${isA2 ? "is-a2" : ""} ${runner.scratched ? "is-scratched" : ""}`}>
                            <div
                              role="button"
                              tabIndex={0}
                              className="compact-grid-row compact-row-button"
                              onClick={() => setExpandedRunnerKey((current) => current === rowKey ? null : rowKey)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setExpandedRunnerKey((current) => current === rowKey ? null : rowKey);
                                }
                              }}
                            >
                              <span className="number-pill">{runner.number}</span>
                              <span className="runner-name-cell">
                                <span className="runner-title-line">
                                  {(isA1 || isA2) ? <span className={`inline-tag ${isA1 ? "a1" : "a2"}`}>{isA1 ? "A1" : "A2"}</span> : null}
                                  <strong>{runner.name}</strong>
                                </span>
                                <small>{runner.driver}</small>
                              </span>
                              <span>{formatOdds(runner.firstOdds)}</span>
                              <span>{formatOdds(runner.odds)}</span>
                              <span className={`change-value ${runner.changePercent === null ? "is-neutral" : runner.changePercent < -0.05 ? "is-down" : runner.changePercent > 0.05 ? "is-up" : "is-neutral"}`}>{formatPercent(runner.changePercent)}</span>
                              <span className="sparkline-cell">
                                <svg viewBox="0 0 96 24" className="sparkline-svg" aria-hidden="true">
                                  <path d={sparklinePoints(runner.historyOdds)} fill="none" stroke={runner.changePercent !== null && runner.changePercent < 0 ? "#55e89a" : runner.changePercent !== null && runner.changePercent > 0 ? "#ff9a5a" : "#9db3a8"} strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              </span>
                              <span>{consistency == null ? "-" : consistency.toFixed(2).replace(".", ",")}</span>
                              <span>{renderIndicators(runner)}</span>
                              <span className="strength-cell" title={`Styrka: ${runnerStrength(runner)} av 6 positiva indikatorer`}>
                                <strong>{runnerStrength(runner)}/6</strong>
                                <span className="strength-dots">{renderStrengthDots(runnerStrength(runner))}</span>
                              </span>
                              <span className="candidate-cell">
                                {isA1 ? <span className="candidate-badge a1">A1</span> : null}
                                {isA2 ? <span className="candidate-badge a2">A2</span> : null}
                                {raceInsights.smoothest?.number === runner.number ? <span className="comment-mark smoothest">J</span> : null}
                                {raceInsights.biggestDrop?.number === runner.number ? <span className="comment-mark drop">S</span> : null}
                                {!isA1 && !isA2 ? <span className="candidate-badge neutral">-</span> : null}
                              </span>
                            </div>

                            {isExpanded ? (
                              <div className="expanded-row">
                                <div className="expanded-grid">
                                  <span>Forsta odds till nu: {formatOdds(runner.firstOdds)} till {formatOdds(runner.odds)}</span>
                                  <span>Momentum: {momentumDisplay(runner.momentum)}</span>
                                  <span>Jamnhet: {consistency == null ? "Saknas" : consistency.toFixed(2).replace(".", ",")}</span>
                                  <span>Oddsmodell: {runner.modelScore ?? "Saknas"}</span>
                                </div>
                                <div className="expanded-stat-list">
                                  {(runnerInfo?.indicators ?? []).map((indicator) => (
                                    <span key={`${rowKey}-${indicator.key}`}>
                                      {indicator.label}: {formatStatValue(indicator.key, indicator.value)}{indicator.rank ? ` · Rank ${indicator.rank}/${indicator.available}` : ""}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <aside className="race-side-panel">
                    <section className="side-card">
                      <div className="side-card-title">A1 & A2 just nu</div>
                      <div className="candidate-summary">
                        <span>A1</span>
                        <strong>{candidates[0] ? `${candidates[0].number}. ${candidates[0].name}` : "Ingen kandidat"}</strong>
                        <small>{candidates[0] ? `${formatOdds(candidates[0].odds)} · ${formatPercent(candidates[0].changePercent)} · ${runnerStrength(candidates[0])}/6` : "-"}</small>
                      </div>
                      <div className="candidate-summary a2">
                        <span>A2</span>
                        <strong>{candidates[1] ? `${candidates[1].number}. ${candidates[1].name}` : "Ingen tillrackligt tydlig A2"}</strong>
                        <small>{candidates[1] ? `${formatOdds(candidates[1].odds)} · ${formatPercent(candidates[1].changePercent)} · ${runnerStrength(candidates[1])}/6` : "Modellen tvingar inte fram A2"}</small>
                      </div>
                      <div className="odds-highlight-card">
                        <span>KOMBODDS</span>
                        <strong>-</strong>
                        <small>Fylls i journalen efter traff vid manuell resultatregistrering.</small>
                      </div>
                      <button
                        type="button"
                        onClick={lockCurrentSelection}
                        disabled={!candidates[0] || !candidates[1]}
                        style={{ ...s.button, marginBottom: 0, background: "#ff6b00", color: "#fff", opacity: !candidates[0] || !candidates[1] ? 0.45 : 1 }}
                      >
                        {lockedSelection ? `A1/A2 låst ${lockedSelection.lockedAt}` : "Lås A1 & A2"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshSelectedRace()}
                        disabled={loadingOdds || !selectedRace}
                        style={{ ...s.refreshButton, width: "100%", minHeight: 44, opacity: loadingOdds || !selectedRace ? 0.45 : 1 }}
                      >
                        {loadingOdds ? "Uppdaterar lopp..." : "Uppdatera lopp"}
                      </button>
                    </section>

                    <section className="side-card">
                      <div className="side-card-title">Jamnaste hast</div>
                      <strong>{raceInsights.smoothest ? `${raceInsights.smoothest.number}. ${raceInsights.smoothest.name}` : "Saknas"}</strong>
                      <small>{raceInsights.smoothest ? `${(raceInsights.byRunner[raceInsights.smoothest.number]?.consistency ?? 0).toFixed(2).replace(".", ",")} · ${formatPercent(raceInsights.smoothest.changePercent)}` : "For lite oddshistorik"}</small>
                    </section>

                    <section className="side-card">
                      <div className="side-card-title">Mest sankta</div>
                      <strong>{raceInsights.biggestDrop ? `${raceInsights.biggestDrop.number}. ${raceInsights.biggestDrop.name}` : "Saknas"}</strong>
                      <small>{raceInsights.biggestDrop ? `${formatOdds(raceInsights.biggestDrop.firstOdds)} till ${formatOdds(raceInsights.biggestDrop.odds)} · ${formatPercent(raceInsights.biggestDrop.changePercent)}` : "Ingen trend an"}</small>
                    </section>

                    <section className="side-card legend-card">
                      <div className="side-card-title">Statistik indikatorer</div>
                      {STAT_DEFINITIONS.map((definition) => (
                        <span key={definition.key}>{definition.shortLabel}: {definition.label}</span>
                      ))}
                      <small>Grönt = topp 4 i loppet. G rankas med lägst värde som bäst.</small>
                    </section>
                  </aside>
                </div>

                <section className="result-card">
                  <div className="panel-header-row">
                    <div>
                      <p style={s.kicker}>RESULTAT</p>
                      <h3 className="minor-heading">Ratta lopp och journal</h3>
                    </div>
                    <span className="panel-meta-chip">Nasta liveuppdatering om {secondsToRefresh}s</span>
                  </div>

                  {lockedSelection ? (
                    <>
                      <div className="locked-strip">
                        <strong>A1 {lockedSelection.a1.number}. {lockedSelection.a1.name}</strong>
                        <strong>A2 {lockedSelection.a2.number}. {lockedSelection.a2.name}</strong>
                        <span>Last {lockedSelection.lockedAt}</span>
                      </div>
                      <div className="result-grid">
                        <label style={s.label}>
                          1:a i mal
                          <select value={firstNumber} onChange={(event) => setFirstNumber(event.target.value)} style={s.input}>
                            <option value="">Valj vinnare</option>
                            {selectedRace.runners.filter((runner) => !runner.scratched).map((runner) => (
                              <option key={`first-${runner.number}`} value={runner.number}>{runner.number}. {runner.name}</option>
                            ))}
                          </select>
                        </label>
                        <label style={s.label}>
                          2:a i mal
                          <select value={secondNumber} onChange={(event) => setSecondNumber(event.target.value)} style={s.input}>
                            <option value="">Valj tvaa</option>
                            {selectedRace.runners.filter((runner) => !runner.scratched).map((runner) => (
                              <option key={`second-${runner.number}`} value={runner.number}>{runner.number}. {runner.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="result-grid">
                        <label style={s.label}>
                          Kombodds
                          <input value={comboOddsInput} onChange={(event) => setComboOddsInput(event.target.value)} inputMode="decimal" placeholder="Exempel 5,30" style={s.input} />
                        </label>
                      </div>
                      <div className="result-footer-row">
                        <div className="side-inline-value">Journal och ROI-berakningen ar oforandrad.</div>
                        <button type="button" onClick={saveResult} style={{ ...s.button, width: "auto", paddingInline: 20, marginBottom: 0 }}>Spara lopp</button>
                      </div>
                    </>
                  ) : (
                    <p style={s.muted}>Las A1 och A2 fore start. Resultatkontrollen och journalen ar oforandrade.</p>
                  )}
                </section>
              </>
            ) : (
              <div className="empty-state-card">
                <strong>Valj ett lopp for att visa liveanalysen.</strong>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-card">
            <strong>Hamta svenska banor for att starta kvallsvyn.</strong>
          </div>
        )}
      </section>
    );
  }

  function renderJournalTab() {
    return (
      <section className="tab-section">
        <div className="panel-header-row">
          <div>
            <p style={s.kicker}>SPELJOURNAL</p>
            <h2 style={s.raceTitle}>Kombinationshistorik</h2>
          </div>
          <div className="panel-meta-row">
            <span>{savedBets.length} lopp</span>
            <span>{journalTotals.hits} traffar</span>
          </div>
        </div>
        <div className="mini-stats-grid">
          <div className="mini-stat-card"><span>Insats</span><strong>{journalTotals.stake.toFixed(0)} kr</strong></div>
          <div className="mini-stat-card"><span>Ater</span><strong>{journalTotals.returnAmount.toFixed(0)} kr</strong></div>
          <div className="mini-stat-card"><span>Netto</span><strong>{journalTotals.net >= 0 ? "+" : ""}{journalTotals.net.toFixed(0)} kr</strong></div>
          <div className="mini-stat-card"><span>ROI</span><strong>{journalTotals.roi.toFixed(1).replace(".", ",")} %</strong></div>
        </div>
        <div className="history-list-compact">
          {savedBets.length ? savedBets.map((bet) => (
            <article key={bet.id} className="history-row-card">
              <div>
                <strong>{bet.date} · {bet.trackName} · Lopp {bet.raceNumber}</strong>
                <span>A1 {bet.a1Number}. {bet.a1Name} · A2 {bet.a2Number}. {bet.a2Name}</span>
                <span>{betResultLabel(bet)} · Kombodds {bet.comboOdds?.toFixed(2).replace(".", ",") ?? "-"}</span>
                <span>Insats {bet.stake} kr · Ater {bet.returnAmount.toFixed(0)} kr · Netto {bet.net >= 0 ? "+" : ""}{bet.net.toFixed(0)} kr</span>
                {bet.needsComboOdds ? (
                  <div className="pending-row-inline">
                    <input
                      value={pendingOddsInputs[bet.id] ?? ""}
                      onChange={(event) => setPendingOddsInputs((current) => ({ ...current, [bet.id]: event.target.value }))}
                      placeholder="Ange kombodds"
                      style={s.pendingOddsInput}
                    />
                    <button type="button" onClick={() => finalizeComboOdds(bet.id)} style={s.pendingOddsButton}>Rakna klart</button>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => deleteSavedBet(bet.id)} className="delete-lite">Ta bort</button>
            </article>
          )) : <p style={s.muted}>Inga kombinationsspel ar sparade an.</p>}
        </div>
      </section>
    );
  }

  function renderStatsTab() {
    return (
      <section className="tab-section">
        <div className="panel-header-row">
          <div>
            <p style={s.kicker}>STATISTIK</p>
            <h2 style={s.raceTitle}>Total utfall</h2>
          </div>
          <div className="panel-meta-row">
            <span>Databas {dbStatus.startsWith("✅") ? "ansluten" : dbStatus}</span>
          </div>
        </div>
        <div className="mini-stats-grid">
          <div className="mini-stat-card"><span>Genomforda lopp</span><strong>{savedBets.length}</strong></div>
          <div className="mini-stat-card"><span>Traffar</span><strong>{journalTotals.hits}</strong></div>
          <div className="mini-stat-card"><span>Insats</span><strong>{journalTotals.stake.toFixed(0)} kr</strong></div>
          <div className="mini-stat-card"><span>Aterbetalning</span><strong>{journalTotals.returnAmount.toFixed(0)} kr</strong></div>
          <div className="mini-stat-card"><span>Netto</span><strong>{journalTotals.net >= 0 ? "+" : ""}{journalTotals.net.toFixed(0)} kr</strong></div>
          <div className="mini-stat-card"><span>ROI</span><strong>{journalTotals.roi.toFixed(1).replace(".", ",")} %</strong></div>
          <div className="mini-stat-card"><span>Vantar pa odds</span><strong>{savedBets.filter((bet) => bet.needsComboOdds).length}</strong></div>
          <div className="mini-stat-card"><span>Bakgrundsinsaml.</span><strong>{raceCollectionSummary.active}</strong></div>
        </div>
      </section>
    );
  }

  if (activeTab) {
    return (
      <main style={s.page}>
        <section style={{ ...s.card, maxWidth: 1480, padding: 6 }}>
          <div className="top-nav-shell">
            <div className="app-headline">
              <div>
                <p style={s.kicker}>KOMBEN LIVE</p>
                <h1 className="app-title-compact">KOMBEN Live</h1>
              </div>
              <div className="top-status-group">
                <span className="live-pill">LIVE</span>
                <span className="top-status-text">Svenska banor · lokal uppdatering var 60s · {formatClockTime(nowMs)}</span>
              </div>
            </div>

            <div className="top-toolbar-row">
              <div className="top-toolbar-controls">
                <label className="toolbar-field">
                  <span>Datum</span>
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} style={s.input} />
                </label>
                <button type="button" onClick={() => void loadTracks()} disabled={loadingTracks} style={{ ...s.button, width: "auto", paddingInline: 18, marginBottom: 0, opacity: loadingTracks ? 0.65 : 1 }}>
                  {loadingTracks ? "Hamtar banor..." : "Hamta banor"}
                </button>
                <button type="button" onClick={() => void refreshSelectedRace()} disabled={!selectedRace || loadingOdds} style={{ ...s.refreshButton, opacity: !selectedRace || loadingOdds ? 0.6 : 1 }}>
                  {loadingOdds ? "Uppdaterar..." : "Uppdatera lopp"}
                </button>
                {error ? (
                  <button type="button" onClick={() => void retryLatestFetch()} disabled={loadingTracks || loadingRaces || loadingOdds} style={{ ...s.refreshButton, opacity: loadingTracks || loadingRaces || loadingOdds ? 0.6 : 1 }}>
                    Försök igen
                  </button>
                ) : null}
              </div>
              <div className="toolbar-health">{autoStatus}</div>
            </div>

            <nav className="top-nav-tabs" aria-label="Huvudmeny">
              {APP_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`top-nav-tab ${activeTab === tab.id ? "is-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {error ? (
            <div style={s.error}>
              <span>{error}</span>
              <button type="button" onClick={() => void retryLatestFetch()} disabled={loadingTracks || loadingRaces || loadingOdds} style={{ ...s.refreshButton, marginTop: 8, opacity: loadingTracks || loadingRaces || loadingOdds ? 0.6 : 1 }}>
                Försök igen
              </button>
            </div>
          ) : null}

          {activeTab === "overview" ? renderOverviewTab() : null}
          {activeTab === "race" ? renderRaceTab() : null}
          {activeTab === "journal" ? renderJournalTab() : null}
          {activeTab === "stats" ? renderStatsTab() : null}

          <footer className="footer-compact">
            <span>Banor {tracks.length}</span>
            <span>Vald bana {selectedTrack?.name || "-"}</span>
            <span>Senast {updated || "-"}</span>
            <span>Bakgrund {backgroundCollecting ? "hamtar" : "aktiv"}</span>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <section style={s.card}>
        <header style={s.header}>
          <div>
            <p style={s.kicker}>LIVEODDS FRÅN ATG</p>
            <h1 style={s.title}>🏇 KOMBEN Live</h1>
            <p style={s.debugStamp}>Swedish meetings: {swedishMeetingsCount}</p>
            <p style={s.debugStamp}>Swedish races: {swedishRacesCount}</p>
          </div>
          <span style={s.live}>LIVE</span>
        </header>

        <div style={s.filterBanner}>
          <strong>LANDSFILTER AKTIVT</strong>
          <span>Alla svenska meetings och lopp för valt datum visas. Ingen filtrering sker på spelprodukt.</span>
        </div>

        <div style={s.autoBanner}>
          <strong>🤖 HELKVÄLLSAUTOMATIK</strong>
          <span>{autoStatus}</span>
          <small>A1/A2 låses vid 1:00. Resultat rättas när ATG visar placeringarna. Vid träff fyller du i komboddset i journalen.</small>
        </div>

        <div style={s.controls}>
          <label style={s.label}>
            Datum
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              style={s.input}
            />
          </label>

          <button
            type="button"
            onClick={() => void loadTracks()}
            disabled={loadingTracks}
            style={{
              ...s.button,
              opacity: loadingTracks ? 0.6 : 1,
            }}
          >
            {loadingTracks ? "Hämtar banor…" : "Hämta banor"}
          </button>

          <label style={s.label}>
            Välj bana
            <select
              value={trackId}
              onChange={(event) => setTrackId(event.target.value)}
              disabled={loadingTracks || !tracks.length}
              style={s.input}
            >
              <option value="">
                {tracks.length
                  ? `Välj bland ${tracks.length} banor`
                  : "Inga banor laddade"}
              </option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.countryCode} · {track.name} · {track.products.join("/") || "Spel"}
                </option>
              ))}
            </select>
          </label>

          {selectedTrack && (
            <label style={s.label}>
              Välj lopp
              <select
                value={selectedRaceId}
                onChange={(event) => {
                  const nextRaceId = event.target.value;
                  setSelectedRaceId(nextRaceId);
                  if (selectedTrack && nextRaceId) {
                    setSelectedRaceByTrack((current) => ({ ...current, [String(selectedTrack.id)]: nextRaceId }));
                  }
                }}
                disabled={loadingRaces || !races.length}
                style={s.input}
              >
                <option value="">
                  {loadingRaces
                    ? "Hämtar lopp…"
                    : races.length
                      ? `Välj bland ${races.length} lopp`
                      : "Inga lopp hittade"}
                </option>
                {races.map((race) => (
                  <option key={race.id} value={race.id}>
                    Lopp {race.raceNumber} · {formatTime(race.startTime)}
                  </option>
                ))}
              </select>
              <span style={s.manualHint}>Valt lopp ligger kvar tills du själv byter.</span>
            </label>
          )}
        </div>

        {error && (
          <div style={s.error}>
            <span>{error}</span>
            <button type="button" onClick={() => void retryLatestFetch()} disabled={loadingTracks || loadingRaces || loadingOdds} style={{ ...s.refreshButton, marginTop: 8, opacity: loadingTracks || loadingRaces || loadingOdds ? 0.6 : 1 }}>
              Försök igen
            </button>
          </div>
        )}

        {selectedTrack && (
          <div style={s.collectionBanner}>
            <div>
              <span style={s.small}>BAKGRUNDSINSAMLING</span>
              <strong>
                {backgroundCollecting
                  ? "Hämtar godkända lopp…"
                  : "Endast svenska mållopp bevakas"}
              </strong>
            </div>
            <span style={s.collectionText}>
              {raceCollectionSummary.active} lopp samlas in nu ·{" "}
              {raceCollectionSummary.waiting} väntar · Senast{" "}
              {allRacesUpdated || "väntar"}
            </span>
          </div>
        )}

        {selectedTrack && (
          <div style={s.trackBar}>
            <div>
              <span style={s.small}>VALD BANA</span>
              <strong>
                {selectedTrack.name} · {selectedTrack.products.join("/")}
              </strong>
            </div>
            <div>
              <span style={s.small}>BAN-ID</span>
              <strong>{selectedTrack.id}</strong>
            </div>
            <div>
              <span style={s.small}>FÖRSTA START</span>
              <strong>{formatTime(selectedTrack.startTime)}</strong>
            </div>
          </div>
        )}

        {selectedRace ? (
          <section style={s.racePanel}>
            <div style={s.raceHeader}>
              <div>
                <p style={s.kicker}>VINNARODDS</p>
                <h2 style={s.raceTitle}>
                  {selectedTrack?.name} · Lopp {selectedRace.raceNumber}
                </h2>
                <p style={s.muted}>
                  Start {formatTime(selectedRace.startTime)}
                  {selectedRace.status ? ` · ${selectedRace.status}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void refreshSelectedRace()}
                disabled={loadingOdds}
                style={s.refreshButton}
              >
                {loadingOdds ? "Uppdaterar…" : "Uppdatera nu"}
              </button>
            </div>

            <div style={s.tableHeader}>
              <span>Nr</span>
              <span>Häst / kusk</span>
              <span style={s.alignRight}>Förändring</span>
            </div>

            <div style={s.trendLegend}>
              <span><strong style={{ color: "#4ade80" }}>GRÖNT ↓</strong> = totaloddset har sjunkit, hästen stärks</span>
              <span><strong style={{ color: "#fb7185" }}>RÖTT ↑</strong> = totaloddset har stigit, hästen tappar</span>
              <span><strong style={{ color: "#f8fafc" }}>VITT →</strong> = i princip oförändrat</span>
            </div>

            <section
              style={{
                ...s.stablePressureCard,
                ...(stablePressureCandidate
                  ? s.marketAnalysisActive
                  : marketAnalysisProgress.active
                    ? s.marketAnalysisComplete
                    : s.marketAnalysisCollecting),
              }}
            >
              <div style={s.stablePressureIcon}>🛡</div>
              <div style={s.stablePressureContent}>
                <span style={s.stablePressureKicker}>MARKNADSANALYS</span>

                {stablePressureCandidate ? (
                  <>
                    <span style={s.marketAnalysisStatus}>🟢 Aktiv · Jämn oddssänkning</span>
                    <strong style={s.stablePressureName}>
                      {stablePressureCandidate.runner.number}. {stablePressureCandidate.runner.name}
                    </strong>
                    <span style={s.stablePressureOdds}>
                      {formatOdds(stablePressureCandidate.analysis.firstOdds)}
                      <span style={s.oddsArrow}>→</span>
                      {formatOdds(stablePressureCandidate.analysis.currentOdds)}
                      <strong style={s.stablePressureDrop}>
                        −{stablePressureCandidate.analysis.totalDropPercent.toFixed(1).replace(".", ",")} %
                      </strong>
                    </span>
                    <span style={s.stablePressureStats}>
                      Stabilitet: {clamp(Math.round(stablePressureCandidate.analysis.score), 0, 100)}/100 · {stablePressureCandidate.analysis.measurementCount} minuter analyserade
                    </span>
                    <span style={s.stablePressureNotice}>
                      Jämnast tydliga sänkning i loppet · informationssignal, inte automatiskt platsspel
                    </span>
                  </>
                ) : marketAnalysisProgress.active ? (
                  <>
                    <span style={s.marketAnalysisStatus}>🔎 Analys aktiv</span>
                    <strong style={s.stablePressureName}>
                      Ingen tydlig signal just nu
                    </strong>
                    <span style={s.stablePressureStats}>
                      {marketAnalysisProgress.measurementCount} mätpunkter ·{" "}
                      {marketAnalysisProgress.observedMinutes} minuter observerade
                    </span>
                    <span style={s.stablePressureNotice}>
                      Bedömningen fortsätter att uppdateras varje minut.
                    </span>
                  </>
                ) : (
                  <>
                    <span style={s.marketAnalysisStatus}>
                      ⏳ Startar marknadsanalys…
                    </span>
                    <strong style={s.stablePressureName}>
                      {marketAnalysisProgress.measurementCount
                        ? "Första oddset är sparat"
                        : "Väntar på första oddsmätningen"}
                    </strong>
                    <span style={s.stablePressureStats}>
                      Analysen behöver inte 60 minuter. Den startar när två
                      mätpunkter finns.
                    </span>
                    <span style={s.stablePressureNotice}>
                      Öppnas appen sent används tiden som finns kvar före start.
                    </span>
                  </>
                )}

                <span style={s.marketAnalysisFooter}>
                  Analyserar varje minut. Högst de sista 60 minuterna används.
                </span>
              </div>

              {stablePressureCandidate && (
                <span style={s.stablePressureSignal}>JÄMN<br />SÄNKNING</span>
              )}
            </section>

            <div style={s.runnerList}>
              {selectedRace.runners.length ? (
                trendRunners.map((runner) => {
                  const isA1 = candidates[0]?.number === runner.number;
                  const isA2 = candidates[1]?.number === runner.number;
                  const isFavorite = favoriteRunner?.number === runner.number;
                  const hasStablePressure =
                    stablePressureCandidate?.runner.number === runner.number;

                  return (
                  <div
                    key={`${selectedRace.id}-${runner.number}`}
                    style={{
                      ...s.runnerRow,
                      ...(isA1 ? s.a1RunnerRow : isA2 ? s.a2RunnerRow : {}),
                      ...(hasStablePressure ? s.stablePressureRunnerRow : {}),
                      opacity: runner.scratched ? 0.45 : 1,
                    }}
                  >
                    <span style={s.numberBox}>{runner.number}</span>
                    <div>
                      <div style={s.runnerHeading}>
                        <strong style={s.runnerName}>{runner.name}</strong>
                        <div style={s.runnerBadges}>
                          {isA1 && <span style={s.a1Badge}>A1</span>}
                          {isA2 && <span style={s.a2Badge}>A2</span>}
                          {isFavorite && <span style={s.favoriteBadge}>★ FAVORIT</span>}
                          {hasStablePressure && (
                            <span style={s.stablePressureBadge}>🛡 JÄMN SÄNKNING</span>
                          )}
                        </div>
                      </div>
                      <span style={s.driver}>{runner.driver}</span>
                      <span style={s.firstToNow}>
                        Första uppmätta odds <strong>{formatOdds(runner.firstOdds)}</strong>
                        <span style={s.oddsArrow}>→</span>
                        Nu <strong>{formatOdds(runner.odds)}</strong>
                      </span>
                      <span style={s.radarLine}>
                        Trend: {momentumDisplay(runner.momentum)} · {runner.samples} minutpunkter
                      </span>
                      {!runner.scratched && runner.modelScore !== undefined && (
                        <div style={s.modelBox}>
                          <span style={s.modelScore}>
                            KOMBEN-score <strong>{runner.modelScore}</strong>/100
                          </span>
                          <span style={s.modelDecision}>
                            {runner.modelQualified ? "Kandidat" : "Avvakta"}
                          </span>
                          {runner.modelReasons?.length ? (
                            <span style={s.modelReasons}>{runner.modelReasons.slice(0, 2).join(" · ")}</span>
                          ) : null}
                        </div>
                      )}
                      <div style={s.checkpointRow}>
                        <span>
                          60m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                60,
                              ),
                            )}
                          </strong>
                        </span>
                        <span>
                          30m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                30,
                              ),
                            )}
                          </strong>
                        </span>
                        <span>
                          15m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                15,
                              ),
                            )}
                          </strong>
                        </span>
                        <span>
                          5m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                5,
                              ),
                            )}
                          </strong>
                        </span>
                      </div>
                    </div>
                    <div style={s.oddsCell}>
                      <strong
                        style={{
                          ...s.primaryChange,
                          color: totalTrendColor(runner.changePercent),
                        }}
                      >
                        {runner.scratched ? "STR" : formatPercent(runner.changePercent)}
                      </strong>
                      {!runner.scratched && (
                        <span
                          style={{
                            ...s.trendStatus,
                            color: totalTrendColor(runner.changePercent),
                          }}
                        >
                          {totalTrendArrow(runner.changePercent)} {trendStrengthLabel(runner.changePercent)}
                        </span>
                      )}
                      {!runner.scratched && (
                        <span style={s.currentOddsSmall}>
                          Nu {formatOdds(runner.odds)}
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })
              ) : (
                <p style={s.muted}>
                  Loppet hittades, men hästlistan kunde inte läsas ännu.
                </p>
              )}
            </div>

            {candidates[0] && !candidates[1] && (
              <div style={s.noPlayNotice}>
                <strong>Ingen A2 väljs.</strong> Modellen hittar bara en tillräckligt tydlig kandidat, därför blir det inget kombinationsspel.
              </div>
            )}
            {!candidates[0] && (
              <div style={s.noPlayNotice}>
                <strong>Inget spel.</strong> Ingen häst uppfyller modellens krav ännu.
              </div>
            )}

            <div style={s.lockBar}>
              <button
                type="button"
                onClick={lockCurrentSelection}
                disabled={!candidates[0] || !candidates[1]}
                style={{
                  ...s.button,
                  marginBottom: 0,
                  opacity: !candidates[0] || !candidates[1] ? 0.5 : 1,
                }}
              >
                {lockedSelection
                  ? `Låst ${lockedSelection.lockedAt}`
                  : "Lås A1 och A2"}
              </button>
            </div>

            <div style={s.comboPanel}>
              <div style={s.comboCard}>
                <span style={s.small}>PRELIMINÄR A1</span>
                <strong style={s.comboName}>
                  {candidates[0]
                    ? `${candidates[0].number}. ${candidates[0].name}`
                    : "Minst 3 mätningar krävs"}
                </strong>
                <span style={s.comboTrend}>
                  {candidates[0]
                    ? formatPercent(candidates[0].changePercent)
                    : "Vänta på fler uppdateringar"}
                </span>
              </div>

              <div style={s.comboCard}>
                <span style={s.small}>PRELIMINÄR A2</span>
                <strong style={s.comboName}>
                  {candidates[1]
                    ? `${candidates[1].number}. ${candidates[1].name}`
                    : "Minst 3 mätningar krävs"}
                </strong>
                <span style={s.comboTrend}>
                  {candidates[1]
                    ? formatPercent(candidates[1].changePercent)
                    : "Vänta på fler uppdateringar"}
                </span>
              </div>
            </div>

            <p style={s.disclaimer}>
              A1/A2 är fortfarande en teknisk trendrankning. Den väger nu
              samman total oddssänkning, senaste rörelsen och kortsiktigt momentum.
              Appen visar inte “pengar in”, eftersom oddsrörelse inte avslöjar exakt
              spelbelopp. Den riktiga KOMBEN-modellen låses först efter test mot
              verkliga lopp.
            </p>

            <section style={s.racePicturePanel}>
              <div style={s.racePictureHeader}>
                <div>
                  <p style={s.kicker}>LOPPBILD JUST NU</p>
                  <h3 style={s.pictureTitle}>A1, A2 och favoriten</h3>
                </div>
                <div style={s.headerStatusGroup}>
                  <div
                    style={{
                      ...s.countdownBox,
                      ...countdownStyle(),
                    }}
                  >
                    <span style={s.countdownLabel}>START OM</span>
                    <strong style={s.countdownTime}>{countdown.label}</strong>
                  </div>

                  <span style={s.pictureStatus}>
                    {favoriteRunner
                      ? favoriteBehavior(favoriteRunner.changePercent)
                      : "Väntar"}
                  </span>
                </div>
              </div>

              <div style={s.pictureGrid}>
                <article style={s.pictureCard}>
                  <span style={s.small}>A1</span>
                  <strong style={s.pictureName}>
                    {candidates[0]
                      ? `${candidates[0].number}. ${candidates[0].name}`
                      : "För lite data"}
                  </strong>
                  <span style={s.pictureLine}>
                    Nu: <strong>{candidates[0] ? formatOdds(candidates[0].odds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Start: <strong>{candidates[0] ? formatOdds(candidates[0].firstOdds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Förändring:{" "}
                    <strong
                      style={{
                        color:
                          (candidates[0]?.changePercent ?? 0) < 0 ? "#4ade80" : "#fb7185",
                      }}
                    >
                      {candidates[0] ? formatPercent(candidates[0].changePercent) : "–"}
                    </strong>
                  </span>
                  <span style={s.pictureLine}>
                    Momentum: <strong>{candidates[0]?.momentum ?? "–"}</strong>
                  </span>
                </article>

                <article style={s.pictureCard}>
                  <span style={s.small}>A2</span>
                  <strong style={s.pictureName}>
                    {candidates[1]
                      ? `${candidates[1].number}. ${candidates[1].name}`
                      : "För lite data"}
                  </strong>
                  <span style={s.pictureLine}>
                    Nu: <strong>{candidates[1] ? formatOdds(candidates[1].odds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Start: <strong>{candidates[1] ? formatOdds(candidates[1].firstOdds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Förändring:{" "}
                    <strong
                      style={{
                        color:
                          (candidates[1]?.changePercent ?? 0) < 0 ? "#4ade80" : "#fb7185",
                      }}
                    >
                      {candidates[1] ? formatPercent(candidates[1].changePercent) : "–"}
                    </strong>
                  </span>
                  <span style={s.pictureLine}>
                    Momentum: <strong>{candidates[1]?.momentum ?? "–"}</strong>
                  </span>
                </article>

                <article style={s.favoriteCard}>
                  <span style={s.small}>ODDSFAVORIT</span>
                  <strong style={s.pictureName}>
                    {favoriteRunner
                      ? `${favoriteRunner.number}. ${favoriteRunner.name}`
                      : "För lite data"}
                  </strong>
                  <span style={s.pictureLine}>
                    Nu: <strong>{favoriteRunner ? formatOdds(favoriteRunner.odds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Start: <strong>{favoriteRunner ? formatOdds(favoriteRunner.firstOdds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Förändring:{" "}
                    <strong
                      style={{
                        color:
                          (favoriteRunner?.changePercent ?? 0) < 0 ? "#4ade80" : "#fb7185",
                      }}
                    >
                      {favoriteRunner ? formatPercent(favoriteRunner.changePercent) : "–"}
                    </strong>
                  </span>
                  <span style={s.pictureLine}>
                    Beteende:{" "}
                    <strong>
                      {favoriteRunner ? favoriteBehavior(favoriteRunner.changePercent) : "–"}
                    </strong>
                  </span>
                </article>
              </div>

              <div style={s.racePictureConclusion}>
                <span style={s.small}>TOLKNING</span>
                <strong>{racePictureText}</strong>
              </div>
            </section>

            <section style={s.resultPanel}>
              <p style={s.kicker}>RESULTAT & SPELJOURNAL</p>

              {lockedSelection ? (
                <>
                  <div style={s.lockedInfo}>
                    <strong>A1: {lockedSelection.a1.number}. {lockedSelection.a1.name}</strong>
                    <strong>A2: {lockedSelection.a2.number}. {lockedSelection.a2.name}</strong>
                    <span style={s.muted}>Låst {lockedSelection.lockedAt}</span>
                  </div>

                  <div style={s.resultGrid}>
                    <label style={s.label}>
                      1:a i mål
                      <select value={firstNumber} onChange={(e) => setFirstNumber(e.target.value)} style={s.input}>
                        <option value="">Välj vinnare</option>
                        {selectedRace.runners.filter((r) => !r.scratched).map((r) => (
                          <option key={`first-${r.number}`} value={r.number}>
                            {r.number}. {r.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={s.label}>
                      2:a i mål
                      <select value={secondNumber} onChange={(e) => setSecondNumber(e.target.value)} style={s.input}>
                        <option value="">Välj tvåa</option>
                        {selectedRace.runners.filter((r) => !r.scratched).map((r) => (
                          <option key={`second-${r.number}`} value={r.number}>
                            {r.number}. {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label style={s.label}>
                    Kombodds för rätt ordning
                    <input
                      value={comboOddsInput}
                      onChange={(e) => setComboOddsInput(e.target.value)}
                      inputMode="decimal"
                      placeholder="Exempel: 12,40"
                      style={s.input}
                    />
                  </label>

                  <button type="button" onClick={saveResult} style={s.button}>
                    Spara lopp
                  </button>

                  <p style={s.disclaimer}>
                    Insatsen räknas som 50 kr på A1–A2 och 50 kr på A2–A1,
                    totalt 100 kr. Kombodds behövs endast vid träff.
                  </p>
                </>
              ) : (
                <p style={s.muted}>
                  Lås A1 och A2 före start. Därefter kan resultat och kombodds sparas här.
                </p>
              )}
            </section>

            <div style={s.refreshInfo}>
              <span>Alla lopp uppdateras varje minut</span>
              <strong>Nästa om {secondsToRefresh} s</strong>
            </div>
          </section>
        ) : (
          <div style={s.emptyPanel}>
            <p style={s.kicker}>STATUS</p>
            <h2 style={s.raceTitle}>
              {loadingRaces
                ? "Letar efter lopp…"
                : selectedTrack
                  ? "Välj ett lopp"
                  : "Välj en bana"}
            </h2>
            <p style={s.muted}>
              När loppet är valt visas hästar och liveodds här.
            </p>
          </div>
        )}

        <section style={s.journalPanel}>
          <div style={s.journalHeader}>
            <div>
              <p style={s.kicker}>TOTAL STATISTIK</p>
              <h2 style={s.raceTitle}>Speljournal</h2>
            </div>
            <strong>{savedBets.length} lopp</strong>
          </div>

          <div style={s.statsGrid}>
            <div style={s.statCard}><span style={s.small}>TRÄFFAR</span><strong>{journalTotals.hits}</strong></div>
            <div style={s.statCard}><span style={s.small}>INSATS</span><strong>{journalTotals.stake.toFixed(0)} kr</strong></div>
            <div style={s.statCard}><span style={s.small}>ÅTERBETALNING</span><strong>{journalTotals.returnAmount.toFixed(0)} kr</strong></div>
            <div style={s.statCard}><span style={s.small}>VÄNTAR ODDS</span><strong>{savedBets.filter((bet) => bet.needsComboOdds).length}</strong></div>
            <div style={s.statCard}>
              <span style={s.small}>NETTO</span>
              <strong style={{ color: journalTotals.net >= 0 ? "#4ade80" : "#fb7185" }}>
                {journalTotals.net >= 0 ? "+" : ""}{journalTotals.net.toFixed(0)} kr
              </strong>
            </div>
            <div style={s.statCard}>
              <span style={s.small}>ROI</span>
              <strong style={{ color: journalTotals.roi >= 0 ? "#4ade80" : "#fb7185" }}>
                {journalTotals.roi >= 0 ? "+" : ""}{journalTotals.roi.toFixed(1).replace(".", ",")} %
              </strong>
            </div>
          </div>

          <div style={s.historyList}>
            {savedBets.length ? savedBets.map((bet) => (
              <article key={bet.id} style={s.historyCard}>
                <div>
                  <strong>{bet.date} · {bet.trackName} · Lopp {bet.raceNumber}</strong>
                  <span style={s.historyLine}>A1 {bet.a1Number}. {bet.a1Name} · A2 {bet.a2Number}. {bet.a2Name}</span>
                  <span style={s.historyLine}>{betResultLabel(bet)}</span>
                  <span style={s.historyLine}>
                    Kombodds {bet.comboOdds?.toFixed(2).replace(".", ",") ?? "–"} · Åter {bet.returnAmount.toFixed(0)} kr · Netto {bet.net >= 0 ? "+" : ""}{bet.net.toFixed(0)} kr
                  </span>
                  {bet.needsComboOdds && (
                    <div style={s.pendingOddsRow}>
                      <input
                        value={pendingOddsInputs[bet.id] ?? ""}
                        onChange={(event) => setPendingOddsInputs((current) => ({ ...current, [bet.id]: event.target.value }))}
                        placeholder="Ange kombodds"
                        inputMode="decimal"
                        style={s.pendingOddsInput}
                      />
                      <button type="button" onClick={() => finalizeComboOdds(bet.id)} style={s.pendingOddsButton}>Räkna klart</button>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => deleteSavedBet(bet.id)} style={s.deleteButton}>Ta bort</button>
              </article>
            )) : <p style={s.muted}>Inga lopp är sparade ännu.</p>}
          </div>
        </section>

        <footer style={s.footer}>
          <span>
            Banor: <strong>{tracks.length}</strong>
          </span>
          <span>
            Lopp: <strong>{races.length}</strong>
          </span>
          <span>
            Uppdaterad: <strong>{updated || "–"}</strong>
          </span>
          <span>
            Databas: <strong>{dbStatus.startsWith("✅") ? "ansluten" : dbStatus}</strong>
          </span>
        </footer>
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "24px 14px",
    background: "linear-gradient(180deg, #09111f, #111827)",
    color: "#f8fafc",
    fontFamily:
      "Inter, Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    maxWidth: 680,
    color: "#f8fafc",
    margin: "0 auto",
    padding: 22,
    border: "1px solid #293548",
    borderRadius: 22,
    background: "#111827",
    boxShadow: "0 24px 70px rgba(0,0,0,.35)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 22,
  },
  kicker: {
    margin: "0 0 6px",
    color: "#22c55e",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: ".12em",
  },
  title: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "clamp(30px, 8vw, 42px)",
  },
  debugStamp: {
    margin: "6px 0 0",
    color: "#fde68a",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: ".04em",
  },
  live: {
    height: "fit-content",
    color: "#ffffff",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#ef4444",
    fontSize: 11,
    fontWeight: 900,
  },
  filterBanner: {
    display: "grid",
    gap: 4,
    marginBottom: 18,
    padding: "11px 13px",
    border: "1px solid #166534",
    borderRadius: 12,
    background: "rgba(22,101,52,.16)",
    color: "#f8fafc",
    fontSize: 12,
    lineHeight: 1.4,
  },
  autoBanner: {
    display: "grid",
    gap: 5,
    marginBottom: 18,
    padding: 14,
    border: "1px solid #3b82f6",
    borderRadius: 14,
    background: "rgba(30,64,175,.18)",
    color: "#f8fafc",
    textAlign: "center",
  },
  pendingOddsRow: {
    display: "flex",
    gap: 8,
    marginTop: 10,
  },
  pendingOddsInput: {
    minWidth: 0,
    flex: 1,
    height: 38,
    padding: "0 10px",
    border: "1px solid #475569",
    borderRadius: 9,
    background: "#0f172a",
    color: "#f8fafc",
  },
  pendingOddsButton: {
    height: 38,
    padding: "0 12px",
    border: 0,
    borderRadius: 9,
    background: "#22c55e",
    color: "#052e16",
    fontWeight: 900,
    cursor: "pointer",
  },
  controls: {
    display: "grid",
    gap: 2,
  },
  label: {
    display: "grid",
    gap: 4,
    marginBottom: 6,
    color: "#cbd5e1",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    colorScheme: "dark",
    minHeight: 28,
    boxSizing: "border-box",
    padding: "0 7px",
    border: "1px solid #334155",
    borderRadius: 9,
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: 13,
  },
  button: {
    width: "100%",
    minHeight: 28,
    marginBottom: 4,
    border: 0,
    borderRadius: 9,
    background: "#15803d",
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
  },
  error: {
    marginBottom: 14,
    padding: 12,
    border: "1px solid #7f1d1d",
    borderRadius: 12,
    background: "rgba(127,29,29,.3)",
    color: "#fecaca",
  },
  manualHint: {
    marginTop: 5,
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: 700,
  },
  collectionBanner: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    margin: "6px 0 12px",
    padding: 12,
    border: "1px solid #166534",
    borderRadius: 12,
    background: "rgba(22,101,52,.16)",
  },
  collectionText: {
    color: "#d1d5db",
    fontSize: 12,
    textAlign: "right",
  },
  trackBar: {
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr",
    gap: 12,
    margin: "6px 0 16px",
    padding: 14,
    border: "1px solid #263244",
    borderRadius: 14,
    background: "#0b1220",
  },
  small: {
    display: "block",
    marginBottom: 4,
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: ".09em",
  },
  racePanel: {
    color: "#f8fafc",
    border: "1px solid #263244",
    borderRadius: 16,
    overflow: "hidden",
    background: "#0b1220",
  },
  raceHeader: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    padding: 18,
  },
  raceTitle: {
    color: "#f8fafc",
    margin: "0 0 4px",
    fontSize: 25,
  },
  muted: {
    margin: 0,
    color: "#d1d5db",
    lineHeight: 1.5,
  },
  refreshButton: {
    minHeight: 26,
    padding: "0 7px",
    border: "1px solid #334155",
    borderRadius: 9,
    background: "#172033",
    color: "#f8fafc",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "48px 1fr 118px",
    gap: 12,
    padding: "10px 16px",
    borderTop: "1px solid #263244",
    borderBottom: "1px solid #263244",
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: ".08em",
    textTransform: "uppercase",
  },
  trendLegend: {
    display: "grid",
    gap: 4,
    padding: "10px 16px",
    borderBottom: "1px solid #263244",
    background: "#0f172a",
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1.35,
  },
  stablePressureCard: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    margin: 12,
    padding: 14,
    border: "1px solid rgba(163,230,53,.55)",
    borderLeft: "5px solid #a3e635",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(20,83,45,.72), rgba(15,23,42,.98))",
    boxShadow: "0 12px 28px rgba(0,0,0,.24)",
  },
  marketAnalysisCollecting: {
    borderColor: "rgba(250,204,21,.42)",
    borderLeftColor: "#facc15",
    background: "linear-gradient(135deg, rgba(113,63,18,.34), rgba(15,23,42,.98))",
  },
  marketAnalysisActive: {
    borderColor: "rgba(163,230,53,.55)",
    borderLeftColor: "#a3e635",
    background: "linear-gradient(135deg, rgba(20,83,45,.72), rgba(15,23,42,.98))",
  },
  marketAnalysisComplete: {
    borderColor: "rgba(148,163,184,.4)",
    borderLeftColor: "#94a3b8",
    background: "linear-gradient(135deg, rgba(51,65,85,.45), rgba(15,23,42,.98))",
  },
  marketAnalysisStatus: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 850,
  },
  marketAnalysisProgressTrack: {
    width: "100%",
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
    background: "rgba(148,163,184,.2)",
  },
  marketAnalysisProgressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #facc15, #a3e635)",
    transition: "width .35s ease",
  },
  marketAnalysisFooter: {
    marginTop: 3,
    paddingTop: 6,
    borderTop: "1px solid rgba(148,163,184,.18)",
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 1.4,
  },
  stablePressureIcon: {
    flex: "0 0 auto",
    fontSize: 29,
  },
  stablePressureContent: {
    display: "grid",
    flex: "1 1 250px",
    minWidth: 0,
    gap: 4,
  },
  stablePressureKicker: {
    color: "#bef264",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: ".12em",
  },
  stablePressureName: {
    color: "#f8fafc",
    fontSize: 19,
    lineHeight: 1.15,
  },
  stablePressureOdds: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: 800,
  },
  stablePressureDrop: {
    color: "#bef264",
    fontSize: 15,
  },
  stablePressureStats: {
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1.4,
  },
  stablePressureNotice: {
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 1.4,
  },
  stablePressureSignal: {
    flex: "0 0 auto",
    padding: "8px 10px",
    borderRadius: 10,
    background: "#a3e635",
    color: "#1a2e05",
    fontSize: 9,
    fontWeight: 950,
    lineHeight: 1.2,
    textAlign: "center",
    letterSpacing: ".06em",
  },
  alignRight: {
    textAlign: "right",
  },
  runnerList: {
    display: "grid",
  },
  runnerRow: {
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "48px 1fr 118px",
    alignItems: "center",
    gap: 12,
    minHeight: 62,
    padding: "8px 16px",
    borderBottom: "1px solid #1e293b",
  },
  a1RunnerRow: {
    background: "linear-gradient(90deg, rgba(34,197,94,0.13), transparent 65%)",
    boxShadow: "inset 4px 0 0 #4ade80",
  },
  a2RunnerRow: {
    background: "linear-gradient(90deg, rgba(56,189,248,0.11), transparent 65%)",
    boxShadow: "inset 4px 0 0 #38bdf8",
  },
  stablePressureRunnerRow: {
    borderLeft: "4px solid #a3e635",
  },
  numberBox: {
    color: "#f8fafc",
    display: "grid",
    placeItems: "center",
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#1e293b",
    fontSize: 18,
    fontWeight: 900,
  },
  runnerHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  runnerName: {
    color: "#f8fafc",
    display: "block",
    fontSize: 18,
    lineHeight: 1.15,
  },
  runnerBadges: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 4,
  },
  a1Badge: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#22c55e",
    color: "#052e16",
    fontSize: 10,
    fontWeight: 950,
  },
  a2Badge: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#38bdf8",
    color: "#082f49",
    fontSize: 10,
    fontWeight: 950,
  },
  favoriteBadge: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#facc15",
    color: "#422006",
    fontSize: 9,
    fontWeight: 950,
  },
  stablePressureBadge: {
    padding: "3px 7px",
    borderRadius: 999,
    background: "#a3e635",
    color: "#1a2e05",
    fontSize: 9,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  driver: {
    display: "block",
    marginTop: 3,
    color: "#d1d5db",
    fontSize: 13,
  },
  firstToNow: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 7,
    color: "#cbd5e1",
    fontSize: 12,
  },
  oddsArrow: {
    color: "#94a3b8",
    fontWeight: 900,
  },
  radarLine: {
    display: "block",
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1.35,
  },
  checkpointRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 12px",
    marginTop: 7,
    color: "#d1d5db",
    fontSize: 11,
  },
  odds: {
    textAlign: "right",
    color: "#f8fafc",
    fontSize: 20,
  },
  primaryChange: {
    textAlign: "right",
    fontSize: 27,
    lineHeight: 1,
    fontWeight: 950,
    fontVariantNumeric: "tabular-nums",
  },
  currentOddsSmall: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: 800,
  },
  oddsCell: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
  },
  trendStatus: {
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: ".08em",
  },
  change: {
    fontSize: 11,
    fontWeight: 800,
  },
  latestMove: {
    color: "#d1d5db",
    fontSize: 10,
    fontWeight: 700,
  },
  comboPanel: {
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    padding: 14,
    background: "#111827",
  },
  comboCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 4,
    padding: 13,
    border: "1px solid #334155",
    borderRadius: 12,
    background: "#0f172a",
  },
  comboName: {
    color: "#f8fafc",
    fontSize: 15,
  },
  comboTrend: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: 800,
  },
  disclaimer: {
    margin: 0,
    padding: "0 14px 14px",
    background: "#111827",
    color: "#d1d5db",
    fontSize: 11,
    lineHeight: 1.45,
  },
  refreshInfo: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 16px",
    color: "#d1d5db",
    fontSize: 12,
  },
  emptyPanel: {
    color: "#f8fafc",
    padding: 22,
    border: "1px solid #263244",
    borderRadius: 16,
    background: "#0b1220",
  },
  modelBox: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 10px",
    marginTop: 7,
    fontSize: 12,
    color: "#cbd5e1",
  },
  modelScore: {
    fontWeight: 700,
    color: "#f8fafc",
  },
  modelDecision: {
    fontWeight: 700,
    color: "#93c5fd",
  },
  modelReasons: {
    flexBasis: "100%",
    color: "#94a3b8",
  },
  noPlayNotice: {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #92400e",
    background: "rgba(120, 53, 15, 0.22)",
    color: "#fde68a",
    fontSize: 13,
    lineHeight: 1.5,
  },
  lockBar: {
    color: "#f8fafc",
    padding: "14px 14px 0",
    background: "#111827",
  },
  racePicturePanel: {
    color: "#f8fafc",
    padding: 16,
    borderTop: "1px solid #263244",
    background: "#0b1220",
  },
  racePictureHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  pictureTitle: {
    color: "#f8fafc",
    margin: 0,
    fontSize: 22,
  },
  headerStatusGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  countdownBox: {
    display: "grid",
    justifyItems: "center",
    minWidth: 112,
    padding: "8px 12px",
    border: "1px solid #334155",
    borderRadius: 14,
  },
  countdownLabel: {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: ".12em",
    opacity: 0.8,
  },
  countdownTime: {
    color: "#f8fafc",
    marginTop: 2,
    fontSize: 22,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  pictureStatus: {
    padding: "6px 10px",
    border: "1px solid #334155",
    borderRadius: 999,
    background: "#111827",
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 900,
  },
  pictureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
  },
  pictureCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 6,
    padding: 14,
    border: "1px solid #334155",
    borderRadius: 14,
    background: "#111827",
  },
  favoriteCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 6,
    padding: 14,
    border: "1px solid #a16207",
    borderRadius: 14,
    background: "rgba(161,98,7,.12)",
  },
  pictureName: {
    color: "#f8fafc",
    marginBottom: 3,
    fontSize: 16,
  },
  pictureLine: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 1.35,
  },
  racePictureConclusion: {
    color: "#f8fafc",
    display: "grid",
    gap: 6,
    marginTop: 12,
    padding: 14,
    border: "1px solid #334155",
    borderRadius: 14,
    background: "#0f172a",
    lineHeight: 1.45,
  },
  resultPanel: {
    color: "#f8fafc",
    padding: 16,
    borderTop: "1px solid #263244",
    background: "#0f172a",
  },
  lockedInfo: {
    color: "#f8fafc",
    display: "grid",
    gap: 5,
    marginBottom: 14,
    padding: 12,
    border: "1px solid #334155",
    borderRadius: 12,
    background: "#111827",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  journalPanel: {
    color: "#f8fafc",
    marginTop: 18,
    padding: 16,
    border: "1px solid #263244",
    borderRadius: 16,
    background: "#0b1220",
  },
  journalHeader: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 5,
    padding: 12,
    border: "1px solid #263244",
    borderRadius: 12,
    background: "#111827",
  },
  historyList: {
    display: "grid",
    gap: 10,
  },
  historyCard: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    border: "1px solid #263244",
    borderRadius: 12,
    background: "#111827",
  },
  historyLine: {
    display: "block",
    marginTop: 4,
    color: "#d1d5db",
    fontSize: 12,
    lineHeight: 1.4,
  },
  deleteButton: {
    height: 36,
    padding: "0 10px",
    border: "1px solid #7f1d1d",
    borderRadius: 9,
    background: "rgba(127,29,29,.2)",
    color: "#fecaca",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 16,
    color: "#d1d5db",
    fontSize: 12,
  },
};