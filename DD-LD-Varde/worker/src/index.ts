import { createClient } from "@supabase/supabase-js";
import { normalizeAtgStartTime, parseAtgStartTimeMs } from "./atgTime";
import { parsePushSubscription } from "./pushSubscription";
import { deliverFinalSignalNotification } from "./finalSignalPushDelivery";
import { PLACE_RULE_CONFIG_V1 } from "../../src/placeModel/config";
import { evaluatePlaceModelAtLock } from "../../src/placeModel/engine";
import { fetchHorseGallopPercent } from "../../src/gallop";
import { buildModelBetFromEvaluation, settleModelBet } from "../../src/placeModel/workflow";
import type { OddsPoint, PlaceBet, PlaceEvaluation, PlaceRunnerInput } from "../../src/placeModel/types";
import {
  WIN_PLACE_RULE_CONFIG_V1,
  getWinPlacePlannedLockTimeMs,
  isInWinPlaceFinalSignalWindow,
} from "../../src/winPlaceModel/config";
import { evaluateWinPlaceModelAtLock } from "../../src/winPlaceModel/engine";
import type {
  WinPlaceEvaluation,
  WinPlaceRunnerInput,
} from "../../src/winPlaceModel/types";
import { buildWinPlaceBetRows } from "./winPlacePersistence";
import {
  settleWinPlaceBet,
  type WinPlacePendingBetRow,
} from "./winPlaceSettlement";
import {
  parseResearchProducts,
  parseResearchRaceMeta,
  parseResearchRunnerMeta,
  type ParsedResearchProduct,
  type ParsedResearchStartMethod,
} from "./researchRaceParser";
import {
  isResearchArchiveEnabled,
  mergeResearchProducts,
} from "./researchWorkerIntegration";
import {
  archiveResearchRacesAtLock,
  createSupabaseResearchArchiveAdapter,
} from "./researchWorkerArchiveRun";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ATG_API_BASE_URL?: string;
  RACE_DATE_OVERRIDE?: string;
  LOCK_GRACE_SECONDS?: string;
  BET_SETTLEMENT_LOOKBACK_DAYS?: string;
  RESEARCH_ARCHIVE_ENABLED?: string;
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

type Track = {
  id: number;
  name: string;
  countryCode: "SE" | "FR";
};

type MeetingRaceRef = {
  raceNumber: number;
  raceId: string | null;
  startTime?: string;

  eventId: string | null;
  meetingId: string | null;
  meetingName: string | null;

  products: ParsedResearchProduct[];

  rawJson: Record<string, unknown>;
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

  oddsRaw: number | null;
  placeOddsRaw: number | null;

  scratched: boolean;
  stats: RunnerStats;

  horseAge: number | null;
  horseSex: string | null;

  startLane: number | null;
  startDistanceMeters: number | null;

  driverId: number | null;
  driverName: string | null;

  trainerId: number | null;
  trainerName: string | null;

  rawRunnerJson: Record<string, unknown>;
};

type Race = {
  raceNumber: number;
  id: string;

  startTime?: string;
  status?: string;

  runners: Runner[];

  isMonte: boolean;
  finishOrder: number[];

  eventId: string | null;
  meetingId: string | null;
  meetingName: string | null;

  raceName: string | null;

  startMethod: ParsedResearchStartMethod;
  distanceMeters: number | null;

  raceClassCode: string | null;
  raceCategory: string | null;

  earningsMin: number | null;
  earningsMax: number | null;

  ageMin: number | null;
  ageMax: number | null;

  firstAdditionalDistanceMeters: number | null;

  prizeMoneyTotal: number | null;
  firstPrize: number | null;

  products: ParsedResearchProduct[];

  rawRaceJson: Record<string, unknown>;
  rawMeetingJson: Record<string, unknown>;
};

type LiveOddsPointRow = {
  race_id: string;
  runner_number: number;
  market: "WIN" | "PLACE";
  odds_decimal: number;
  point_ts: string;
};

type ExistingEvalKeyRow = {
  race_id: string;
  rule_version: string;
};

type DbBetRow = {
  bet_id: string;
  race_id: string;
  rule_version: string;
  config_snapshot: unknown;
  date: string;
  track_id: number;
  track_name: string;
  race_number: number;
  planned_start_time: string;
  lock_time: string;
  horse_number: number;
  horse_name: string;
  start_lane: number | null;
  start_method: string;
  distance_meters: number | null;
  starters: number;
  start_odds: number;
  current_win_odds: number;
  odds_drop_percent: number;
  cv_raw: number;
  cv_display: number;
  strength: number;
  indicators_green: string[];
  valid_odds_points: number;
  stake_oren: number;
  result_outcome: PlaceBet["resultOutcome"];
  result_status: PlaceBet["resultStatus"];
  finish_position_official: number | null;
  place_odds_decimal: number | null;
  return_oren: number | null;
  net_oren: number | null;
  roi_pct: number | null;
  automatic_model_bet: boolean;
  user_actually_played: boolean;
  result_source: string | null;
  result_updated_at: string | null;
  place_odds_entry_method: "AUTO" | "MANUAL" | null;
  created_at: string;
  updated_at: string;
};

type TrendRunnerLite = {
  number: number;
  horseId: number | null;
  name: string;
  scratched: boolean;
  oddsRaw: number | null;
  startLane: number | null;
  stats: RunnerStats;
  firstOddsRaw: number | null;
  changePercent: number | null;
};

type StatKey = "KR" | "ST" | "K" | "SP" | "G" | "ODD";

type StatDefinition = {
  key: StatKey;
  shortLabel: string;
  best: "high" | "low";
};

const STAT_DEFINITIONS: StatDefinition[] = [
  { key: "KR", shortLabel: "KR", best: "high" },
  { key: "ST", shortLabel: "ST", best: "high" },
  { key: "K", shortLabel: "K", best: "high" },
  { key: "SP", shortLabel: "SP", best: "high" },
  { key: "G", shortLabel: "G", best: "low" },
  { key: "ODD", shortLabel: "ODD", best: "high" },
];

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const DEFAULT_SUPABASE_TIMEOUT_MS = 15_000;
const DEFAULT_SETTLEMENT_LOOKBACK_DAYS = 3;
const DEFAULT_RUN_TIMEOUT_MS = 50_000;
const STALE_RUNNING_MAX_AGE_MS = 2 * 60_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  const rec = asRecord(value);
  if (!rec) return null;
  return asRecord(rec[key]);
}

function getArray(value: unknown, key: string): unknown[] {
  const rec = asRecord(value);
  if (!rec) return [];
  return Array.isArray(rec[key]) ? (rec[key] as unknown[]) : [];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function throwIfRunTimedOut(startMs: number) {
  if (Date.now() - startMs <= DEFAULT_RUN_TIMEOUT_MS) return;
  throw new Error(`Cron run timed out after ${DEFAULT_RUN_TIMEOUT_MS}ms`);
}

async function fetchWithTimeout(args: {
  url: RequestInfo | URL;
  description: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  init?: RequestInit;
  parseResponse?: (response: Response) => Promise<unknown>;
}) {
  const {
    url,
    description,
    signal,
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
    init,
    parseResponse,
  } = args;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`${description} timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const abortFromSignal = () => {
    controller.abort(signal?.reason ?? new Error(`${description} aborted`));
  };

  if (signal) {
    if (signal.aborted) {
      abortFromSignal();
    } else {
      signal.addEventListener("abort", abortFromSignal, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (parseResponse) {
      return await parseResponse(response);
    }

    return response;
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) {
      throw controller.signal.reason;
    }

    throw new Error(`${description} failed: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  } finally {
    clearTimeout(timeoutHandle);
    signal?.removeEventListener("abort", abortFromSignal);
  }
}

function createSupabaseClient(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetchWithTimeout({
          url: input,
          description: "Supabase request",
          timeoutMs: DEFAULT_SUPABASE_TIMEOUT_MS,
          signal: init?.signal,
          init,
          parseResponse: async (response) => {
            const body = await response.arrayBuffer();
            return new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          },
        }),
    },
  });
}

function toIsoMinute(ms: number) {
  const bucket = Math.floor(ms / 60_000) * 60_000;
  return new Date(bucket).toISOString();
}

function parseCountryCode(value: unknown): "SE" | "FR" | null {
  const rec = asRecord(value);
  if (!rec) return null;

  const direct = [rec.countryCode, rec.country, rec.nation]
    .map((item) => asString(item).toUpperCase())
    .find((item) => item === "SE" || item === "FR");

  if (direct === "SE" || direct === "FR") return direct;

  const strings = collectStrings(rec).map((item) => item.toUpperCase());
  if (strings.some((item) => item === "SE" || item.includes("SWEDEN") || item.includes("SVERIGE"))) return "SE";
  if (strings.some((item) => item === "FR" || item.includes("FRANCE"))) return "FR";
  return null;
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  const rec = asRecord(value);
  if (!rec) return [];
  return Object.values(rec).flatMap((item) => collectStrings(item, depth + 1));
}

