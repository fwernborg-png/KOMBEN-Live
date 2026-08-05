import {
  parseResearchPairFinalOdds,
  type ResearchPairMarket,
} from "./researchPairFinalOdds";

import {
  buildResearchPairFinalOddsDbRows,
  RESEARCH_PAIR_FINAL_ODDS_COLLECTOR_VERSION,
  type ResearchPairFinalOddsDbRow,
} from "./researchPairFinalOddsPersistence";

export type ResearchPairBackfillRace = {
  raceKey: string;
  raceDate: string;
  trackId: number;
  raceNumber: number;
};

export type ResearchPairBackfillItem = {
  race: ResearchPairBackfillRace;
  market: ResearchPairMarket;
  attemptCount: number;
};

export type ResearchPairMarketFetchStatus =
  | "COMPLETE"
  | "MISSING"
  | "RETRY"
  | "FAILED";

export type ResearchPairMarketFetchDbRow = {
  fetch_key: string;

  race_key: string;
  market: ResearchPairMarket;

  fetch_status:
    ResearchPairMarketFetchStatus;

  source_game_id: string;
  source_status: string | null;

  http_status: number | null;
  rows_archived: number;

  attempt_count: number;

  last_error: string | null;

  last_attempt_at: string;
  completed_at: string | null;

  updated_at: string;
};

export type ResearchPairFinalOddsBackfillAdapter = {
  loadPendingItems(args: {
    maxRaces: number;
  }): Promise<
    ResearchPairBackfillItem[]
  >;

  fetchGame(args: {
    gameId: string;
  }): Promise<{
    httpStatus: number;
    payload: unknown;
  }>;

  persistOdds(
    rows: ResearchPairFinalOddsDbRow[],
  ): Promise<void>;

  persistFetchState(
    row: ResearchPairMarketFetchDbRow,
  ): Promise<void>;
};

export type ResearchPairFinalOddsBackfillSummary = {
  enabled: boolean;

  itemsSelected: number;
  fetchesAttempted: number;

  marketsCompleted: number;
  marketsMissing: number;
  marketsRetrying: number;
  marketsFailed: number;

  oddsRowsArchived: number;

  errors: string[];
};

function emptySummary(
  enabled: boolean,
): ResearchPairFinalOddsBackfillSummary {
  return {
    enabled,

    itemsSelected: 0,
    fetchesAttempted: 0,

    marketsCompleted: 0,
    marketsMissing: 0,
    marketsRetrying: 0,
    marketsFailed: 0,

    oddsRowsArchived: 0,

    errors: [],
  };
}

