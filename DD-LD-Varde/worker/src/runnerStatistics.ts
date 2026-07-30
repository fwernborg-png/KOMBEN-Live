export type ParsedRunnerStats = {
  earningsPerStart: number | null;
  winPercent: number | null;
  driverWinPercent: number | null;
  startPoints: number | null;
  gallopPercent: number | null;
};

type UnknownRecord =
  Record<string, unknown>;

type PercentCandidate = {
  percent: number;
  year: number | null;
  depth: number;
};

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}

function asNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed =
      Number(
        value
          .trim()
          .replace(",", "."),
      );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function getRecord(
  value: unknown,
  key: string,
): UnknownRecord | null {
  const record =
    asRecord(value);

  return record
    ? asRecord(record[key])
    : null;
}

function readPath(
  value: unknown,
  path: string[],
): unknown {
  let cursor = value;

  for (const key of path) {
    const record =
      asRecord(cursor);

    if (!record) {
      return null;
    }

    cursor = record[key];
  }

  return cursor;
}

/**
 * ATG förekommer med tre procentformat:
 *
 * 0.18  = 18 %
 * 18    = 18 %
 * 1800  = 18,00 %
 */
export function normalizeAtgPercent(
  value: unknown,
): number | null {
  const number =
    asNumber(value);

  if (
    number === null ||
    number < 0
  ) {
    return null;
  }

  if (number <= 1) {
    return number * 100;
  }

  if (number <= 100) {
    return number;
  }

  if (number <= 10_000) {
    return number / 100;
  }

  return null;
}

/**
 * ATG:s ekonomiska statistik levereras i
 * mindre valutaenheter. 630476 motsvarar
 * därför 6 304,76 kronor.
 */
export function normalizeAtgMoneyPerStart(
  value: unknown,
): number | null {
  const number =
    asNumber(value);

  if (
    number === null ||
    number < 0
  ) {
    return null;
  }

  return number / 100;
}

function firstNumeric(
  value: unknown,
  paths: string[][],
  parser: (
    value: unknown,
  ) => number | null = asNumber,
): number | null {
  for (const path of paths) {
    const parsed =
      parser(
        readPath(
          value,
          path,
        ),
      );

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function explicitYear(
  record: UnknownRecord,
  hintedYear: number | null,
): number | null {
  const direct =
    asNumber(record.year) ??
    asNumber(record.season) ??
    asNumber(record.seasonYear);

  if (
    direct !== null &&
    direct >= 1900 &&
    direct <= 2200
  ) {
    return Math.round(direct);
  }

  return hintedYear;
}

function yearFromKey(
  key: string,
): number | null {
  if (!/^\d{4}$/.test(key)) {
    return null;
  }

  const year =
    Number(key);

  return (
    year >= 1900 &&
    year <= 2200
  )
    ? year
    : null;
}

function winsFromPlacement(
  record: UnknownRecord,
): number | null {
  const placement =
    getRecord(record, "placement") ??
    getRecord(record, "placements") ??
    getRecord(record, "placeDistribution");

  if (!placement) {
    return null;
  }

  return (
    asNumber(placement["1"]) ??
    asNumber(placement.first) ??
    asNumber(placement.wins)
  );
}

function percentFromRecord(
  record: UnknownRecord,
): number | null {
  const directFields = [
    "winPercentage",
    "winPercent",
    "winningPercentage",
    "winsPercentage",
    "victoryPercentage",
  ];

  for (const field of directFields) {
    const direct =
      normalizeAtgPercent(
        record[field],
      );

    if (direct !== null) {
      return direct;
    }
  }

  const starts =
    asNumber(record.starts) ??
    asNumber(record.numberOfStarts) ??
    asNumber(record.startCount) ??
    asNumber(record.totalStarts);

  const wins =
    winsFromPlacement(record) ??
    asNumber(record.wins) ??
    asNumber(record.firstPlaces) ??
    asNumber(record.victories);

  if (
    starts !== null &&
    starts > 0 &&
    wins !== null &&
    wins >= 0
  ) {
    return (
      wins /
      starts
    ) * 100;
  }

  return null;
}

function collectPercentCandidates(
  value: unknown,
  candidates: PercentCandidate[],
  depth = 0,
  hintedYear: number | null = null,
) {
  if (depth > 7) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPercentCandidates(
        item,
        candidates,
        depth + 1,
        hintedYear,
      );
    }

    return;
  }

  const record =
    asRecord(value);

  if (!record) {
    return;
  }

  const recordYear =
    explicitYear(
      record,
      hintedYear,
    );

  const percent =
    percentFromRecord(record);

  if (percent !== null) {
    candidates.push({
      percent,
      year: recordYear,
      depth,
    });
  }

  for (
    const [
      key,
      child,
    ] of Object.entries(record)
  ) {
    if (
      typeof child !== "object" ||
      child === null
    ) {
      continue;
    }

    collectPercentCandidates(
      child,
      candidates,
      depth + 1,
      yearFromKey(key) ??
        recordYear,
    );
  }
}

