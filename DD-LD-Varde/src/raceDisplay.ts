export type RaceStartMethod =
  | "AUTO"
  | "VOLT"
  | "UNKNOWN";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function getPath(
  value: unknown,
  path: readonly string[],
): unknown {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }

  return current;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(",", ".");

    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function firstNumber(
  value: unknown,
  paths: readonly (readonly string[])[],
) {
  for (const path of paths) {
    const parsed = asNumber(getPath(value, path));
    if (parsed !== null) return parsed;
  }

  return null;
}

function firstString(
  value: unknown,
  paths: readonly (readonly string[])[],
) {
  for (const path of paths) {
    const parsed = asString(getPath(value, path));
    if (parsed !== null) return parsed;
  }

  return null;
}

function collectStrings(
  value: unknown,
  depth = 0,
): string[] {
  if (depth > 6) return [];

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectStrings(item, depth + 1)
    );
  }

  const record = asRecord(value);
  if (!record) return [];

  return Object.values(record).flatMap((item) =>
    collectStrings(item, depth + 1)
  );
}

export function parseRaceStartMethod(
  value: unknown,
): RaceStartMethod {
  const direct =
    firstString(value, [
      ["startMethod"],
      ["startType"],
      ["method"],
      ["raceStartMethod"],
      ["conditions", "startMethod"],
      ["conditions", "startType"],
    ]) ?? "";

  const text = [
    direct,
    ...collectStrings(value),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /\bauto(?:start)?\b/i.test(text) ||
    /\bautostart\b/i.test(text)
  ) {
    return "AUTO";
  }

  if (
    /\bvolt(?:start)?\b/i.test(text) ||
    /\bvoltstart\b/i.test(text)
  ) {
    return "VOLT";
  }

  return "UNKNOWN";
}

export function parseRaceDistanceMeters(
  value: unknown,
): number | null {
  const direct = firstNumber(value, [
    ["distance"],
    ["distanceMeters"],
    ["raceDistance"],
    ["raceDistanceMeters"],
    ["baseDistance"],
    ["conditions", "distance"],
    ["conditions", "distanceMeters"],
  ]);

  if (
    direct !== null &&
    direct >= 1000 &&
    direct <= 5000
  ) {
    return Math.round(direct);
  }

  const text = collectStrings(value).join(" ");
  const match = text.match(
    /\b(1[0-9]{3}|2[0-9]{3}|3[0-9]{3}|4[0-9]{3})\s*(?:m|meter)\b/i,
  );

  if (!match) return null;

  const parsed = Number(match[1]);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function formatRaceType(
  startMethod: RaceStartMethod,
  distanceMeters: number | null,
) {
  if (distanceMeters === null) {
    return startMethod === "AUTO"
      ? "AUTO"
      : startMethod === "VOLT"
        ? "VOLT"
        : "–";
  }

  if (startMethod === "AUTO") {
    return `A${distanceMeters}`;
  }

  if (startMethod === "VOLT") {
    return `V${distanceMeters}`;
  }

  return `${distanceMeters} m`;
}

export function liveRefreshIntervalSeconds(
  startTime: string | undefined,
  nowMs: number,
): 30 | 60 {
  if (!startTime) return 60;

  const startMs = Date.parse(startTime);

  if (!Number.isFinite(startMs)) {
    return 60;
  }

  const timeLeftMs = startMs - nowMs;

  return timeLeftMs > 0 &&
    timeLeftMs <= 5 * 60_000
    ? 30
    : 60;
}