function parseTrack(value: unknown): Track | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const countryCode = parseCountryCode(rec);
  if (countryCode !== "SE") return null;

  const id = asNumber(rec.id) ?? asNumber(rec.trackId) ?? asNumber(rec.number);
  const name = asString(rec.name) || asString(rec.trackName) || asString(rec.displayName);

  if (!id || !name) return null;

  return {
    id,
    name,
    countryCode,
  };
}

function parseMeetingRaceRefs(trackValue: unknown): MeetingRaceRef[] {
  const trackRecord = asRecord(trackValue);

  const raceArrays = [
    getArray(trackValue, "races"),
    getArray(trackValue, "starts"),
    getArray(trackValue, "games"),
  ];

  const refs = raceArrays
    .flatMap((arr) => arr)
    .map((item) => {
      const rec = asRecord(item);
      if (!rec) return null;

      const raceNumber = asNumber(rec.number) ?? asNumber(rec.raceNumber) ?? asNumber(rec.leg);
      if (!raceNumber) return null;

      const raceId = asString(rec.id) || asString(rec.raceId) || null;
      const startTime = normalizeAtgStartTime(
        asString(rec.startTime) || asString(rec.scheduledStartTime) || undefined,
      );

      const eventId =
        asString(rec.eventId) ||
        asString(rec.event_id) ||
        asString(trackRecord?.eventId) ||
        asString(trackRecord?.event_id) ||
        null;

      const meetingId =
        asString(rec.meetingId) ||
        asString(rec.meeting_id) ||
        asString(trackRecord?.meetingId) ||
        asString(trackRecord?.meeting_id) ||
        null;

      const meetingName =
        asString(rec.meetingName) ||
        asString(rec.meeting_name) ||
        asString(trackRecord?.meetingName) ||
        asString(trackRecord?.meeting_name) ||
        null;

      return {
        raceNumber,
        raceId,
        startTime,

        eventId,
        meetingId,
        meetingName,

        products:
          parseResearchProducts(rec),

        rawJson: {
          raceReference: rec,
          eventId,
          meetingId,
          meetingName,
        },
      } satisfies MeetingRaceRef;
    })
    .filter((ref): ref is MeetingRaceRef => ref !== null);

  const dedup = new Map<number, MeetingRaceRef>();
  for (const ref of refs) {
    if (!dedup.has(ref.raceNumber)) dedup.set(ref.raceNumber, ref);
  }
  return [...dedup.values()].sort((a, b) => a.raceNumber - b.raceNumber);
}

function parsePercent(value: unknown) {
  const n = asNumber(value);
  if (n === null) return null;
  return n > 1 ? n : n * 100;
}

function latestYearNumeric(yearsValue: unknown, keys: string[], parser?: (value: number) => number | null) {
  const years = Array.isArray(yearsValue) ? yearsValue : [];
  const candidates = years
    .map((item) => {
      const rec = asRecord(item);
      if (!rec) return null;
      const year = asNumber(rec.year) ?? asNumber(rec.season) ?? 0;
      const value = keys
        .map((key) => asNumber(rec[key]))
        .find((n): n is number => n !== null);
      if (value === undefined) return null;
      const parsed = parser ? parser(value) : value;
      if (parsed === null) return null;
      return { year, value: parsed };
    })
    .filter((item): item is { year: number; value: number } => item !== null)
    .sort((a, b) => b.year - a.year);

  return candidates[0]?.value ?? null;
}

function firstNumeric(value: unknown, paths: string[][], parser?: (value: number) => number | null) {
  for (const path of paths) {
    let cursor: unknown = value;
    for (const key of path) {
      const rec = asRecord(cursor);
      if (!rec) {
        cursor = null;
        break;
      }
      cursor = rec[key];
    }

    const candidate = asNumber(cursor);
    if (candidate === null) continue;
    const parsed = parser ? parser(candidate) : candidate;
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractRunnerStats(start: Record<string, unknown>): RunnerStats {
  const horse = getRecord(start, "horse");
  const driver = getRecord(start, "driver");
  const horseStatistics = getRecord(horse, "statistics");
  const horseLife = getRecord(horseStatistics, "life");
  const horseYears = getArray(horseStatistics, "years");
  const driverStatistics = getRecord(driver, "statistics");
  const driverYears = getArray(driverStatistics, "years");

  const horseYearWinPercent = latestYearNumeric(horseYears, ["winPercentage", "winPercent"], parsePercent);
  const driverYearWinPercent = latestYearNumeric(driverYears, ["winPercentage", "winPercent"], parsePercent);

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
    winPercent:
      firstNumeric(start, [
        ["winPercent"],
        ["winPercentage"],
        ["statistics", "winPercent"],
        ["statistics", "winPercentage"],
        ["horse", "statistics", "life", "winPercent"],
        ["horse", "statistics", "life", "winPercentage"],
        ["horse", "statistics", "winPercent"],
        ["horse", "statistics", "winPercentage"],
      ], parsePercent) ??
      firstNumeric(horseLife, [["winPercent"], ["winPercentage"]], parsePercent) ??
      horseYearWinPercent,
    driverWinPercent:
      firstNumeric(driver ?? start, [
        ["winPercent"],
        ["winPercentage"],
        ["statistics", "winPercent"],
        ["statistics", "winPercentage"],
        ["career", "winPercentage"],
      ], parsePercent) ?? driverYearWinPercent,
    startPoints:
      firstNumeric(start, [
        ["startPoints"],
        ["startPoang"],
        ["statistics", "startPoints"],
        ["statistics", "startPoang"],
        ["horse", "statistics", "life", "startPoints"],
        ["horse", "statistics", "life", "startPoang"],
        ["horse", "statistics", "startPoints"],
        ["horse", "statistics", "startPoang"],
      ]) ??
      firstNumeric(horseLife, [["startPoints"], ["startPoang"]]),
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
    ], parsePercent),
  };
}

function parseRunner(value: unknown, fallbackNumber: number): Runner | null {
  const rec = asRecord(value);
  if (!rec) return null;

  const horse = getRecord(rec, "horse") ?? rec;
  const number =
    asNumber(rec.number) ??
    asNumber(rec.startNumber) ??
    asNumber(horse.number) ??
    fallbackNumber;

  const horseId = asNumber(horse.id) ?? asNumber(rec.horseId);
  const name = asString(horse.name) || asString(rec.horseName) || asString(rec.name) || `Hast ${number}`;

  const pools = getRecord(rec, "pools");
  const winnerPool = pools ? getRecord(pools, "vinnare") ?? getRecord(pools, "winner") ?? getRecord(pools, "win") : null;
  const placePool = pools ? getRecord(pools, "plats") ?? getRecord(pools, "place") : null;

  const oddsRaw = (winnerPool ? asNumber(winnerPool.odds) : null) ?? asNumber(rec.odds);
  const placeOddsRaw = (placePool ? asNumber(placePool.odds) : null) ?? asNumber(rec.placeOdds);

  const scratched =
    rec.scratched === true ||
    rec.withdrawn === true ||
    normalizeText(asString(rec.status)) === "scratched";

  const researchMeta =
    parseResearchRunnerMeta(rec);

  return {
    number,
    horseId,
    name,
    oddsRaw,
    placeOddsRaw,
    scratched,
    stats: extractRunnerStats(rec),

    horseAge: researchMeta.horseAge,
    horseSex: researchMeta.horseSex,

    startLane: researchMeta.startLane,
    startDistanceMeters:
      researchMeta.startDistanceMeters,

    driverId: researchMeta.driverId,
    driverName: researchMeta.driverName,

    trainerId: researchMeta.trainerId,
    trainerName: researchMeta.trainerName,

    rawRunnerJson: rec,
  };
}

function parseFinishPosition(value: unknown) {
  const rec = asRecord(value);
  if (!rec) return null;
  const result = getRecord(rec, "result");

  const position =
    asNumber(rec.finishPosition) ??
    asNumber(rec.position) ??
    asNumber(rec.place) ??
    asNumber(rec.rank) ??
    (result
      ? asNumber(result.finishPosition) ?? asNumber(result.position) ?? asNumber(result.place) ?? asNumber(result.rank)
      : null);

  return position && position > 0 ? position : null;
}

