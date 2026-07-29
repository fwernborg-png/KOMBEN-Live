export type ParsedResearchStartMethod =
  | "AUTO"
  | "VOLT"
  | "UNKNOWN";

export type ParsedResearchMeetingTimeCategory =
  | "LUNCH"
  | "DAY"
  | "EVENING"
  | "NIGHT"
  | "UNKNOWN";

export type ParsedResearchProduct = {
  productCode: string;
  productId: string | null;
  legNumber: number | null;
  totalLegs: number | null;
  rawProductJson: Record<string, unknown>;
};

export type ParsedResearchRaceMeta = {
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
};

export type ParsedResearchRunnerMeta = {
  startLane: number | null;
  startDistanceMeters: number | null;

  horseAge: number | null;
  horseSex: string | null;

  driverId: number | null;
  driverName: string | null;

  trainerId: number | null;
  trainerName: string | null;
};

type UnknownRecord = Record<string, unknown>;

const KNOWN_PRODUCT_CODES = [
  "GS75",
  "TOP7",
  "V86",
  "V85",
  "V75",
  "V65",
  "V64",
  "V5",
  "V4",
  "V3",
  "DD",
  "LD",
] as const;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asNumber(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function getPath(
  value: unknown,
  path: readonly string[],
): unknown {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) {
      return null;
    }

    current = record[key];
  }

  return current;
}

function firstNumber(
  value: unknown,
  paths: readonly (readonly string[])[],
): number | null {
  for (const path of paths) {
    const candidate = asNumber(getPath(value, path));

    if (candidate !== null) {
      return candidate;
    }
  }

  return null;
}

function firstString(
  value: unknown,
  paths: readonly (readonly string[])[],
): string | null {
  for (const path of paths) {
    const candidate = asString(getPath(value, path));

    if (candidate !== null) {
      return candidate;
    }
  }

  return null;
}

function collectStrings(
  value: unknown,
  depth = 0,
): string[] {
  if (depth > 6) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectStrings(item, depth + 1),
    );
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.values(record).flatMap((item) =>
    collectStrings(item, depth + 1),
  );
}

function parseStartMethod(
  value: unknown,
): ParsedResearchStartMethod {
  const direct =
    firstString(value, [
      ["startMethod"],
      ["startType"],
      ["method"],
      ["raceStartMethod"],
      ["conditions", "startMethod"],
      ["conditions", "startType"],
    ]) ?? "";

  const combined = [
    direct,
    ...collectStrings(value),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /\bauto(?:start)?\b/i.test(combined) ||
    /\bautostart\b/i.test(combined)
  ) {
    return "AUTO";
  }

  if (
    /\bvolt(?:start)?\b/i.test(combined) ||
    /\bvoltstart\b/i.test(combined)
  ) {
    return "VOLT";
  }

  return "UNKNOWN";
}

