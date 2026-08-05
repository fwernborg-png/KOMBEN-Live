import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createSupabaseResearchPairFinalOddsAdapter,
} from "./researchPairFinalOddsSupabase";

function createQuery(
  result: {
    data: unknown[];
    error: null;
  },
) {
  const query:
    Record<string, unknown> = {};

  for (const name of [
    "select",
    "eq",
    "order",
    "limit",
    "in",
  ]) {
    query[name] = vi.fn(
      () => query,
    );
  }

  query.then = (
    resolve: (
      value: typeof result,
    ) => unknown,
  ) => Promise.resolve(
    result,
  ).then(resolve);

  return query;
}

describe(
  "createSupabaseResearchPairFinalOddsAdapter",
  () => {
    it(
      "väljer båda marknaderna för ett nytt lopp",
      async () => {
        const raceQuery =
          createQuery({
            data: [
              {
                race_key: "RACE-1",
                race_date:
                  "2026-07-21",

                track_id: 15,
                race_number: 1,
              },
            ],

            error: null,
          });

        const stateQuery =
          createQuery({
            data: [],
            error: null,
          });

        const from = vi.fn(
          (table: string) => {
            if (
              table ===
              "research_races"
            ) {
              return raceQuery;
            }

            if (
              table ===
              "research_pair_market_fetches"
            ) {
              return stateQuery;
            }

            throw new Error(
              `Oväntad tabell: ${table}`,
            );
          },
        );

        const adapter =
          createSupabaseResearchPairFinalOddsAdapter({
            supabase: {
              from,
            } as never,

            async fetchGame() {
              return {
                httpStatus: 200,
                payload: {},
              };
            },
          });

        const items =
          await adapter.loadPendingItems({
            maxRaces: 1,
          });

        expect(
          items.map(
            (item) => item.market,
          ),
        ).toEqual([
          "TVILLING",
          "KOMB",
        ]);
      },
    );

    it(
      "hoppar över komplett marknad men tar kvarvarande marknad",
      async () => {
        const raceQuery =
          createQuery({
            data: [
              {
                race_key: "RACE-1",
                race_date:
                  "2026-07-21",

                track_id: 15,
                race_number: 1,
              },
            ],

            error: null,
          });

        const stateQuery =
          createQuery({
            data: [
              {
                race_key: "RACE-1",

                market:
                  "TVILLING",

                fetch_status:
                  "COMPLETE",

                attempt_count: 1,
              },
            ],

            error: null,
          });

        const from = vi.fn(
          (table: string) =>
            table === "research_races"
              ? raceQuery
              : stateQuery,
        );

        const adapter =
          createSupabaseResearchPairFinalOddsAdapter({
            supabase: {
              from,
            } as never,

            async fetchGame() {
              return {
                httpStatus: 200,
                payload: {},
              };
            },
          });

        const items =
          await adapter.loadPendingItems({
            maxRaces: 1,
          });

        expect(items).toEqual([
          {
            race: {
              raceKey: "RACE-1",

              raceDate:
                "2026-07-21",

              trackId: 15,
              raceNumber: 1,
            },

            market: "KOMB",
            attemptCount: 0,
          },
        ]);
      },
    );

    it(
      "försöker inte fler gånger än gränsen",
      async () => {
        const raceQuery =
          createQuery({
            data: [
              {
                race_key: "RACE-1",
                race_date:
                  "2026-07-21",

                track_id: 15,
                race_number: 1,
              },
            ],

            error: null,
          });

        const stateQuery =
          createQuery({
            data: [
              {
                race_key: "RACE-1",

                market:
                  "TVILLING",

                fetch_status:
                  "RETRY",

                attempt_count: 10,
              },
              {
                race_key: "RACE-1",

                market:
                  "KOMB",

                fetch_status:
                  "MISSING",

                attempt_count: 1,
              },
            ],

            error: null,
          });

        const from = vi.fn(
          (table: string) =>
            table === "research_races"
              ? raceQuery
              : stateQuery,
        );

        const adapter =
          createSupabaseResearchPairFinalOddsAdapter({
            supabase: {
              from,
            } as never,

            async fetchGame() {
              return {
                httpStatus: 200,
                payload: {},
              };
            },
          });

        const items =
          await adapter.loadPendingItems({
            maxRaces: 1,
          });

        expect(items).toEqual([]);
      },
    );
  },
);