function parseRace(data: unknown, requestedRaceNumber: number): Race | null {
  const rec = asRecord(data);
  if (!rec) return null;

  const races = getArray(rec, "races");
  const rawRace = asRecord(races[0]);
  if (!rawRace) return null;

  const raceNumber = asNumber(rawRace.number) ?? asNumber(rawRace.raceNumber) ?? requestedRaceNumber;

  const starts = getArray(rawRace, "starts");
  const horses = getArray(rawRace, "horses");
  const rawStarts = starts.length ? starts : horses;

  const runners = rawStarts
    .map((item, index) => parseRunner(item, index + 1))
    .filter((runner): runner is Runner => runner !== null)
    .sort((a, b) => a.number - b.number);

  const finishOrder = rawStarts
    .map((item, index) => {
      const runner = parseRunner(item, index + 1);
      const position = parseFinishPosition(item);
      return runner && position ? { number: runner.number, position } : null;
    })
    .filter((item): item is { number: number; position: number } => item !== null)
    .sort((a, b) => a.position - b.position)
    .map((item) => item.number);

  const raceText = collectStrings(rawRace)
    .join(" ")
    .toLowerCase();

  const researchMeta =
    parseResearchRaceMeta(rawRace);

  return {
    raceNumber,
    id:
      asString(rec.id) ||
      asString(rawRace.id) ||
      `race-${requestedRaceNumber}`,
    startTime: normalizeAtgStartTime(
      asString(rawRace.startTime) ||
        asString(rawRace.scheduledStartTime) ||
        asString(rec.startTime) ||
        undefined,
    ),
    status: asString(rec.status) || asString(rawRace.status),
    runners,
    isMonte: /mont[eé]/i.test(raceText),
    finishOrder,

    eventId: null,
    meetingId: null,
    meetingName: null,

    raceName: researchMeta.raceName,

    startMethod:
      researchMeta.startMethod,

    distanceMeters:
      researchMeta.distanceMeters,

    raceClassCode:
      researchMeta.raceClassCode,

    raceCategory:
      researchMeta.raceCategory,

    earningsMin:
      researchMeta.earningsMin,

    earningsMax:
      researchMeta.earningsMax,

    ageMin: researchMeta.ageMin,
    ageMax: researchMeta.ageMax,

    firstAdditionalDistanceMeters:
      researchMeta.firstAdditionalDistanceMeters,

    prizeMoneyTotal:
      researchMeta.prizeMoneyTotal,

    firstPrize:
      researchMeta.firstPrize,

    products:
      researchMeta.products,

    rawRaceJson: rawRace,
    rawMeetingJson: {},
  };
}

function buildCompactRaceStatePayload(
  race: Race,
) {
  return {
    ...race,

    rawRaceJson: {},
    rawMeetingJson: {},

    runners: race.runners.map((runner) => ({
      ...runner,
      rawRunnerJson: {},
    })),
  };
}

function raceCollectionWindow(startTime?: string) {
  if (!startTime) return null;
  const startMs = parseAtgStartTimeMs(startTime);
  if (!Number.isFinite(startMs)) return null;
  return {
    startMs,
    collectionStartMs: startMs - 60 * 60_000,
  };
}

function shouldCollectOdds(startTime: string | undefined, nowMs: number) {
  const window = raceCollectionWindow(startTime);
  if (!window) return false;
  return nowMs >= window.collectionStartMs && nowMs < window.startMs;
}

function isValidRawWinOdds(value: number | null) {
  if (value === null) return false;
  if (!Number.isFinite(value) || value <= 0) return false;
  if (Math.round(value) === 9999) return false;
  return true;
}

function percentChange(first: number | null, current: number | null) {
  if (!first || !current || first <= 0) return null;
  return ((current - first) / first) * 100;
}

function computeIndicatorsAndStrength(args: { runners: TrendRunnerLite[] }) {
  const { runners } = args;
  const active = runners.filter((runner) => !runner.scratched);
  const rankings = new Map<StatKey, Array<{ number: number; value: number }>>();

  for (const def of STAT_DEFINITIONS) {
    const values = active
      .map((runner) => {
        const value =
          def.key === "KR"
            ? runner.stats.earningsPerStart
            : def.key === "ST"
              ? runner.stats.winPercent
              : def.key === "K"
                ? runner.stats.driverWinPercent
                : def.key === "SP"
                  ? runner.stats.startPoints
                  : def.key === "G"
                    ? runner.stats.gallopPercent
                    : runner.changePercent === null
                      ? null
                      : -runner.changePercent;
        if (value === null || !Number.isFinite(value)) return null;
        return { number: runner.number, value };
      })
      .filter((item): item is { number: number; value: number } => item !== null)
      .sort((a, b) => (def.best === "low" ? a.value - b.value : b.value - a.value));

    rankings.set(def.key, values);
  }

  const byRunner = new Map<number, { strength: number; indicatorsGreen: string[] }>();

  for (const runner of active) {
    const indicatorsGreen = STAT_DEFINITIONS
      .map((def) => {
        const list = rankings.get(def.key) ?? [];
        const rank = list.findIndex((item) => item.number === runner.number) + 1;
        return rank > 0 && rank <= 4 ? def.shortLabel : null;
      })
      .filter((item): item is string => item !== null);

    byRunner.set(runner.number, {
      strength: indicatorsGreen.length,
      indicatorsGreen,
    });
  }

  return byRunner;
}