function appendError(
  summary:
    ResearchPairFinalOddsBackfillSummary,
  message: string,
) {
  if (summary.errors.length < 10) {
    summary.errors.push(message);
  }
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function asString(
  value: unknown,
): string | null {
  return (
    typeof value === "string" &&
    value.trim() !== ""
  )
    ? value
    : null;
}

function poolKey(
  market: ResearchPairMarket,
): "tvilling" | "komb" {
  return market === "TVILLING"
    ? "tvilling"
    : "komb";
}

function productKey(
  market: ResearchPairMarket,
): "tvilling" | "komb" {
  return poolKey(market);
}

function readSourceStatus(
  payload: unknown,
  market: ResearchPairMarket,
): string | null {
  const root = asRecord(payload);

  const pools = asRecord(
    root?.pools,
  );

  const pool = asRecord(
    pools?.[poolKey(market)],
  );

  return (
    asString(root?.status) ??
    asString(pool?.status)
  );
}

export function buildResearchPairGameId(
  args: {
    raceDate: string;
    trackId: number;
    raceNumber: number;
    market: ResearchPairMarket;
  },
): string {
  return [
    productKey(args.market),
    args.raceDate,
    args.trackId,
    args.raceNumber,
  ].join("_");
}

export function buildResearchPairFetchKey(
  args: {
    raceKey: string;
    market: ResearchPairMarket;
  },
): string {
  return [
    args.raceKey,
    "PAIR_MARKET_FETCH",
    args.market,
  ].join(":");
}

function buildFetchState(
  args: {
    item:
      ResearchPairBackfillItem;

    gameId: string;

    status:
      ResearchPairMarketFetchStatus;

    sourceStatus: string | null;
    httpStatus: number | null;

    rowsArchived: number;

    error: string | null;

    nowIso: string;
  },
): ResearchPairMarketFetchDbRow {
  return {
    fetch_key:
      buildResearchPairFetchKey({
        raceKey:
          args.item.race.raceKey,

        market:
          args.item.market,
      }),

    race_key:
      args.item.race.raceKey,

    market:
      args.item.market,

    fetch_status:
      args.status,

    source_game_id:
      args.gameId,

    source_status:
      args.sourceStatus,

    http_status:
      args.httpStatus,

    rows_archived:
      args.rowsArchived,

    attempt_count:
      args.item.attemptCount + 1,

    last_error:
      args.error,

    last_attempt_at:
      args.nowIso,

    completed_at:
      args.status === "COMPLETE" ||
      args.status === "MISSING"
        ? args.nowIso
        : null,

    updated_at:
      args.nowIso,
  };
}

export async function
runResearchPairFinalOddsBackfill(
  args: {
    enabled: boolean;

    adapter:
      ResearchPairFinalOddsBackfillAdapter;

    nowIso: string;

    maxRaces?: number;
  },
): Promise<
  ResearchPairFinalOddsBackfillSummary
> {
  const summary =
    emptySummary(args.enabled);

  if (!args.enabled) {
    return summary;
  }

  const maxRaces =
    args.maxRaces ?? 2;

  let items:
    ResearchPairBackfillItem[];

  try {
    items =
      await args.adapter.loadPendingItems({
        maxRaces,
      });
  } catch (error) {
    summary.marketsFailed += 1;

    appendError(
      summary,
      error instanceof Error
        ? error.message
        : String(error),
    );

    return summary;
  }

  summary.itemsSelected =
    items.length;

  for (const item of items) {
    const gameId =
      buildResearchPairGameId({
        raceDate:
          item.race.raceDate,

        trackId:
          item.race.trackId,

        raceNumber:
          item.race.raceNumber,

        market:
          item.market,
      });

    summary.fetchesAttempted += 1;

    try {
      const response =
        await args.adapter.fetchGame({
          gameId,
        });

      const sourceStatus =
        readSourceStatus(
          response.payload,
          item.market,
        );

      if (response.httpStatus === 404) {
        await args.adapter
          .persistFetchState(
            buildFetchState({
              item,
              gameId,

              status: "MISSING",

              sourceStatus,
              httpStatus:
                response.httpStatus,

              rowsArchived: 0,

              error: null,

              nowIso:
                args.nowIso,
            }),
          );

        summary.marketsMissing += 1;
        continue;
      }

      if (
        response.httpStatus < 200 ||
        response.httpStatus >= 300
      ) {
        const message =
          `ATG svarade med HTTP ${response.httpStatus}`;

        await args.adapter
          .persistFetchState(
            buildFetchState({
              item,
              gameId,

              status: "RETRY",

              sourceStatus,
              httpStatus:
                response.httpStatus,

              rowsArchived: 0,

              error: message,

              nowIso:
                args.nowIso,
            }),
          );

        summary.marketsRetrying += 1;

        appendError(
          summary,
          `${gameId}: ${message}`,
        );

        continue;
      }

      const parsed =
        parseResearchPairFinalOdds({
          payload:
            response.payload,

          market:
            item.market,
        });

      const dbRows =
        buildResearchPairFinalOddsDbRows({
          raceKey:
            item.race.raceKey,

          rows:
            parsed,

          fetchedAt:
            args.nowIso,

          collectorVersion:
            RESEARCH_PAIR_FINAL_ODDS_COLLECTOR_VERSION,
        });

      if (dbRows.length > 0) {
        await args.adapter.persistOdds(
          dbRows,
        );

        summary.oddsRowsArchived +=
          dbRows.length;
      }

      const hasOfficialWinner =
        parsed.some(
          (row) =>
            row.isWinningPair &&
            row.officialPayoutDecimal !==
              null,
        );

      if (
        dbRows.length > 0 &&
        hasOfficialWinner
      ) {
        await args.adapter
          .persistFetchState(
            buildFetchState({
              item,
              gameId,

              status: "COMPLETE",

              sourceStatus,
              httpStatus:
                response.httpStatus,

              rowsArchived:
                dbRows.length,

              error: null,

              nowIso:
                args.nowIso,
            }),
          );

        summary.marketsCompleted += 1;
        continue;
      }

      if (
        dbRows.length === 0 &&
        sourceStatus?.toLowerCase() ===
          "results"
      ) {
        await args.adapter
          .persistFetchState(
            buildFetchState({
              item,
              gameId,

              status: "MISSING",

              sourceStatus,
              httpStatus:
                response.httpStatus,

              rowsArchived: 0,

              error: null,

              nowIso:
                args.nowIso,
            }),
          );

        summary.marketsMissing += 1;
        continue;
      }

      if (dbRows.length === 0) {
        const message =
          "Marknaden är ännu inte färdig eller saknar slutodds";

        await args.adapter
          .persistFetchState(
            buildFetchState({
              item,
              gameId,

              status: "RETRY",

              sourceStatus,
              httpStatus:
                response.httpStatus,

              rowsArchived: 0,

              error: message,

              nowIso:
                args.nowIso,
            }),
          );

        summary.marketsRetrying += 1;

        appendError(
          summary,
          `${gameId}: ${message}`,
        );

        continue;
      }

      const message =
        "Oddsmatrisen fanns men officiell vinnande utdelning saknades";

      await args.adapter
        .persistFetchState(
          buildFetchState({
            item,
            gameId,

            status: "RETRY",

            sourceStatus,
            httpStatus:
              response.httpStatus,

            rowsArchived:
              dbRows.length,

            error: message,

            nowIso:
              args.nowIso,
          }),
        );

      summary.marketsRetrying += 1;

      appendError(
        summary,
        `${gameId}: ${message}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      try {
        await args.adapter
          .persistFetchState(
            buildFetchState({
              item,
              gameId,

              status: "RETRY",

              sourceStatus: null,
              httpStatus: null,

              rowsArchived: 0,

              error: message,

              nowIso:
                args.nowIso,
            }),
          );
      } catch (stateError) {
        appendError(
          summary,
          `${gameId}: kunde inte spara felstatus: ${
            stateError instanceof Error
              ? stateError.message
              : String(stateError)
          }`,
        );
      }

      summary.marketsFailed += 1;

      appendError(
        summary,
        `${gameId}: ${message}`,
      );
    }
  }

  return summary;
}
