const GALLOP_QUALIFIER_TYPE = "qualifier";

export const GALLOP_CACHE_TTL_MS = 10 * 60_000;
export const GALLOP_MIN_RECORDS = 3;

export type UnknownRecord = Record<string, unknown>;

export type GallopSource = "ATG_RACE_START" | "ATG_HORSE_RESULTS";

export type GallopCacheEntry = {
  horseId: number;
  gallopPercent: number | null;
  fetchedAtMs: number;
  source: GallopSource;
  stale: boolean;
  lastError: string | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return [];
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function computeGallopPercentFromHorseResultsPayload(payload: unknown): number | null {
  const records = getArray(payload, "records").filter(isRecord);
  const relevant = records.filter((record) => {
    const race = isRecord(record.race) ? record.race : null;
    const raceType = asString(race?.type).toLowerCase();
    return raceType !== GALLOP_QUALIFIER_TYPE;
  });

  if (relevant.length < GALLOP_MIN_RECORDS) return null;

  const gallopCount = relevant.reduce((sum, record) => {
    const place = asString(record.place).toLowerCase().trim();
    const gallopedFlag = record.galloped === true;
    const gallopByPlace = place === "g" || place === "dg" || place.includes("galopp");
    return sum + (gallopedFlag || gallopByPlace ? 1 : 0);
  }, 0);

  return (gallopCount / relevant.length) * 100;
}

export async function fetchHorseGallopPercent(args: {
  horseId: number;
  apiBaseUrl: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<number | null> {
  const { horseId, apiBaseUrl, signal, fetchImpl = fetch } = args;
  if (!Number.isFinite(horseId) || horseId <= 0) return null;

  try {
    const response = await fetchImpl(`${apiBaseUrl}/horses/${horseId}/results`, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    return computeGallopPercentFromHorseResultsPayload(payload);
  } catch {
    return null;
  }
}

export function isGallopEntryFresh(entry: GallopCacheEntry | undefined, nowMs: number, ttlMs = GALLOP_CACHE_TTL_MS) {
  if (!entry) return false;
  if (!isFiniteNumber(entry.fetchedAtMs)) return false;
  return nowMs - entry.fetchedAtMs <= ttlMs;
}

export function upsertGallopCacheEntry(args: {
  current: Record<number, GallopCacheEntry>;
  horseId: number;
  gallopPercent: number | null;
  fetchedAtMs: number;
  source: GallopSource;
  lastError?: string | null;
}): Record<number, GallopCacheEntry> {
  const { current, horseId, gallopPercent, fetchedAtMs, source, lastError = null } = args;
  return {
    ...current,
    [horseId]: {
      horseId,
      gallopPercent,
      fetchedAtMs,
      source,
      stale: false,
      lastError,
    },
  };
}

export function markStaleGallopEntries(args: {
  current: Record<number, GallopCacheEntry>;
  nowMs: number;
  ttlMs?: number;
}): Record<number, GallopCacheEntry> {
  const { current, nowMs, ttlMs = GALLOP_CACHE_TTL_MS } = args;
  let changed = false;
  const next: Record<number, GallopCacheEntry> = {};

  for (const [horseIdText, entry] of Object.entries(current)) {
    const stale = !isGallopEntryFresh(entry, nowMs, ttlMs);
    if (entry.stale !== stale) changed = true;
    next[Number(horseIdText)] = {
      ...entry,
      stale,
    };
  }

  return changed ? next : current;
}

export function horseIdsNeedingGallopRefresh(args: {
  horseIds: number[];
  cache: Record<number, GallopCacheEntry>;
  nowMs: number;
  inFlight: Set<number>;
  ttlMs?: number;
}): number[] {
  const { horseIds, cache, nowMs, inFlight, ttlMs = GALLOP_CACHE_TTL_MS } = args;
  return horseIds.filter((horseId) => {
    if (!Number.isFinite(horseId) || horseId <= 0) return false;
    if (inFlight.has(horseId)) return false;
    const entry = cache[horseId];
    return !isGallopEntryFresh(entry, nowMs, ttlMs);
  });
}

export function rankTop4ByGallop(args: {
  entries: Array<{ horseId: number | null; gallopPercent: number | null; scratched?: boolean }>;
}): number[] {
  const { entries } = args;
  return entries
    .filter((entry) => entry.scratched !== true)
    .filter((entry): entry is { horseId: number; gallopPercent: number; scratched?: boolean } =>
      entry.horseId !== null && isFiniteNumber(entry.gallopPercent),
    )
    .sort((a, b) => {
      if (a.gallopPercent !== b.gallopPercent) return a.gallopPercent - b.gallopPercent;
      return a.horseId - b.horseId;
    })
    .slice(0, 4)
    .map((entry) => entry.horseId);
}

export function validateGallopCoverageAtLock(args: {
  activeRunners: Array<{ number: number; horseId: number | null; raceGallopPercent: number | null }>;
  cache: Record<number, GallopCacheEntry>;
  nowMs: number;
  ttlMs?: number;
}) {
  const { activeRunners, cache, nowMs, ttlMs = GALLOP_CACHE_TTL_MS } = args;
  const missingRunnerNumbers: number[] = [];

  for (const runner of activeRunners) {
    const raceGallopValid = isFiniteNumber(runner.raceGallopPercent);
    if (raceGallopValid) continue;

    const horseId = runner.horseId;
    const cacheEntry = horseId !== null ? cache[horseId] : undefined;
    const cacheGallopValid =
      cacheEntry !== undefined &&
      isFiniteNumber(cacheEntry.gallopPercent) &&
      isGallopEntryFresh(cacheEntry, nowMs, ttlMs) &&
      !cacheEntry.stale;

    if (!cacheGallopValid) {
      missingRunnerNumbers.push(runner.number);
    }
  }

  return {
    complete: missingRunnerNumbers.length === 0,
    missingRunnerNumbers,
  };
}

export function resolveRunnerGallop(args: {
  raceGallopPercent: number | null;
  horseId: number | null;
  cache: Record<number, GallopCacheEntry>;
  nowMs: number;
  ttlMs?: number;
}): {
  gallopPercent: number | null;
  source: GallopSource | null;
  fetchedAtMs: number | null;
  stale: boolean;
} {
  const { raceGallopPercent, horseId, cache, nowMs, ttlMs = GALLOP_CACHE_TTL_MS } = args;

  if (isFiniteNumber(raceGallopPercent)) {
    return {
      gallopPercent: raceGallopPercent,
      source: "ATG_RACE_START",
      fetchedAtMs: null,
      stale: false,
    };
  }

  if (horseId === null) {
    return {
      gallopPercent: null,
      source: null,
      fetchedAtMs: null,
      stale: true,
    };
  }

  const entry = cache[horseId];
  if (!entry) {
    return {
      gallopPercent: null,
      source: null,
      fetchedAtMs: null,
      stale: true,
    };
  }

  const fresh = isGallopEntryFresh(entry, nowMs, ttlMs) && !entry.stale;
  return {
    gallopPercent: fresh && isFiniteNumber(entry.gallopPercent) ? entry.gallopPercent : null,
    source: fresh ? entry.source : null,
    fetchedAtMs: fresh ? entry.fetchedAtMs : null,
    stale: !fresh,
  };
}