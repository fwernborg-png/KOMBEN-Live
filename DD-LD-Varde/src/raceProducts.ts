export const RACE_PRODUCT_CODES = [
  "V86",
  "V85",
  "V75",
  "GS75",
  "V65",
  "V64",
  "V5",
  "V4",
  "V3",
  "DD",
  "LD",
  "TOP7",
] as const;

export type RaceProductCode =
  (typeof RACE_PRODUCT_CODES)[number];

export type RaceProduct = {
  productCode: RaceProductCode;
  legNumber: number | null;
  totalLegs: number | null;
};

export type RaceMeetingTimeCategory =
  | "LUNCH"
  | "DAY"
  | "EVENING"
  | "NIGHT"
  | "UNKNOWN";

type UnknownRecord = Record<string, unknown>;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asPositiveInteger(
  value: unknown,
): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0 ||
    parsed > 99
  ) {
    return null;
  }

  return parsed;
}

function collectStrings(
  value: unknown,
  depth = 0,
): string[] {
  if (depth > 7) {
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

  return Object.values(record).flatMap(
    (item) => collectStrings(item, depth + 1),
  );
}

function findProductCode(
  text: string,
): RaceProductCode | null {
  const upper = text.toUpperCase();

  for (const code of RACE_PRODUCT_CODES) {
    const escaped = code.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    if (
      new RegExp(
        `(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`,
      ).test(upper)
    ) {
      return code;
    }
  }

  return null;
}

function parseLegFromText(
  text: string,
  code: RaceProductCode,
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

  return {
    legNumber:
      asPositiveInteger(match[1]),
    totalLegs:
      asPositiveInteger(match[2]),
  };
}

function firstIntegerFromKeys(
  record: UnknownRecord,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const parsed =
      asPositiveInteger(record[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

const LEG_KEYS = [
  "legNumber",
  "leg",
  "productLeg",
  "division",
  "divisionNumber",
  "avd",
  "avdelning",
  "sequenceNumber",
  "raceNumberInProduct",
] as const;

const TOTAL_LEG_KEYS = [
  "totalLegs",
  "numberOfLegs",
  "legCount",
  "totalDivisions",
  "numberOfDivisions",
] as const;

const PRODUCT_TEXT_KEYS = [
  "productCode",
  "code",
  "gameType",
  "betType",
  "product",
  "name",
  "label",
  "title",
] as const;

function collectStructuredProducts(
  value: unknown,
  depth = 0,
): RaceProduct[] {
  if (depth > 7) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectStructuredProducts(
        item,
        depth + 1,
      ),
    );
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  const ownText = PRODUCT_TEXT_KEYS
    .map((key) => record[key])
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .join(" ");

  const code = findProductCode(ownText);

  const ownProducts: RaceProduct[] = [];

  if (code) {
    const fromText =
      parseLegFromText(ownText, code);

    ownProducts.push({
      productCode: code,
      legNumber:
        firstIntegerFromKeys(
          record,
          LEG_KEYS,
        ) ?? fromText.legNumber,
      totalLegs:
        firstIntegerFromKeys(
          record,
          TOTAL_LEG_KEYS,
        ) ?? fromText.totalLegs,
    });
  }

  return [
    ...ownProducts,
    ...Object.values(record).flatMap(
      (item) =>
        collectStructuredProducts(
          item,
          depth + 1,
        ),
    ),
  ];
}

export function parseRaceProducts(
  value: unknown,
): RaceProduct[] {
  const candidates =
    collectStructuredProducts(value);

  const combined =
    collectStrings(value).join(" ");

  for (const code of RACE_PRODUCT_CODES) {
    const escaped = code.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    if (
      !new RegExp(
        `(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`,
        "i",
      ).test(combined)
    ) {
      continue;
    }

    const leg =
      parseLegFromText(combined, code);

    candidates.push({
      productCode: code,
      legNumber: leg.legNumber,
      totalLegs: leg.totalLegs,
    });
  }

  const bestByCode =
    new Map<RaceProductCode, RaceProduct>();

  for (const candidate of candidates) {
    const existing =
      bestByCode.get(
        candidate.productCode,
      );

    if (
      !existing ||
      (
        existing.legNumber === null &&
        candidate.legNumber !== null
      ) ||
      (
        existing.totalLegs === null &&
        candidate.totalLegs !== null
      )
    ) {
      bestByCode.set(
        candidate.productCode,
        {
          productCode:
            candidate.productCode,
          legNumber:
            candidate.legNumber ??
            existing?.legNumber ??
            null,
          totalLegs:
            candidate.totalLegs ??
            existing?.totalLegs ??
            null,
        },
      );
    }
  }

  return RACE_PRODUCT_CODES
    .map((code) => bestByCode.get(code))
    .filter(
      (
        product,
      ): product is RaceProduct =>
        Boolean(product),
    );
}

export function mergeRaceProducts(
  ...groups: RaceProduct[][]
): RaceProduct[] {
  const bestByCode =
    new Map<RaceProductCode, RaceProduct>();

  for (const group of groups) {
    for (const product of group) {
      const existing =
        bestByCode.get(product.productCode);

      if (!existing) {
        bestByCode.set(
          product.productCode,
          { ...product },
        );
        continue;
      }

      bestByCode.set(
        product.productCode,
        {
          productCode:
            product.productCode,
          legNumber:
            product.legNumber ??
            existing.legNumber,
          totalLegs:
            product.totalLegs ??
            existing.totalLegs,
        },
      );
    }
  }

  return RACE_PRODUCT_CODES
    .map(
      (code) =>
        bestByCode.get(code),
    )
    .filter(
      (
        product,
      ): product is RaceProduct =>
        Boolean(product),
    );
}

export function parseCalendarGameProducts(
  value: unknown,
): Record<string, RaceProduct[]> {
  const games = asRecord(value);

  if (!games) {
    return {};
  }

  const byRace:
    Record<string, RaceProduct[]> = {};

  for (
    const [
      rawProductCode,
      rawEntries,
    ] of Object.entries(games)
  ) {
    const productCode =
      RACE_PRODUCT_CODES.find(
        (code) =>
          code.toLowerCase() ===
          rawProductCode.toLowerCase(),
      );

    if (!productCode) {
      continue;
    }

    const entries =
      Array.isArray(rawEntries)
        ? rawEntries
        : [rawEntries];

    for (const rawEntry of entries) {
      const entry =
        asRecord(rawEntry);

      if (!entry) {
        continue;
      }

      const raceIds =
        Array.isArray(entry.races)
          ? entry.races.filter(
              (
                raceId,
              ): raceId is string =>
                typeof raceId ===
                  "string" &&
                raceId.trim() !== "",
            )
          : [];

      const totalLegs =
        raceIds.length || null;

      raceIds.forEach(
        (raceId, index) => {
          const product:
            RaceProduct = {
              productCode,
              legNumber: index + 1,
              totalLegs,
            };

          byRace[raceId] =
            mergeRaceProducts(
              byRace[raceId] ?? [],
              [product],
            );
        },
      );
    }
  }

  return byRace;
}

export function inferRaceMeetingTimeCategory(
  args: {
    startTime?: string;
    rawContext: unknown;
  },
): RaceMeetingTimeCategory {
  const sourceText =
    collectStrings(args.rawContext)
      .join(" ")
      .toLowerCase();

  if (
    /(^|[^a-zåäö])lunch[a-zåäö]*([^a-zåäö]|$)/iu.test(
      sourceText,
    )
  ) {
    return "LUNCH";
  }

  if (!args.startTime) {
    return "UNKNOWN";
  }

  const startMs =
    Date.parse(args.startTime);

  if (!Number.isFinite(startMs)) {
    return "UNKNOWN";
  }

  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Europe/Stockholm",
        hour: "2-digit",
        hourCycle: "h23",
      },
    ).formatToParts(
      new Date(startMs),
    );

  const hour =
    Number(
      parts.find(
        (part) =>
          part.type === "hour",
      )?.value ?? "",
    );

  if (!Number.isFinite(hour)) {
    return "UNKNOWN";
  }

  if (hour >= 10 && hour < 16) {
    return "LUNCH";
  }

  if (hour >= 16 && hour < 18) {
    return "DAY";
  }

  if (hour >= 18) {
    return "EVENING";
  }

  return "NIGHT";
}

export function formatPrimaryRaceProductLabel(
  products: RaceProduct[],
  meetingTimeCategory:
    RaceMeetingTimeCategory,
): string | null {
  const product = products[0];

  if (!product) {
    return null;
  }

  const base =
    product.legNumber === null
      ? product.productCode
      : `${product.productCode}-${product.legNumber}`;

  if (
    product.productCode === "V4" &&
    meetingTimeCategory === "LUNCH"
  ) {
    return `LUNCH ${base}`;
  }

  return base;
}
