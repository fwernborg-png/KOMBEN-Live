import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  ResearchPairMarket,
} from "./researchPairFinalOdds";

import type {
  ResearchPairFinalOddsDbRow,
} from "./researchPairFinalOddsPersistence";

import type {
  ResearchPairBackfillItem,
  ResearchPairFinalOddsBackfillAdapter,
  ResearchPairMarketFetchDbRow,
} from "./researchPairFinalOddsBackfill";

type ResearchRaceRow = {
  race_key: string;
  race_date: string;

  track_id: number;
  race_number: number;
};

type ExistingFetchRow = {
  race_key: string;
  market: ResearchPairMarket;

  fetch_status:
    | "COMPLETE"
    | "MISSING"
    | "RETRY"
    | "FAILED";

  attempt_count: number | null;
};

const MARKETS:
  ResearchPairMarket[] = [
    "TVILLING",
    "KOMB",
  ];

function stateKey(
  raceKey: string,
  market: ResearchPairMarket,
): string {
  return `${raceKey}:${market}`;
}

export function
createSupabaseResearchPairFinalOddsAdapter(
  args: {
    supabase: SupabaseClient;

    fetchGame: (
      gameId: string,
    ) => Promise<{
      httpStatus: number;
      payload: unknown;
    }>;

    maximumAttempts?: number;
  },
): ResearchPairFinalOddsBackfillAdapter {
  const maximumAttempts =
    args.maximumAttempts ?? 10;

  return {
    async loadPendingItems({
      maxRaces,
    }) {
      const {
        data: raceData,
        error: raceError,
      } = await args.supabase
        .from("research_races")
        .select(
          [
            "race_key",
            "race_date",
            "track_id",
            "race_number",
          ].join(","),
        )
        .eq(
          "archive_status",
          "COMPLETE",
        )
        .eq(
          "country_code",
          "SE",
        )
        .order(
          "race_date",
          {
            ascending: true,
          },
        )
        .order(
          "track_id",
          {
            ascending: true,
          },
        )
        .order(
          "race_number",
          {
            ascending: true,
          },
        )
        .limit(5_000);

      if (raceError) {
        throw new Error(
          `Kunde inte läsa forskningslopp för parodds: ${raceError.message}`,
        );
      }

      const races =
        (raceData ?? []) as
          ResearchRaceRow[];

      if (races.length === 0) {
        return [];
      }

      const raceKeys =
        races.map(
          (race) => race.race_key,
        );

      const {
        data: fetchData,
        error: fetchError,
      } = await args.supabase
        .from(
          "research_pair_market_fetches",
        )
        .select(
          [
            "race_key",
            "market",
            "fetch_status",
            "attempt_count",
          ].join(","),
        )
        .in(
          "race_key",
          raceKeys,
        );

      if (fetchError) {
        throw new Error(
          `Kunde inte läsa hämtstatus för parodds: ${fetchError.message}`,
        );
      }

      const existing =
        (fetchData ?? []) as
          ExistingFetchRow[];

      const stateByKey =
        new Map(
          existing.map((state) => [
            stateKey(
              state.race_key,
              state.market,
            ),
            state,
          ]),
        );

      const selected:
        ResearchPairBackfillItem[] = [];

      let selectedRaceCount = 0;

      for (const race of races) {
        const pendingForRace:
          ResearchPairBackfillItem[] = [];

        for (const market of MARKETS) {
          const state =
            stateByKey.get(
              stateKey(
                race.race_key,
                market,
              ),
            );

          if (
            state?.fetch_status ===
              "COMPLETE" ||
            state?.fetch_status ===
              "MISSING"
          ) {
            continue;
          }

          const attemptCount =
            state?.attempt_count ?? 0;

          if (
            attemptCount >=
            maximumAttempts
          ) {
            continue;
          }

          pendingForRace.push({
            race: {
              raceKey:
                race.race_key,

              raceDate:
                race.race_date,

              trackId:
                race.track_id,

              raceNumber:
                race.race_number,
            },

            market,
            attemptCount,
          });
        }

        if (
          pendingForRace.length === 0
        ) {
          continue;
        }

        selected.push(
          ...pendingForRace,
        );

        selectedRaceCount += 1;

        if (
          selectedRaceCount >=
          maxRaces
        ) {
          break;
        }
      }

      return selected;
    },

    fetchGame:
      args.fetchGame,

    async persistOdds(rows) {
      if (rows.length === 0) {
        return;
      }

      const {
        error,
      } = await args.supabase
        .from(
          "research_pair_final_odds",
        )
        .upsert(
          rows,
          {
            onConflict:
              [
                "race_key",
                "market",
                "first_runner_number",
                "second_runner_number",
              ].join(","),
          },
        );

      if (error) {
        throw new Error(
          `Kunde inte skriva slutliga parodds: ${error.message}`,
        );
      }
    },

    async persistFetchState(row) {
      const {
        error,
      } = await args.supabase
        .from(
          "research_pair_market_fetches",
        )
        .upsert(
          row,
          {
            onConflict:
              "race_key,market",
          },
        );

      if (error) {
        throw new Error(
          `Kunde inte skriva hämtstatus för parodds: ${error.message}`,
        );
      }
    },
  };
}

export type {
  ResearchPairFinalOddsDbRow,
  ResearchPairMarketFetchDbRow,
};
