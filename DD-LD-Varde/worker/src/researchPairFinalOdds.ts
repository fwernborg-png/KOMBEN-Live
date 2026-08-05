export type ResearchPairMarket =
  | "TVILLING"
  | "KOMB";

export type ResearchPairFinalOddsRow = {
  market: ResearchPairMarket;

  firstRunnerNumber: number;
  secondRunnerNumber: number;

  finalOddsDecimal: number;

  isWinningPair: boolean;
  officialPayoutDecimal: number | null;

  sourceGameId: string | null;
  sourceStatus: string | null;
  sourceTimestamp: string | null;
};

type UnknownRecord =
  Record<string, unknown>;

type WinningPair = {
  firstRunnerNumber: number;
  secondRunnerNumber: number;
  officialPayoutDecimal: number | null;
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

function asArray(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function asString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim() !== ""
    ? value
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
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function rawOddsToDecimal(
  value: unknown,
): number | null {
  const raw = asNumber(value);

  if (
    raw === null ||
    raw <= 0 ||
    Math.round(raw) === 9_999
  ) {
    return null;
  }

  return raw / 100;
}

function getPoolKey(
  market: ResearchPairMarket,
): "tvilling" | "komb" {
  return market === "TVILLING"
    ? "tvilling"
    : "komb";
}

function normalizeTvillingPair(
  first: number,
  second: number,
): [number, number] {
  return first < second
    ? [first, second]
    : [second, first];
}

function buildPairKey(
  market: ResearchPairMarket,
  first: number,
  second: number,
): string {
  if (market === "TVILLING") {
    const normalized =
      normalizeTvillingPair(
        first,
        second,
      );

    return `${normalized[0]}:${normalized[1]}`;
  }

  return `${first}:${second}`;
}

function parseWinningPairs(
  payload: unknown,
  market: ResearchPairMarket,
): WinningPair[] {
  const root = asRecord(payload);
  const races = asArray(root?.races);
  const firstRace = asRecord(races[0]);

  const racePools =
    asRecord(firstRace?.pools);

  const poolKey = getPoolKey(market);
  const pool = asRecord(
    racePools?.[poolKey],
  );

  const result = asRecord(pool?.result);
  const winners = asArray(
    result?.winners,
  );

  const parsed: WinningPair[] = [];

  for (const winnerValue of winners) {
    const winner = asRecord(winnerValue);
    const combination = asArray(
      winner?.combination,
    );

    const first = asNumber(
      combination[0],
    );

    const second = asNumber(
      combination[1],
    );

    if (
      first === null ||
      second === null ||
      first <= 0 ||
      second <= 0 ||
      first === second
    ) {
      continue;
    }

    const normalized =
      market === "TVILLING"
        ? normalizeTvillingPair(
            first,
            second,
          )
        : [first, second] as const;

    parsed.push({
      firstRunnerNumber:
        normalized[0],

      secondRunnerNumber:
        normalized[1],

      officialPayoutDecimal:
        rawOddsToDecimal(
          winner?.odds,
        ),
    });
  }

  return parsed;
}

function parseTvillingRows(
  comboOdds: unknown[],
): Array<{
  firstRunnerNumber: number;
  secondRunnerNumber: number;
  finalOddsDecimal: number;
}> {
  const rows: Array<{
    firstRunnerNumber: number;
    secondRunnerNumber: number;
    finalOddsDecimal: number;
  }> = [];

  for (
    let rowIndex = 0;
    rowIndex < comboOdds.length;
    rowIndex += 1
  ) {
    const matrixRow =
      asArray(comboOdds[rowIndex]);

    const highRunnerNumber =
      rowIndex + 1;

    for (
      let columnIndex = 0;
      columnIndex < matrixRow.length;
      columnIndex += 1
    ) {
      const lowRunnerNumber =
        columnIndex + 1;

      if (
        lowRunnerNumber >=
        highRunnerNumber
      ) {
        continue;
      }

      const finalOddsDecimal =
        rawOddsToDecimal(
          matrixRow[columnIndex],
        );

      if (finalOddsDecimal === null) {
        continue;
      }

      rows.push({
        firstRunnerNumber:
          lowRunnerNumber,

        secondRunnerNumber:
          highRunnerNumber,

        finalOddsDecimal,
      });
    }
  }

  return rows;
}

function parseKombRows(
  comboOdds: unknown[],
): Array<{
  firstRunnerNumber: number;
  secondRunnerNumber: number;
  finalOddsDecimal: number;
}> {
  const rows: Array<{
    firstRunnerNumber: number;
    secondRunnerNumber: number;
    finalOddsDecimal: number;
  }> = [];

  for (
    let rowIndex = 0;
    rowIndex < comboOdds.length;
    rowIndex += 1
  ) {
    const matrixRow =
      asArray(comboOdds[rowIndex]);

    const firstRunnerNumber =
      rowIndex + 1;

    for (
      let columnIndex = 0;
      columnIndex < matrixRow.length;
      columnIndex += 1
    ) {
      const secondRunnerNumber =
        columnIndex + 1;

      if (
        firstRunnerNumber ===
        secondRunnerNumber
      ) {
        continue;
      }

      const finalOddsDecimal =
        rawOddsToDecimal(
          matrixRow[columnIndex],
        );

      if (finalOddsDecimal === null) {
        continue;
      }

      rows.push({
        firstRunnerNumber,
        secondRunnerNumber,
        finalOddsDecimal,
      });
    }
  }

  return rows;
}

export function parseResearchPairFinalOdds(
  args: {
    payload: unknown;
    market: ResearchPairMarket;
  },
): ResearchPairFinalOddsRow[] {
  const root = asRecord(args.payload);

  if (!root) {
    return [];
  }

  const poolKey =
    getPoolKey(args.market);

  const pools =
    asRecord(root.pools);

  const pool =
    asRecord(pools?.[poolKey]);

  if (!pool) {
    return [];
  }

  const comboOdds =
    asArray(pool.comboOdds);

  const pairs =
    args.market === "TVILLING"
      ? parseTvillingRows(comboOdds)
      : parseKombRows(comboOdds);

  const winners =
    parseWinningPairs(
      args.payload,
      args.market,
    );

  const winnerByPair =
    new Map(
      winners.map((winner) => [
        buildPairKey(
          args.market,
          winner.firstRunnerNumber,
          winner.secondRunnerNumber,
        ),
        winner,
      ]),
    );

  const sourceGameId =
    asString(root.id);

  const sourceStatus =
    asString(root.status) ??
    asString(pool.status);

  const sourceTimestamp =
    asString(pool.timestamp);

  return pairs.map((pair) => {
    const winner = winnerByPair.get(
      buildPairKey(
        args.market,
        pair.firstRunnerNumber,
        pair.secondRunnerNumber,
      ),
    );

    return {
      market:
        args.market,

      firstRunnerNumber:
        pair.firstRunnerNumber,

      secondRunnerNumber:
        pair.secondRunnerNumber,

      finalOddsDecimal:
        pair.finalOddsDecimal,

      isWinningPair:
        winner !== undefined,

      officialPayoutDecimal:
        winner
          ?.officialPayoutDecimal ??
        null,

      sourceGameId,
      sourceStatus,
      sourceTimestamp,
    };
  });
}