function parseDistanceFromText(
  value: unknown,
): number | null {
  const text = collectStrings(value).join(" ");

  const match = text.match(
    /\b(1[0-9]{3}|2[0-9]{3}|3[0-9]{3}|4[0-9]{3})\s*m(?:eter)?\b/i,
  );

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDistance(
  value: number | null,
): number | null {
  if (
    value === null ||
    value < 1_000 ||
    value > 5_000
  ) {
    return null;
  }

  return Math.round(value);
}

function parseRangeFromText(
  value: unknown,
  unitPattern: string,
): {
  min: number | null;
  max: number | null;
} {
  const text = collectStrings(value).join(" ");

  const regex = new RegExp(
    `(\\d[\\d .]*)\\s*[-–]\\s*(\\d[\\d .]*)\\s*${unitPattern}`,
    "i",
  );

  const match = text.match(regex);

  if (!match) {
    return {
      min: null,
      max: null,
    };
  }

  const parseAmount = (raw: string) => {
    const compact = raw.replace(/[ .]/g, "");
    const parsed = Number(compact);

    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    min: parseAmount(match[1]),
    max: parseAmount(match[2]),
  };
}

function parseFirstPrizeFromText(
  value: unknown,
): number | null {
  const text = collectStrings(value).join(" ");

  const match = text.match(
    /pris(?:er)?\s*:\s*(\d[\d .]*)/i,
  );

  if (!match) {
    return null;
  }

  const parsed = Number(
    match[1].replace(/[ .]/g, ""),
  );

  return Number.isFinite(parsed) ? parsed : null;
}

function parseProductLeg(
  text: string,
  code: string,
): {
  legNumber: number | null;
  totalLegs: number | null;
} {
  const escaped = code.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const match = text.match(
    new RegExp(
      `\\b${escaped}\\s*[- ]?\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{1,2}))?\\b`,
      "i",
    ),
  );

  if (!match) {
    return {
      legNumber: null,
      totalLegs: null,
    };
  }

  const legNumber = Number(match[1]);
  const totalLegs = match[2]
    ? Number(match[2])
    : null;

  return {
    legNumber:
      Number.isFinite(legNumber) ? legNumber : null,
    totalLegs:
      totalLegs !== null &&
      Number.isFinite(totalLegs)
        ? totalLegs
        : null,
  };
}

export function parseResearchProducts(
  value: unknown,
): ParsedResearchProduct[] {
  const strings = collectStrings(value);
  const combined = strings.join(" ");

  const products: ParsedResearchProduct[] = [];

  for (const code of KNOWN_PRODUCT_CODES) {
    const regex = new RegExp(
      `(^|[^A-Z0-9])${code}([^A-Z0-9]|$)`,
      "i",
    );

    if (!regex.test(combined)) {
      continue;
    }

    const leg = parseProductLeg(combined, code);

    products.push({
      productCode: code,
      productId: null,
      legNumber: leg.legNumber,
      totalLegs: leg.totalLegs,
      rawProductJson: {
        detectedFromText: true,
        matchedCode: code,
      },
    });
  }

  return products;
}

export function parseResearchRaceMeta(
  value: unknown,
): ParsedResearchRaceMeta {
  const directDistance = firstNumber(value, [
    ["distanceMeters"],
    ["distance"],
    ["raceDistance"],
    ["conditions", "distanceMeters"],
    ["conditions", "distance"],
  ]);

  const earningsFromFields = {
    min: firstNumber(value, [
      ["earningsMin"],
      ["minEarnings"],
      ["conditions", "earningsMin"],
      ["conditions", "minEarnings"],
    ]),
    max: firstNumber(value, [
      ["earningsMax"],
      ["maxEarnings"],
      ["conditions", "earningsMax"],
      ["conditions", "maxEarnings"],
    ]),
  };

  const earningsFromText = parseRangeFromText(
    value,
    "(?:kr|kronor)",
  );

  return {
    raceName: firstString(value, [
      ["name"],
      ["raceName"],
      ["title"],
      ["conditions", "name"],
    ]),

    startMethod: parseStartMethod(value),

    distanceMeters:
      normalizeDistance(directDistance) ??
      normalizeDistance(parseDistanceFromText(value)),

    raceClassCode: firstString(value, [
      ["classCode"],
      ["raceClass"],
      ["class"],
      ["conditions", "classCode"],
      ["conditions", "class"],
    ]),

    raceCategory: firstString(value, [
      ["category"],
      ["raceCategory"],
      ["breed"],
      ["conditions", "category"],
    ]),

    earningsMin:
      earningsFromFields.min ??
      earningsFromText.min,

    earningsMax:
      earningsFromFields.max ??
      earningsFromText.max,

    ageMin: firstNumber(value, [
      ["ageMin"],
      ["minAge"],
      ["conditions", "ageMin"],
      ["conditions", "minAge"],
    ]),

    ageMax: firstNumber(value, [
      ["ageMax"],
      ["maxAge"],
      ["conditions", "ageMax"],
      ["conditions", "maxAge"],
    ]),

    firstAdditionalDistanceMeters:
      firstNumber(value, [
        ["firstAdditionalDistanceMeters"],
        ["additionalDistance"],
        ["conditions", "additionalDistance"],
        ["conditions", "firstAdditionalDistance"],
      ]),

    prizeMoneyTotal: firstNumber(value, [
      ["prizeMoneyTotal"],
      ["totalPrizeMoney"],
      ["prizeMoney", "total"],
      ["conditions", "prizeMoneyTotal"],
    ]),

    firstPrize:
      firstNumber(value, [
        ["firstPrize"],
        ["prizeMoney", "firstPrize"],
        ["conditions", "firstPrize"],
      ]) ?? parseFirstPrizeFromText(value),

    products: parseResearchProducts(value),
  };
}

export function parseResearchRunnerMeta(
  value: unknown,
): ParsedResearchRunnerMeta {
  const horseRecord =
    asRecord(getPath(value, ["horse"])) ??
    asRecord(value);

  const driverRecord =
    asRecord(getPath(value, ["driver"])) ??
    asRecord(getPath(value, ["rider"]));

  const trainerRecord =
    asRecord(getPath(value, ["trainer"]));

  return {
    startLane: firstNumber(value, [
      ["postPosition"],
      ["startPosition"],
      ["startLane"],
      ["lane"],
      ["start", "position"],
      ["start", "lane"],
    ]),

    startDistanceMeters: normalizeDistance(
      firstNumber(value, [
        ["startDistance"],
        ["startDistanceMeters"],
        ["distance"],
        ["distanceMeters"],
        ["start", "distance"],
      ]),
    ),

    horseAge: firstNumber(horseRecord, [
      ["age"],
      ["horseAge"],
    ]),

    horseSex: firstString(horseRecord, [
      ["sex"],
      ["gender"],
    ]),

    driverId:
      firstNumber(driverRecord, [
        ["id"],
        ["driverId"],
        ["personId"],
      ]) ??
      firstNumber(value, [["driverId"]]),

    driverName:
      firstString(driverRecord, [
        ["name"],
        ["fullName"],
      ]) ??
      firstString(value, [["driverName"]]),

    trainerId:
      firstNumber(trainerRecord, [
        ["id"],
        ["trainerId"],
        ["personId"],
      ]) ??
      firstNumber(value, [["trainerId"]]),

    trainerName:
      firstString(trainerRecord, [
        ["name"],
        ["fullName"],
      ]) ??
      firstString(value, [["trainerName"]]),
  };
}

export function inferResearchMeetingTimeCategory(
  args: {
    plannedStartTime: string | null;
    rawMeetingOrRace: unknown;
  },
): {
  category: ParsedResearchMeetingTimeCategory;
  method: string;
} {
  const sourceText = collectStrings(
    args.rawMeetingOrRace,
  )
    .join(" ")
    .toLowerCase();

  const hasExplicitLunchLabel =
    /(^|[^a-zåäö])lunch[a-zåäö]*([^a-zåäö]|$)/iu.test(
      sourceText,
    );

  if (hasExplicitLunchLabel) {
    return {
      category: "LUNCH",
      method: "SOURCE_LABEL",
    };
  }

  if (!args.plannedStartTime) {
    return {
      category: "UNKNOWN",
      method: "MISSING_START_TIME",
    };
  }

  const startMs = Date.parse(args.plannedStartTime);

  if (!Number.isFinite(startMs)) {
    return {
      category: "UNKNOWN",
      method: "INVALID_START_TIME",
    };
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(startMs));

  const hour = Number(
    parts.find((part) => part.type === "hour")
      ?.value ?? "",
  );

  if (!Number.isFinite(hour)) {
    return {
      category: "UNKNOWN",
      method: "TIME_RULE_V1_FAILED",
    };
  }

  if (hour >= 10 && hour < 16) {
    return {
      category: "LUNCH",
      method: "TIME_RULE_V1",
    };
  }

  if (hour >= 16 && hour < 18) {
    return {
      category: "DAY",
      method: "TIME_RULE_V1",
    };
  }

  if (hour >= 18) {
    return {
      category: "EVENING",
      method: "TIME_RULE_V1",
    };
  }

  return {
    category: "NIGHT",
    method: "TIME_RULE_V1",
  };
}
