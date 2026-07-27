const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const NAIVE_ATG_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

function stockholmOffsetMs(atUtcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STOCKHOLM_TIME_ZONE,
    timeZoneName: "longOffset",
    hour: "2-digit",
  }).formatToParts(new Date(atUtcMs));

  const offsetText =
    parts.find((part) => part.type === "timeZoneName")?.value ?? "";

  const match = offsetText.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Kunde inte bestämma Stockholm-offset: ${offsetText}`);
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  return sign * (hours * 60 + minutes) * 60_000;
}

export function parseAtgStartTimeMs(startTime: string): number {
  const value = startTime.trim();
  if (!value) return Number.NaN;

  // Tidsstämplar som redan innehåller Z eller UTC-offset ska respekteras.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) {
    return Date.parse(value);
  }

  const match = value.match(NAIVE_ATG_TIME);
  if (!match) return Number.NaN;

  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));

  const naiveUtcMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? "0"),
    milliseconds,
  );

  let offsetMs = stockholmOffsetMs(naiveUtcMs);
  let resultMs = naiveUtcMs - offsetMs;

  // Kontrollera offseten igen vid den färdiga tidpunkten, viktigt nära DST-byte.
  const correctedOffsetMs = stockholmOffsetMs(resultMs);
  if (correctedOffsetMs !== offsetMs) {
    offsetMs = correctedOffsetMs;
    resultMs = naiveUtcMs - offsetMs;
  }

  return resultMs;
}

export function normalizeAtgStartTime(
  startTime: string | undefined,
): string | undefined {
  if (!startTime) return undefined;

  const startMs = parseAtgStartTimeMs(startTime);
  if (!Number.isFinite(startMs)) return undefined;

  return new Date(startMs).toISOString();
}