function getRaceDateInStockholm(nowMs: number) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));

  const year = parts.find((item) => item.type === "year")?.value ?? "";
  const month = parts.find((item) => item.type === "month")?.value ?? "";
  const day = parts.find((item) => item.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function raceRuleKey(raceId: string, ruleVersion: string) {
  return `${raceId}:${ruleVersion}`;
}

function parseDbBetRow(row: DbBetRow): PlaceBet {
  return {
    betId: row.bet_id,
    raceId: row.race_id,
    ruleVersion: row.rule_version,
    configSnapshot: row.config_snapshot as PlaceBet["configSnapshot"],
    date: row.date,
    trackId: row.track_id,
    trackName: row.track_name,
    raceNumber: row.race_number,
    plannedStartTime: row.planned_start_time,
    lockTime: row.lock_time,
    horseNumber: row.horse_number,
    horseName: row.horse_name,
    startLane: row.start_lane,
    startMethod: row.start_method,
    distanceMeters: row.distance_meters,
    starters: row.starters,
    startOdds: row.start_odds,
    currentWinOdds: row.current_win_odds,
    oddsDropPercent: row.odds_drop_percent,
    cvRaw: row.cv_raw,
    cvDisplay: row.cv_display,
    strength: row.strength,
    indicatorsGreen: row.indicators_green ?? [],
    validOddsPoints: row.valid_odds_points,
    stakeOren: row.stake_oren,
    resultOutcome: row.result_outcome,
    resultStatus: row.result_status,
    finishPositionOfficial: row.finish_position_official,
    placeOddsDecimal: row.place_odds_decimal,
    returnOren: row.return_oren,
    netOren: row.net_oren,
    roiPct: row.roi_pct,
    automaticModelBet: row.automatic_model_bet,
    userActuallyPlayed: row.user_actually_played,
    resultSource: row.result_source,
    resultUpdatedAt: row.result_updated_at,
    placeOddsEntryMethod: row.place_odds_entry_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchJson(url: string, signal?: AbortSignal) {
  return fetchWithTimeout({
    url,
    description: `HTTP ${url}`,
    signal,
    init: {
      cache: "no-store",
    },
    parseResponse: async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      return response.json() as Promise<unknown>;
    },
  });
}

async function loadTracksAndMeetings(args: { apiBaseUrl: string; raceDate: string; signal?: AbortSignal }) {
  const { apiBaseUrl, raceDate, signal } = args;
  const payload = await fetchJson(`${apiBaseUrl}/calendar/day/${raceDate}`, signal);
  const tracksRaw = getArray(payload, "tracks");

  const tracks = tracksRaw
    .map(parseTrack)
    .filter((item): item is Track => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));

  const meetingRefs = new Map<number, MeetingRaceRef[]>();
  for (const rawTrack of tracksRaw) {
    const parsed = parseTrack(rawTrack);
    if (!parsed) continue;
    meetingRefs.set(parsed.id, parseMeetingRaceRefs(rawTrack));
  }

  return {
    tracks,
    meetingRefs,
  };
}

async function fetchRaceForTrack(args: {
  apiBaseUrl: string;
  raceDate: string;
  trackId: number;
  raceNumber: number;
  meetingRef: MeetingRaceRef;
  signal?: AbortSignal;
}) {
  const {
    apiBaseUrl,
    raceDate,
    trackId,
    raceNumber,
    meetingRef,
    signal,
  } = args;

  const payload = await fetchJson(
    `${apiBaseUrl}/games/vinnare_${raceDate}_${trackId}_${raceNumber}`,
    signal,
  );

  const parsed = parseRace(
    payload,
    raceNumber,
  );

  if (!parsed) {
    return null;
  }

  return {
    ...parsed,

    startTime:
      parsed.startTime ??
      meetingRef.startTime,

    eventId:
      meetingRef.eventId,

    meetingId:
      meetingRef.meetingId,

    meetingName:
      meetingRef.meetingName,

    products:
      mergeResearchProducts(
        parsed.products,
        meetingRef.products,
      ),

    rawMeetingJson:
      meetingRef.rawJson,
  };
}

function toDecimalOdds(raw: number | null): number | null {
  if (!isValidRawWinOdds(raw)) return null;
  return raw / 100;
}

type PlaceOddsContext = {
  window: NonNullable<ReturnType<typeof raceCollectionWindow>>;
  byRunner: Map<number, OddsPoint[]>;
  latestPointMs: number | null;
  trendLite: TrendRunnerLite[];
};

async function loadPlaceOddsContext(args: {
  supabase: ReturnType<typeof createSupabaseClient>;
  race: Race;
  nowMs: number;
}): Promise<PlaceOddsContext | null> {
  const { supabase, race, nowMs } = args;
  const window = raceCollectionWindow(race.startTime);

  if (!window) {
    return null;
  }

  const { data: oddsRows, error: oddsRowsError } = await supabase
    .from("place_live_odds_points")
    .select("race_id,runner_number,market,odds_decimal,point_ts")
    .eq("race_id", race.id)
    .eq("market", "WIN")
    .gte("point_ts", new Date(window.collectionStartMs).toISOString())
    .lte("point_ts", new Date(nowMs).toISOString())
    .order("point_ts", { ascending: true });

  if (oddsRowsError) {
    throw new Error(
      `Could not load odds history for race ${race.id}: ${oddsRowsError.message}`,
    );
  }

  const byRunner = new Map<number, OddsPoint[]>();
  let latestPointMs: number | null = null;

  for (const row of (oddsRows ?? []) as LiveOddsPointRow[]) {
    const pointMs = new Date(row.point_ts).getTime();

    if (!Number.isFinite(pointMs)) {
      continue;
    }

    latestPointMs =
      latestPointMs === null
        ? pointMs
        : Math.max(latestPointMs, pointMs);

    const history = byRunner.get(row.runner_number) ?? [];

    history.push({
      odds: Number(row.odds_decimal),
      timestamp: pointMs,
    });

    byRunner.set(row.runner_number, history);
  }

  const trendLite: TrendRunnerLite[] = race.runners.map((runner) => {
    const history = (byRunner.get(runner.number) ?? []).sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const firstOddsRaw = history[0]
      ? Math.round(history[0].odds * 100)
      : null;

    return {
      number: runner.number,
      horseId: runner.horseId,
      name: runner.name,
      scratched: runner.scratched,
      oddsRaw: runner.oddsRaw,
      startLane: runner.startLane,
      stats: { ...runner.stats },
      firstOddsRaw,
      changePercent: percentChange(firstOddsRaw, runner.oddsRaw),
    };
  });

  return {
    window,
    byRunner,
    latestPointMs,
    trendLite,
  };
}

async function runCron(env: Env) {
  const startMs = Date.now();
  const nowIso = new Date(startMs).toISOString();
  const lockGraceMs = Number(env.LOCK_GRACE_SECONDS ?? "90") * 1000;
  const apiBaseUrl = env.ATG_API_BASE_URL ?? "https://www.atg.se/services/racinginfo/v1/api";
  const raceDate =
    env.RACE_DATE_OVERRIDE ||
    getRaceDateInStockholm(startMs);

  const researchArchiveEnabled =
    isResearchArchiveEnabled(
      env.RESEARCH_ARCHIVE_ENABLED,
    );

  const runController = new AbortController();
  const runTimeoutHandle = setTimeout(() => {
    runController.abort(new Error(`Cron run timed out after ${DEFAULT_RUN_TIMEOUT_MS}ms`));
  }, DEFAULT_RUN_TIMEOUT_MS);

  const supabase = createSupabaseClient(env);

  const staleRunningThresholdIso = new Date(startMs - STALE_RUNNING_MAX_AGE_MS).toISOString();
  const { error: staleRunCleanupError } = await supabase
    .from("place_live_worker_runs")
    .update({
      finished_at: nowIso,
      status: "FAILED",
      error_text: `Marked failed by watchdog after >${Math.floor(STALE_RUNNING_MAX_AGE_MS / 1000)}s in RUNNING`,
    })
    .eq("status", "RUNNING")
    .lt("started_at", staleRunningThresholdIso);

  if (staleRunCleanupError) {
    throw new Error(`Could not cleanup stale RUNNING rows: ${staleRunCleanupError.message}`);
  }

  const { data: runRow, error: runInsertError } = await supabase
    .from("place_live_worker_runs")
    .insert({
      started_at: nowIso,
      status: "RUNNING",
      summary_json: {
        raceDate,
      },
    })
    .select("id")
    .single();

  if (runInsertError) {
    throw new Error(`Could not create worker run row: ${runInsertError.message}`);
  }

  const runId = (runRow as { id: string }).id;

  const summary = {
    raceDate,
    tracks: 0,
    racesFetched: 0,
    oddsPointsInserted: 0,

    researchArchiveEnabled,
    researchRacesEligible: 0,
    researchRacesArchived: 0,
    researchSnapshotsComplete: 0,
    researchSnapshotsPartial: 0,
    researchSnapshotsSkippedExisting: 0,
    researchArchiveFailures: 0,
    researchArchiveErrors: [] as string[],

    evaluationsCreated: 0,
    betsCreated: 0,
    winPlaceEvaluationsCreated: 0,
    winPlaceBetsCreated: 0,
    winPlaceBetsSettled: 0,
    winPlaceBetsVoided: 0,
    winPlaceSettlementSkipped: 0,
    notificationsClaimed: 0,
    notificationsSent: 0,
    notificationSubscriptionsAttempted: 0,
    notificationSubscriptionsFailed: 0,
    betsSettled: 0,
    betsVoided: 0,
    settlementSkipped: 0,
  };

  try {
    const { tracks, meetingRefs } = await loadTracksAndMeetings({ apiBaseUrl, raceDate, signal: runController.signal });
    summary.tracks = tracks.length;

    const allRaces: Array<{ track: Track; race: Race }> = [];

    for (const track of tracks) {
      throwIfRunTimedOut(startMs);
      const refs = meetingRefs.get(track.id) ?? [];
      for (const ref of refs) {
        throwIfRunTimedOut(startMs);
        const race = await fetchRaceForTrack({
          apiBaseUrl,
          raceDate,
          trackId: track.id,
          raceNumber: ref.raceNumber,
          meetingRef: ref,
          signal: runController.signal,
        }).catch(() => null);

        if (!race) continue;

        summary.racesFetched += 1;
        allRaces.push({ track, race });

        const starters = race.runners.filter(
          (runner) => !runner.scratched,
        ).length;

        const { error: raceStateError } = await supabase.from("place_live_race_states").upsert(
          {
            race_id: race.id,
            race_date: raceDate,
            track_id: track.id,
            track_name: track.name,
            race_number: race.raceNumber,
            planned_start_time: race.startTime ?? null,
            race_status: race.status ?? null,
            is_monte: race.isMonte,
            start_method: race.startMethod,
            distance_meters: race.distanceMeters,
            starters,
            payload_json:
              buildCompactRaceStatePayload(race),
            last_seen_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "race_id,race_date" },
        );

        if (raceStateError) {
          throw new Error(`Could not upsert place_live_race_states: ${raceStateError.message}`);
        }
      }
    }

    const pointTsIso = toIsoMinute(startMs);
    for (const item of allRaces) {
      throwIfRunTimedOut(startMs);
      const { track, race } = item;
      if (!shouldCollectOdds(race.startTime, startMs)) continue;

      const rows: Array<Record<string, unknown>> = [];
      for (const runner of race.runners) {
        const win = toDecimalOdds(runner.oddsRaw);
        if (win !== null) {
          rows.push({
            race_id: race.id,
            race_date: raceDate,
            track_id: track.id,
            track_name: track.name,
            race_number: race.raceNumber,
            runner_number: runner.number,
            horse_id: runner.horseId,
            horse_name: runner.name,
            market: "WIN",
            odds_decimal: win,
            point_ts: pointTsIso,
            source: "ATG",
          });
        }

        const place = toDecimalOdds(runner.placeOddsRaw);
        if (place !== null) {
          rows.push({
            race_id: race.id,
            race_date: raceDate,
            track_id: track.id,
            track_name: track.name,
            race_number: race.raceNumber,
            runner_number: runner.number,
            horse_id: runner.horseId,
            horse_name: runner.name,
            market: "PLACE",
            odds_decimal: place,
            point_ts: pointTsIso,
            source: "ATG",
          });
        }
      }

      if (!rows.length) continue;

      const { error: oddsError } = await supabase
        .from("place_live_odds_points")
        .upsert(rows, { onConflict: "race_id,runner_number,market,point_ts" });

      if (oddsError) {
        throw new Error(`Could not upsert place_live_odds_points: ${oddsError.message}`);
      }

      summary.oddsPointsInserted += rows.length;
    }

    const researchArchiveSummary =
      await archiveResearchRacesAtLock({
        enabled:
          researchArchiveEnabled,

        raceDate,
        nowMs: startMs,

        races: allRaces,

        adapter:
          createSupabaseResearchArchiveAdapter(
            supabase,
          ),
      });

    summary.researchRacesEligible =
      researchArchiveSummary.eligibleRaces;

    summary.researchRacesArchived =
      researchArchiveSummary.archivedRaces;

    summary.researchSnapshotsComplete =
      researchArchiveSummary.completeSnapshots;

    summary.researchSnapshotsPartial =
      researchArchiveSummary.partialSnapshots;

    summary.researchSnapshotsSkippedExisting =
      researchArchiveSummary.skippedExisting;

    summary.researchArchiveFailures =
      researchArchiveSummary.failedRaces;

    summary.researchArchiveErrors =
      researchArchiveSummary.errors;

    const vapidSubject = env.VAPID_SUBJECT?.trim();
    const vapidPublicKey = env.VAPID_PUBLIC_KEY?.trim();
    const vapidPrivateKey = env.VAPID_PRIVATE_KEY?.trim();

    const vapid =
      vapidSubject && vapidPublicKey && vapidPrivateKey
        ? {
            subject: vapidSubject,
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey,
          }
        : null;

    // Den gamla preliminära T-3-notisen är avstängd.
    // En gemensam slutnotis skickas efter båda T-90-utvärderingarna.

    const {
      data: existingWinPlaceEvalRows,
      error: existingWinPlaceEvalError,
    } = await supabase
      .from("win_place_race_evaluations")
      .select("race_id,rule_version")
      .eq("rule_version", WIN_PLACE_RULE_CONFIG_V1.ruleVersion)
      .eq("signal_phase", "LIVE")
      .eq("race_json->>date", raceDate);

    if (existingWinPlaceEvalError) {
      throw new Error(
        `Could not load existing win-place evaluations: ${existingWinPlaceEvalError.message}`,
      );
    }

    const existingWinPlaceEvalKeys = new Set(
      ((existingWinPlaceEvalRows ?? []) as ExistingEvalKeyRow[]).map(
        (row) => raceRuleKey(row.race_id, row.rule_version),
      ),
    );

    for (const item of allRaces) {
      throwIfRunTimedOut(startMs);

      const { track, race } = item;
      const plannedStartTime = race.startTime;

      if (
        !plannedStartTime ||
        !isInWinPlaceFinalSignalWindow(
          plannedStartTime,
          startMs,
          WIN_PLACE_RULE_CONFIG_V1,
        )
      ) {
        continue;
      }

      const winPlaceRaceKey = raceRuleKey(
        race.id,
        WIN_PLACE_RULE_CONFIG_V1.ruleVersion,
      );

      if (existingWinPlaceEvalKeys.has(winPlaceRaceKey)) {
        continue;
      }

      const context = await loadPlaceOddsContext({
        supabase,
        race,
        nowMs: startMs,
      });

      if (!context) {
        continue;
      }

      const {
        window,
        byRunner,
        latestPointMs,
        trendLite,
      } = context;

      const indicatorsByRunner = computeIndicatorsAndStrength({
        runners: trendLite,
      });

      const winPlaceRunners: WinPlaceRunnerInput[] =
        trendLite.map((runner) => {
          const history = (byRunner.get(runner.number) ?? [])
            .filter(
              (point) =>
                point.timestamp >= window.collectionStartMs &&
                point.timestamp <= startMs,
            )
            .sort((a, b) => a.timestamp - b.timestamp);

          const indicators =
            indicatorsByRunner.get(runner.number) ?? {
              strength: 0,
              indicatorsGreen: [],
            };

          return {
            number: runner.number,
            horseId: runner.horseId,
            name: runner.name,
            startLane: runner.startLane,
            scratched: runner.scratched,
            currentWinOddsDecimal: toDecimalOdds(
              runner.oddsRaw,
            ),
            indicatorsGreen: indicators.indicatorsGreen,
            strength: indicators.strength,
            oddsHistory: history,
          };
        });

      const incompleteOddsHistoryRunnerNumbers =
        winPlaceRunners
          .filter((runner) => !runner.scratched)
          .filter((runner) => {
            if (!runner.oddsHistory.length) {
              return true;
            }

            return (
              runner.oddsHistory[0].timestamp >
              window.collectionStartMs + 2 * 60_000
            );
          })
          .map((runner) => runner.number);

      const plannedLockTimeMs =
        getWinPlacePlannedLockTimeMs(
          plannedStartTime,
          WIN_PLACE_RULE_CONFIG_V1,
        );

      const hasFreshCurrentOddsPoint =
        latestPointMs !== null &&
        Math.abs(plannedLockTimeMs - latestPointMs) <=
          lockGraceMs;

      const evaluation = evaluateWinPlaceModelAtLock({
        race: {
          raceId: race.id,
          date: raceDate,
          trackId: track.id,
          trackName: track.name,
          raceNumber: race.raceNumber,
          plannedStartTime,
          raceStatus: race.status,
          isMonte: race.isMonte,
          startMethod: race.startMethod,
          distanceMeters: race.distanceMeters,
          starters: race.runners.filter(
            (runner) => !runner.scratched,
          ).length,
        },
        runners: winPlaceRunners,
        nowMs: startMs,
        config: WIN_PLACE_RULE_CONFIG_V1,
        hasCompleteOddsHistory:
          incompleteOddsHistoryRunnerNumbers.length === 0,
        hasFreshCurrentOddsPoint,
      });

      const evaluationWithTiming = {
        ...evaluation,
        snapshot: {
          ...evaluation.snapshot,
          incompleteOddsHistoryRunnerNumbers,
          lockTiming: {
            plannedLockTimeMs,
            actualSignalLockTimeMs: startMs,
            usedOddsPointTimestampMs: latestPointMs,
          },
        },
      };

      const betRows = buildWinPlaceBetRows({
        evaluation: evaluationWithTiming,
        nowIso,
      });

      if (betRows.length) {
        const { error: winPlaceBetError } = await supabase
          .from("win_place_model_bets")
          .upsert(betRows, {
            onConflict:
              "race_id,rule_version,market,signal_phase",
          });

        if (winPlaceBetError) {
          throw new Error(
            `Could not upsert win-place bets for race ${race.id}: ${winPlaceBetError.message}`,
          );
        }

        summary.winPlaceBetsCreated += betRows.length;
      }

      const { error: winPlaceEvalError } = await supabase
        .from("win_place_race_evaluations")
        .upsert(
          {
            race_id: evaluationWithTiming.raceId,
            rule_version: evaluationWithTiming.ruleVersion,
            decision: evaluationWithTiming.decision,
            reasons: evaluationWithTiming.reasons,
            race_json: evaluationWithTiming.race,
            planned_lock_time_ms:
              evaluationWithTiming.plannedLockTimeMs,
            actual_lock_time_ms:
              evaluationWithTiming.actualLockTimeMs,
            locked_at: evaluationWithTiming.lockedAt,
            seconds_before_start:
              evaluationWithTiming.secondsBeforeStartAtLock,
            config_snapshot:
              evaluationWithTiming.configSnapshot,
            checks_json: evaluationWithTiming.checks,
            most_shortened_json:
              evaluationWithTiming.mostShortened,
            snapshot_json: evaluationWithTiming.snapshot,
            signal_phase: "LIVE",
            created_at: evaluationWithTiming.createdAt,
            updated_at: evaluationWithTiming.updatedAt,
          },
          {
            onConflict:
              "race_id,rule_version,signal_phase",
          },
        );

      if (winPlaceEvalError) {
        throw new Error(
          `Could not upsert win-place evaluation ${race.id}: ${winPlaceEvalError.message}`,
        );
      }

      summary.winPlaceEvaluationsCreated += 1;
      existingWinPlaceEvalKeys.add(winPlaceRaceKey);
    }

    const { data: existingEvalRows, error: existingEvalError } = await supabase
      .from("place_race_evaluations")
      .select("race_id,rule_version")
      .eq("rule_version", PLACE_RULE_CONFIG_V1.ruleVersion)
      .eq("race_json->>date", raceDate);

    if (existingEvalError) {
      throw new Error(`Could not load existing evaluations: ${existingEvalError.message}`);
    }

    const existingEvalKeys = new Set(
      ((existingEvalRows ?? []) as ExistingEvalKeyRow[]).map((row) => raceRuleKey(row.race_id, row.rule_version)),
    );

    const { data: existingBetRows, error: existingBetError } = await supabase
      .from("place_model_bets")
      .select("*")
      .eq("date", raceDate)
      .eq("rule_version", PLACE_RULE_CONFIG_V1.ruleVersion);

    if (existingBetError) {
      throw new Error(`Could not load existing bets: ${existingBetError.message}`);
    }

    const existingBets = ((existingBetRows ?? []) as DbBetRow[]).map(parseDbBetRow);
    const existingBetByKey = new Map(existingBets.map((bet) => [raceRuleKey(bet.raceId, bet.ruleVersion), bet]));

    for (const item of allRaces) {
      throwIfRunTimedOut(startMs);
      const { track, race } = item;
      const window = raceCollectionWindow(race.startTime);
      if (!window) continue;

      const lockTimeMs = window.startMs - PLACE_RULE_CONFIG_V1.lockMinutesBeforeRace * 60_000;
      if (!Number.isFinite(lockTimeMs) || startMs < lockTimeMs) continue;

      const raceKey = raceRuleKey(race.id, PLACE_RULE_CONFIG_V1.ruleVersion);
      if (existingEvalKeys.has(raceKey)) continue;

      const { data: oddsRows, error: oddsRowsError } = await supabase
        .from("place_live_odds_points")
        .select("race_id,runner_number,market,odds_decimal,point_ts")
        .eq("race_id", race.id)
        .eq("market", "WIN")
        .gte("point_ts", new Date(window.collectionStartMs).toISOString())
        .lte("point_ts", new Date(startMs).toISOString())
        .order("point_ts", { ascending: true });

      if (oddsRowsError) {
        throw new Error(`Could not load odds history for race ${race.id}: ${oddsRowsError.message}`);
      }

      const byRunner = new Map<number, OddsPoint[]>();
      let latestPointMs: number | null = null;

      for (const row of (oddsRows ?? []) as LiveOddsPointRow[]) {
        const pointMs = new Date(row.point_ts).getTime();
        if (!Number.isFinite(pointMs)) continue;
        latestPointMs = latestPointMs === null ? pointMs : Math.max(latestPointMs, pointMs);
        const list = byRunner.get(row.runner_number) ?? [];
        list.push({ odds: row.odds_decimal, timestamp: pointMs });
        byRunner.set(row.runner_number, list);
      }

      const trendLite: TrendRunnerLite[] = race.runners.map((runner) => {
        const history = (byRunner.get(runner.number) ?? []).sort((a, b) => a.timestamp - b.timestamp);
        const firstOddsRaw = history[0] ? Math.round(history[0].odds * 100) : null;
        const changePercent = percentChange(firstOddsRaw, runner.oddsRaw);

        return {
          number: runner.number,
          horseId: runner.horseId,
          name: runner.name,
          scratched: runner.scratched,
          oddsRaw: runner.oddsRaw,
          startLane: runner.startLane,
          stats: { ...runner.stats },
          firstOddsRaw,
          changePercent,
        };
      });

      // Fill missing gallop data from horse history right before lock evaluation.
      const gallopFetches = trendLite
        .filter((runner) => !runner.scratched && runner.stats.gallopPercent === null && runner.horseId !== null)
        .map(async (runner) => {
          const gallop = await fetchHorseGallopPercent({
            horseId: runner.horseId as number,
            apiBaseUrl,
            signal: runController.signal,
            fetchImpl: (input, init) => fetchWithTimeout({
              url: String(input),
              description: `Horse results ${runner.horseId}`,
              signal: runController.signal,
              init,
            }),
          });
          return { runnerNumber: runner.number, gallopPercent: gallop };
        });

      const gallopResults = await Promise.allSettled(gallopFetches);
      throwIfRunTimedOut(startMs);
      for (const settled of gallopResults) {
        if (settled.status !== "fulfilled") continue;
        const target = trendLite.find((runner) => runner.number === settled.value.runnerNumber);
        if (!target) continue;
        if (settled.value.gallopPercent !== null) {
          target.stats.gallopPercent = settled.value.gallopPercent;
        }
      }

      const indicatorsByRunner = computeIndicatorsAndStrength({ runners: trendLite });

      const placeRunners: PlaceRunnerInput[] = trendLite.map((runner) => {
        const history = (byRunner.get(runner.number) ?? [])
          .filter((point) => point.timestamp >= window.collectionStartMs && point.timestamp < window.startMs)
          .sort((a, b) => a.timestamp - b.timestamp);

        const meta = indicatorsByRunner.get(runner.number) ?? { strength: 0, indicatorsGreen: [] };

        return {
          number: runner.number,
          horseId: runner.horseId,
          name: runner.name,
          startLane: runner.startLane,
          scratched: runner.scratched,
          currentWinOddsDecimal: toDecimalOdds(runner.oddsRaw),
          indicatorsGreen: meta.indicatorsGreen,
          strength: meta.strength,
          gallopPercent: runner.stats.gallopPercent,
          gallopSource: runner.stats.gallopPercent === null ? null : "ATG_HORSE_RESULTS",
          gallopUpdatedAtMs: runner.stats.gallopPercent === null ? null : startMs,
          gallopIsFresh: runner.stats.gallopPercent !== null,
          oddsHistory: history,
        };
      });

      const missingOddsRunners = placeRunners
        .filter((runner) => !runner.scratched)
        .filter((runner) => {
          if (!runner.oddsHistory.length) return true;
          const firstTs = runner.oddsHistory[0].timestamp;
          return firstTs > window.collectionStartMs + 2 * 60_000;
        })
        .map((runner) => runner.number);

      const missingGallopRunners = placeRunners
        .filter((runner) => !runner.scratched)
        .filter((runner) => runner.gallopPercent === null)
        .map((runner) => runner.number);

      const hasFreshCurrentOddsPoint =
        latestPointMs !== null &&
        Math.abs(lockTimeMs - latestPointMs) <= lockGraceMs;

      const placeRace = {
        raceId: race.id,
        date: raceDate,
        trackId: track.id,
        trackName: track.name,
        raceNumber: race.raceNumber,
        plannedStartTime: race.startTime ?? new Date(startMs).toISOString(),
        raceStatus: race.status,
        isMonte: race.isMonte,
        startMethod: race.startMethod,
        distanceMeters: race.distanceMeters,
        starters: race.runners.filter((runner) => !runner.scratched).length,
      };

      const evaluation = evaluatePlaceModelAtLock({
        race: placeRace,
        runners: placeRunners,
        nowMs: startMs,
        config: PLACE_RULE_CONFIG_V1,
        alreadyLockedForVersion: false,
        appStartedAfterLock: false,
        hasCompleteIndicatorData: true,
        incompleteIndicatorRunnerNumbers: missingGallopRunners,
        hasCompleteOddsHistory: missingOddsRunners.length === 0,
        incompleteOddsHistoryRunnerNumbers: missingOddsRunners,
        hasFreshCurrentOddsPoint,
      });

      const evaluationWithTiming: PlaceEvaluation = {
        ...evaluation,
        snapshot: {
          ...evaluation.snapshot,
          lockTiming: {
            plannedLockTimeMs: lockTimeMs,
            lastFetchFinishedAtMs: startMs,
            actualSignalLockTimeMs: startMs,
            usedOddsPointTimestampMs: latestPointMs,
          },
        },
      };

      const { error: evalError } = await supabase.from("place_race_evaluations").upsert(
        {
          race_id: evaluationWithTiming.raceId,
          rule_version: evaluationWithTiming.ruleVersion,
          decision: evaluationWithTiming.decision,
          reasons: evaluationWithTiming.reasons,
          race_json: evaluationWithTiming.race,
          lock_time_ms: evaluationWithTiming.lockTimeMs,
          locked_at: evaluationWithTiming.lockedAt,
          config_snapshot: evaluationWithTiming.configSnapshot,
          checks_json: evaluationWithTiming.checks,
          smoothest_json: evaluationWithTiming.smoothest,
          snapshot_json: evaluationWithTiming.snapshot,
          created_at: evaluationWithTiming.createdAt,
          updated_at: evaluationWithTiming.updatedAt,
        },
        { onConflict: "race_id,rule_version" },
      );

      if (evalError) {
        throw new Error(`Could not upsert place evaluation ${race.id}: ${evalError.message}`);
      }

      summary.evaluationsCreated += 1;
      existingEvalKeys.add(raceKey);

      const existingBet = existingBetByKey.get(raceKey);
      if (!existingBet) {
        const bet = buildModelBetFromEvaluation({
          evaluation: evaluationWithTiming,
          stakeSEK: PLACE_RULE_CONFIG_V1.defaultStakeSEK,
          nowIso,
        });

        if (bet) {
          const { error: betError } = await supabase.from("place_model_bets").upsert(
            {
              bet_id: bet.betId,
              race_id: bet.raceId,
              rule_version: bet.ruleVersion,
              config_snapshot: bet.configSnapshot,
              date: bet.date,
              track_id: bet.trackId,
              track_name: bet.trackName,
              race_number: bet.raceNumber,
              planned_start_time: bet.plannedStartTime,
              lock_time: bet.lockTime,
              horse_number: bet.horseNumber,
              horse_name: bet.horseName,
              start_lane: bet.startLane,
              start_method: bet.startMethod,
              distance_meters: bet.distanceMeters,
              starters: bet.starters,
              start_odds: bet.startOdds,
              current_win_odds: bet.currentWinOdds,
              odds_drop_percent: bet.oddsDropPercent,
              cv_raw: bet.cvRaw,
              cv_display: bet.cvDisplay,
              strength: bet.strength,
              indicators_green: bet.indicatorsGreen,
              valid_odds_points: bet.validOddsPoints,
              stake_oren: bet.stakeOren,
              result_outcome: bet.resultOutcome,
              result_status: bet.resultStatus,
              finish_position_official: bet.finishPositionOfficial,
              place_odds_decimal: bet.placeOddsDecimal,
              return_oren: bet.returnOren,
              net_oren: bet.netOren,
              roi_pct: bet.roiPct,
              automatic_model_bet: bet.automaticModelBet,
              user_actually_played: bet.userActuallyPlayed,
              result_source: bet.resultSource,
              result_updated_at: bet.resultUpdatedAt,
              place_odds_entry_method: bet.placeOddsEntryMethod,
              created_at: bet.createdAt,
              updated_at: bet.updatedAt,
            },
            { onConflict: "race_id,rule_version" },
          );

          if (betError) {
            throw new Error(`Could not upsert place bet ${race.id}: ${betError.message}`);
          }

          summary.betsCreated += 1;
          existingBetByKey.set(raceKey, bet);
        }
      }
    }

    if (vapid) {
      for (const item of allRaces) {
        throwIfRunTimedOut(startMs);

        const { track, race } = item;
        const plannedStartTime = race.startTime;

        if (
          !plannedStartTime ||
          !isInWinPlaceFinalSignalWindow(
            plannedStartTime,
            startMs,
            WIN_PLACE_RULE_CONFIG_V1,
          )
        ) {
          continue;
        }

        try {
          const [
            winPlaceResult,
            placeResult,
          ] = await Promise.all([
            supabase
              .from("win_place_race_evaluations")
              .select("decision,most_shortened_json")
              .eq("race_id", race.id)
              .eq(
                "rule_version",
                WIN_PLACE_RULE_CONFIG_V1.ruleVersion,
              )
              .eq("signal_phase", "LIVE")
              .maybeSingle(),
            supabase
              .from("place_race_evaluations")
              .select("decision,smoothest_json")
              .eq("race_id", race.id)
              .eq(
                "rule_version",
                PLACE_RULE_CONFIG_V1.ruleVersion,
              )
              .maybeSingle(),
          ]);

          if (winPlaceResult.error) {
            throw new Error(
              `Could not load final win-place signal: ${winPlaceResult.error.message}`,
            );
          }

          if (placeResult.error) {
            throw new Error(
              `Could not load final place signal: ${placeResult.error.message}`,
            );
          }

          const winPlaceRow = winPlaceResult.data as {
            decision: string;
            most_shortened_json:
              | NonNullable<
                  WinPlaceEvaluation["mostShortened"]
                >
              | null;
          } | null;

          const placeRow = placeResult.data as {
            decision: string;
            smoothest_json:
              | NonNullable<PlaceEvaluation["smoothest"]>
              | null;
          } | null;

          const winPlaceCandidate =
            winPlaceRow?.decision === "PLAY"
              ? winPlaceRow.most_shortened_json
              : null;

          const placeCandidate =
            placeRow?.decision === "PLAY"
              ? placeRow.smoothest_json
              : null;

          if (!winPlaceCandidate && !placeCandidate) {
            continue;
          }

          const delivery =
            await deliverFinalSignalNotification({
              supabase,
              vapid,
              raceDate,
              raceId: race.id,
              trackId: track.id,
              trackName: track.name,
              raceNumber: race.raceNumber,
              plannedStartTime,
              winPlaceCandidate,
              placeCandidate,
              nowIso,
            });

          if (delivery.claimed) {
            summary.notificationsClaimed += 1;
          }

          summary.notificationsSent += delivery.sent;
          summary.notificationSubscriptionsAttempted +=
            delivery.attempted;
          summary.notificationSubscriptionsFailed +=
            delivery.failed;
        } catch (notificationError) {
          console.warn(
            `Final signal notification failed for race ${race.id}: ${
              notificationError instanceof Error
                ? notificationError.message
                : "Unknown error"
            }`,
          );
        }
      }
    }

    const lookbackDays = Number(env.BET_SETTLEMENT_LOOKBACK_DAYS ?? String(DEFAULT_SETTLEMENT_LOOKBACK_DAYS));
    const lowerDate = getRaceDateInStockholm(startMs - lookbackDays * 24 * 60 * 60 * 1000);

    const {
      data: pendingWinPlaceRows,
      error: pendingWinPlaceError,
    } = await supabase
      .from("win_place_model_bets")
      .select(
        "id,bet_id,race_id,rule_version,market,signal_phase,date,track_id,track_name,race_number,horse_number,horse_name,stake_oren,result_outcome",
      )
      .eq("rule_version", WIN_PLACE_RULE_CONFIG_V1.ruleVersion)
      .eq("signal_phase", "LIVE")
      .eq("result_outcome", "PENDING")
      .gte("date", lowerDate)
      .order("date", { ascending: true });

    if (pendingWinPlaceError) {
      throw new Error(
        `Could not load pending win-place bets: ${pendingWinPlaceError.message}`,
      );
    }

    const pendingWinPlaceBets =
      (pendingWinPlaceRows ?? []) as WinPlacePendingBetRow[];

    const winPlaceBetsByRace = new Map<
      string,
      WinPlacePendingBetRow[]
    >();

    for (const bet of pendingWinPlaceBets) {
      const key = [
        bet.date,
        bet.track_id,
        bet.race_number,
      ].join(":");

      const list = winPlaceBetsByRace.get(key) ?? [];
      list.push(bet);
      winPlaceBetsByRace.set(key, list);
    }

    for (const bets of winPlaceBetsByRace.values()) {
      throwIfRunTimedOut(startMs);

      const firstBet = bets[0];

      if (!firstBet) {
        continue;
      }

      const race = await fetchRaceForTrack({
        apiBaseUrl,
        raceDate: firstBet.date,
        trackId: firstBet.track_id,
        raceNumber: firstBet.race_number,
        signal: runController.signal,
      }).catch(() => null);

      if (!race) {
        summary.winPlaceSettlementSkipped += bets.length;
        continue;
      }

      const raceCancelled =
        /install|inst[äa]lld|inst[äa]llt|cancel/i.test(
          race.status ?? "",
        );

      for (const bet of bets) {
        const runner =
          race.runners.find(
            (item) => item.number === bet.horse_number,
          ) ?? null;

        const finishPositionIndex =
          race.finishOrder.indexOf(bet.horse_number);

        const finishPosition =
          finishPositionIndex >= 0
            ? finishPositionIndex + 1
            : null;

        const horseScratched = runner?.scratched === true;

        const officialWinOddsDecimal =
          toDecimalOdds(runner?.oddsRaw ?? null);

        const placeOddsDecimal =
          toDecimalOdds(runner?.placeOddsRaw ?? null);

        const settled = settleWinPlaceBet({
          market: bet.market,
          stakeOren: bet.stake_oren,
          raceCancelled,
          horseScratched,
          finishPosition,
          officialWinOddsDecimal,
          placeOddsDecimal,
          placeHitMaxOfficialFinishPosition:
            WIN_PLACE_RULE_CONFIG_V1
              .placeHitMaxOfficialFinishPosition,
        });

        if (settled.resultOutcome === "PENDING") {
          summary.winPlaceSettlementSkipped += 1;
          continue;
        }

        const settledAt = new Date().toISOString();

        const { error: updateError } = await supabase
          .from("win_place_model_bets")
          .update({
            result_outcome: settled.resultOutcome,
            result_status: settled.resultStatus,
            finish_position_official:
              settled.finishPositionOfficial,
            official_win_odds_decimal:
              settled.officialWinOddsDecimal,
            place_odds_decimal:
              settled.placeOddsDecimal,
            return_oren: settled.returnOren,
            net_oren: settled.netOren,
            roi_pct: settled.roiPct,
            result_source: "ATG",
            result_updated_at: settledAt,
            updated_at: settledAt,
          })
          .eq("id", bet.id)
          .eq("result_outcome", "PENDING");

        if (updateError) {
          throw new Error(
            `Could not settle win-place bet ${bet.bet_id}: ${updateError.message}`,
          );
        }

        if (settled.resultOutcome === "VOID") {
          summary.winPlaceBetsVoided += 1;
        } else {
          summary.winPlaceBetsSettled += 1;
        }
      }
    }

    const { data: pendingRows, error: pendingError } = await supabase
      .from("place_model_bets")
      .select("*")
      .eq("rule_version", PLACE_RULE_CONFIG_V1.ruleVersion)
      .eq("result_outcome", "PENDING")
      .gte("date", lowerDate)
      .order("date", { ascending: true });

    if (pendingError) {
      throw new Error(`Could not load pending bets: ${pendingError.message}`);
    }

    const pendingBets = ((pendingRows ?? []) as DbBetRow[]).map(parseDbBetRow);
    for (const bet of pendingBets) {
      throwIfRunTimedOut(startMs);
      const race = await fetchRaceForTrack({
        apiBaseUrl,
        raceDate: bet.date,
        trackId: bet.trackId,
        raceNumber: bet.raceNumber,
        signal: runController.signal,
      }).catch(() => null);

      if (!race) {
        summary.settlementSkipped += 1;
        continue;
      }

      const runner = race.runners.find((item) => item.number === bet.horseNumber) ?? null;
      const finishPosition = race.finishOrder.indexOf(bet.horseNumber) + 1;
      const placeOddsDecimal = runner?.placeOddsRaw ? runner.placeOddsRaw / 100 : null;
      const raceCancelled = /install|inst[äa]lld|inst[äa]llt|cancel/i.test(race.status ?? "");
      const horseScratched = runner?.scratched === true;

      const settled = settleModelBet({
        bet,
        raceCancelled,
        horseScratched,
        finishPosition: finishPosition > 0 ? finishPosition : null,
        placeOddsDecimal,
        config: PLACE_RULE_CONFIG_V1,
        nowIso: new Date().toISOString(),
      });

      const changed =
        bet.resultOutcome !== settled.resultOutcome ||
        bet.resultStatus !== settled.resultStatus ||
        bet.finishPositionOfficial !== settled.finishPositionOfficial ||
        bet.placeOddsDecimal !== settled.placeOddsDecimal ||
        bet.returnOren !== settled.returnOren ||
        bet.netOren !== settled.netOren ||
        bet.roiPct !== settled.roiPct;

      if (!changed) continue;

      const { error: settledError } = await supabase.from("place_model_bets").upsert(
        {
          bet_id: settled.betId,
          race_id: settled.raceId,
          rule_version: settled.ruleVersion,
          config_snapshot: settled.configSnapshot,
          date: settled.date,
          track_id: settled.trackId,
          track_name: settled.trackName,
          race_number: settled.raceNumber,
          planned_start_time: settled.plannedStartTime,
          lock_time: settled.lockTime,
          horse_number: settled.horseNumber,
          horse_name: settled.horseName,
          start_lane: settled.startLane,
          start_method: settled.startMethod,
          distance_meters: settled.distanceMeters,
          starters: settled.starters,
          start_odds: settled.startOdds,
          current_win_odds: settled.currentWinOdds,
          odds_drop_percent: settled.oddsDropPercent,
          cv_raw: settled.cvRaw,
          cv_display: settled.cvDisplay,
          strength: settled.strength,
          indicators_green: settled.indicatorsGreen,
          valid_odds_points: settled.validOddsPoints,
          stake_oren: settled.stakeOren,
          result_outcome: settled.resultOutcome,
          result_status: settled.resultStatus,
          finish_position_official: settled.finishPositionOfficial,
          place_odds_decimal: settled.placeOddsDecimal,
          return_oren: settled.returnOren,
          net_oren: settled.netOren,
          roi_pct: settled.roiPct,
          automatic_model_bet: settled.automaticModelBet,
          user_actually_played: settled.userActuallyPlayed,
          result_source: settled.resultSource,
          result_updated_at: settled.resultUpdatedAt,
          place_odds_entry_method: settled.placeOddsEntryMethod,
          created_at: settled.createdAt,
          updated_at: settled.updatedAt,
        },
        { onConflict: "race_id,rule_version" },
      );

      if (settledError) {
        throw new Error(`Could not settle bet ${bet.betId}: ${settledError.message}`);
      }

      if (settled.resultOutcome === "VOID") {
        summary.betsVoided += 1;
      } else if (settled.resultOutcome !== "PENDING") {
        summary.betsSettled += 1;
      }
    }

    await supabase.from("place_live_worker_runs").update({
      finished_at: new Date().toISOString(),
      status: "SUCCESS",
      summary_json: summary,
    }).eq("id", runId);

    return {
      ok: true,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error";

    await supabase.from("place_live_worker_runs").update({
      finished_at: new Date().toISOString(),
      status: "FAILED",
      error_text: message,
      summary_json: summary,
    }).eq("id", runId);

    throw error;
  } finally {
    clearTimeout(runTimeoutHandle);
  }
}


const ATG_PROXY_PREFIX = "/atg";
const PLACE_HISTORY_PATH = "/api/place-live/history";
const PUSH_PUBLIC_KEY_PATH = "/api/push/public-key";
const PUSH_SUBSCRIBE_PATH = "/api/push/subscribe";
const ATG_PROXY_BASE_URL = "https://www.atg.se/services/racinginfo/v1/api";

function withCors(headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("Access-Control-Allow-Origin", "*");
  result.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  result.set("Access-Control-Allow-Headers", "Content-Type");
  return result;
}

async function proxyAtgRequest(request: Request, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: withCors({ "Content-Type": "text/plain; charset=utf-8" }),
    });
  }

  const suffix = url.pathname.slice(ATG_PROXY_PREFIX.length);
  if (!suffix.startsWith("/")) {
    return new Response("Not found", {
      status: 404,
      headers: withCors(),
    });
  }

  const target = new URL(`${ATG_PROXY_BASE_URL}${suffix}`);
  target.search = url.search;

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: {
      Accept: request.headers.get("Accept") ?? "application/json",
    },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: withCors(upstream.headers),
  });
}

