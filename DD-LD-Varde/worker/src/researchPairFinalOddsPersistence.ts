import type {
  ResearchPairFinalOddsRow,
  ResearchPairMarket,
} from "./researchPairFinalOdds";

export const
  RESEARCH_PAIR_FINAL_ODDS_COLLECTOR_VERSION =
    "RESEARCH_PAIR_FINAL_ODDS_V1.0";

export type ResearchPairFinalOddsDbRow = {
  pair_odds_key: string;

  race_key: string;
  market: ResearchPairMarket;

  first_runner_number: number;
  second_runner_number: number;

  final_odds_decimal: number;

  is_winning_pair: boolean;
  official_payout_decimal: number | null;

  source_game_id: string | null;
  source_status: string | null;
  source_timestamp: string | null;

  source_provider: "ATG";

  fetched_at: string;
  collector_version: string;

  updated_at: string;
};

export function buildResearchPairFinalOddsKey(
  args: {
    raceKey: string;
    market: ResearchPairMarket;
    firstRunnerNumber: number;
    secondRunnerNumber: number;
  },
): string {
  return [
    args.raceKey,
    "PAIR_FINAL_ODDS",
    args.market,
    args.firstRunnerNumber,
    args.secondRunnerNumber,
  ].join(":");
}

export function buildResearchPairFinalOddsDbRows(
  args: {
    raceKey: string;

    rows:
      ResearchPairFinalOddsRow[];

    fetchedAt: string;

    collectorVersion?: string;
  },
): ResearchPairFinalOddsDbRow[] {
  const collectorVersion =
    args.collectorVersion ??
    RESEARCH_PAIR_FINAL_ODDS_COLLECTOR_VERSION;

  return args.rows.map((row) => ({
    pair_odds_key:
      buildResearchPairFinalOddsKey({
        raceKey:
          args.raceKey,

        market:
          row.market,

        firstRunnerNumber:
          row.firstRunnerNumber,

        secondRunnerNumber:
          row.secondRunnerNumber,
      }),

    race_key:
      args.raceKey,

    market:
      row.market,

    first_runner_number:
      row.firstRunnerNumber,

    second_runner_number:
      row.secondRunnerNumber,

    final_odds_decimal:
      row.finalOddsDecimal,

    is_winning_pair:
      row.isWinningPair,

    official_payout_decimal:
      row.officialPayoutDecimal,

    source_game_id:
      row.sourceGameId,

    source_status:
      row.sourceStatus,

    source_timestamp:
      row.sourceTimestamp,

    source_provider:
      "ATG",

    fetched_at:
      args.fetchedAt,

    collector_version:
      collectorVersion,

    updated_at:
      args.fetchedAt,
  }));
}