export function findLatestWinPercent(
  value: unknown,
): number | null {
  const candidates:
    PercentCandidate[] = [];

  collectPercentCandidates(
    value,
    candidates,
  );

  candidates.sort(
    (a, b) => {
      const aHasYear =
        a.year !== null;

      const bHasYear =
        b.year !== null;

      if (
        aHasYear !==
        bHasYear
      ) {
        return aHasYear
          ? -1
          : 1;
      }

      if (
        a.year !== null &&
        b.year !== null &&
        a.year !== b.year
      ) {
        return b.year - a.year;
      }

      return a.depth - b.depth;
    },
  );

  return (
    candidates[0]
      ?.percent ??
    null
  );
}

export function latestYearWinPercent(
  yearsValue: unknown,
): number | null {
  return findLatestWinPercent(
    yearsValue,
  );
}

export function extractRunnerStats(
  start: UnknownRecord,
): ParsedRunnerStats {
  const horse =
    getRecord(start, "horse");

  const driver =
    getRecord(start, "driver");

  const horseStatistics =
    getRecord(
      horse,
      "statistics",
    );

  const driverStatistics =
    getRecord(
      driver,
      "statistics",
    );

  const horseLife =
    getRecord(
      horseStatistics,
      "life",
    );

  const earningsPerStart =
    firstNumeric(
      start,
      [
        ["earningsPerStart"],
        ["moneyPerStart"],

        [
          "statistics",
          "earningsPerStart",
        ],
        [
          "statistics",
          "moneyPerStart",
        ],

        [
          "horse",
          "statistics",
          "life",
          "earningsPerStart",
        ],
        [
          "horse",
          "statistics",
          "life",
          "moneyPerStart",
        ],

        [
          "horse",
          "statistics",
          "earningsPerStart",
        ],
        [
          "horse",
          "statistics",
          "moneyPerStart",
        ],

        [
          "horse",
          "life",
          "earningsPerStart",
        ],

        [
          "career",
          "earningsPerStart",
        ],

        [
          "horse",
          "career",
          "earningsPerStart",
        ],
      ],
      normalizeAtgMoneyPerStart,
    );

  const directHorseWinPercent =
    firstNumeric(
      start,
      [
        ["winPercent"],
        ["winPercentage"],

        [
          "statistics",
          "winPercent",
        ],
        [
          "statistics",
          "winPercentage",
        ],

        [
          "horse",
          "statistics",
          "life",
          "winPercent",
        ],
        [
          "horse",
          "statistics",
          "life",
          "winPercentage",
        ],

        [
          "horse",
          "statistics",
          "winPercent",
        ],
        [
          "horse",
          "statistics",
          "winPercentage",
        ],

        [
          "career",
          "winPercent",
        ],
        [
          "career",
          "winPercentage",
        ],
      ],
      normalizeAtgPercent,
    );

  const horseWinPercent =
    directHorseWinPercent ??
    findLatestWinPercent(
      horseStatistics ??
      horseLife ??
      horse,
    );

  const directDriverWinPercent =
    driver
      ? firstNumeric(
          driver,
          [
            ["winPercent"],
            ["winPercentage"],
            ["winningPercentage"],

            [
              "statistics",
              "winPercent",
            ],
            [
              "statistics",
              "winPercentage",
            ],

            [
              "career",
              "winPercent",
            ],
            [
              "career",
              "winPercentage",
            ],
          ],
          normalizeAtgPercent,
        )
      : null;

  /*
   * Viktigt:
   *
   * Vi använder aldrig startens eller hästens
   * segerprocent som reserv för kusken.
   */
  const driverWinPercent =
    directDriverWinPercent ??
    (
      driver
        ? findLatestWinPercent(
            driverStatistics ??
            driver,
          )
        : null
    );

  const startPoints =
    firstNumeric(
      start,
      [
        ["startPoints"],
        ["startPoang"],

        [
          "statistics",
          "startPoints",
        ],
        [
          "statistics",
          "startPoang",
        ],

        [
          "horse",
          "statistics",
          "life",
          "startPoints",
        ],
        [
          "horse",
          "statistics",
          "life",
          "startPoang",
        ],

        [
          "horse",
          "statistics",
          "startPoints",
        ],
        [
          "horse",
          "statistics",
          "startPoang",
        ],
      ],
    ) ??
    firstNumeric(
      horseLife,
      [
        ["startPoints"],
        ["startPoang"],
      ],
    );

  const gallopPercent =
    firstNumeric(
      start,
      [
        ["gallopPercent"],
        ["galoppPercent"],
        ["gallopRate"],

        [
          "statistics",
          "gallopPercent",
        ],
        [
          "statistics",
          "galoppPercent",
        ],

        [
          "horse",
          "statistics",
          "life",
          "gallopPercent",
        ],
        [
          "horse",
          "statistics",
          "life",
          "galoppPercent",
        ],

        [
          "horse",
          "statistics",
          "gallopPercent",
        ],
        [
          "horse",
          "statistics",
          "galoppPercent",
        ],

        [
          "career",
          "gallopPercent",
        ],
      ],
      normalizeAtgPercent,
    );

  return {
    earningsPerStart,

    winPercent:
      horseWinPercent,

    driverWinPercent,

    startPoints,

    gallopPercent,
  };
}