function jsonWithCors(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: withCors({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
  });
}

async function getPushPublicKey(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonWithCors({ ok: false, error: "Method not allowed" }, 405);
  }

  const publicKey = env.VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return jsonWithCors(
      { ok: false, error: "Push notifications are not configured" },
      503,
    );
  }

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: withCors({ "Cache-Control": "no-store" }),
    });
  }

  return jsonWithCors({
    ok: true,
    publicKey,
  });
}

async function savePushSubscription(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (request.method !== "POST") {
    return jsonWithCors({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const subscription = parsePushSubscription(await request.json());

    if (!subscription) {
      return jsonWithCors(
        { ok: false, error: "Invalid push subscription" },
        400,
      );
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseClient(env);

    const { error } = await supabase
      .from("place_push_subscriptions")
      .upsert(
        {
          endpoint: subscription.endpoint,
          expiration_time: subscription.expirationTime,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: request.headers.get("User-Agent"),
          active: true,
          failure_count: 0,
          updated_at: now,
        },
        {
          onConflict: "endpoint",
        },
      );

    if (error) {
      throw new Error(`Could not save push subscription: ${error.message}`);
    }

    return jsonWithCors({
      ok: true,
      subscribed: true,
    });
  } catch (error) {
    return jsonWithCors(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
}

async function getPlaceOddsHistory(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: withCors({ "Content-Type": "text/plain; charset=utf-8" }),
    });
  }

  const raceDate = url.searchParams.get("date")?.trim() ?? "";
  const trackId = Number(url.searchParams.get("trackId"));
  const raceNumber = Number(url.searchParams.get("raceNumber"));
  const since = url.searchParams.get("since")?.trim() || null;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raceDate) ||
    !Number.isInteger(trackId) ||
    trackId <= 0 ||
    !Number.isInteger(raceNumber) ||
    raceNumber <= 0
  ) {
    return jsonWithCors(
      {
        ok: false,
        error: "date, trackId and raceNumber are required",
      },
      400,
    );
  }

  if (since !== null && !Number.isFinite(Date.parse(since))) {
    return jsonWithCors(
      {
        ok: false,
        error: "since must be a valid ISO timestamp",
      },
      400,
    );
  }

  try {
    const supabase = createSupabaseClient(env);

    let query = supabase
      .from("place_live_odds_points")
      .select(
        "race_id,race_date,track_id,track_name,race_number,runner_number,horse_id,horse_name,market,odds_decimal,point_ts",
      )
      .eq("race_date", raceDate)
      .eq("track_id", trackId)
      .eq("race_number", raceNumber)
      .order("point_ts", { ascending: true })
      .order("runner_number", { ascending: true })
      .limit(5000);

    if (since !== null) {
      query = query.gt("point_ts", since);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Could not load place odds history: ${error.message}`);
    }

    const points = (data ?? []).map((row) => ({
      raceId: row.race_id,
      raceDate: row.race_date,
      trackId: row.track_id,
      trackName: row.track_name,
      raceNumber: row.race_number,
      runnerNumber: row.runner_number,
      horseId: row.horse_id,
      horseName: row.horse_name,
      market: row.market,
      oddsDecimal: Number(row.odds_decimal),
      pointTs: row.point_ts,
    }));

    const payload = {
      ok: true,
      raceDate,
      trackId,
      raceNumber,
      count: points.length,
      firstPointTs: points.at(0)?.pointTs ?? null,
      lastPointTs: points.at(-1)?.pointTs ?? null,
      points,
    };

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: withCors({
          "Cache-Control": "no-store",
          "X-Odds-Point-Count": String(points.length),
        }),
      });
    }

    return jsonWithCors(payload);
  } catch (error) {
    return jsonWithCors(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === ATG_PROXY_PREFIX ||
      url.pathname.startsWith(`${ATG_PROXY_PREFIX}/`)
    ) {
      return proxyAtgRequest(request, url);
    }

    if (url.pathname === PUSH_PUBLIC_KEY_PATH) {
      return getPushPublicKey(request, env);
    }

    if (url.pathname === PUSH_SUBSCRIBE_PATH) {
      return savePushSubscription(request, env);
    }

    if (url.pathname === PLACE_HISTORY_PATH) {
      return getPlaceOddsHistory(request, url, env);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/run-now") {
      try {
        const result = await runCron(env);
        return Response.json(result, { status: 200 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ ok: false, error: message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
