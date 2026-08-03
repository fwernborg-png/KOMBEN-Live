import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  backfillMissingResearchResults,
} from "./researchResultBackfill";

describe(
  "researchResultBackfill",
  () => {
    it(
      "hämtar äldre lopp utan resultat och färdigställer dem grupperade per datum",
      async () => {
        const pendingRows = [
          {
            race_key:
              "ATG:2026-07-30:1:4:race-4",

            source_race_id:
              "race-4",

            race_date:
              "2026-07-30",

            track_id: 1,
            track_name: "Testbanan",
            race_number: 4,

            planned_start_time:
              "2026-07-30T18:00:00.000Z",

            archive_status:
              "COLLECTING",

            archived_result_count: 0,
          },
          {
            race_key:
              "ATG:2026-07-30:1:5:race-5",

            source_race_id:
              "race-5",

            race_date:
              "2026-07-30",

            track_id: 1,
            track_name: "Testbanan",
            race_number: 5,

            planned_start_time:
              "2026-07-30T18:30:00.000Z",

            archive_status:
              "INCOMPLETE",

            archived_result_count: null,
          },
          {
            race_key:
              "ATG:2026-07-31:2:1:race-1",

            source_race_id:
              "race-1",

            race_date:
              "2026-07-31",

            track_id: 2,
            track_name: "Andra banan",
            race_number: 1,

            planned_start_time:
              "2026-07-31T12:00:00.000Z",

            archive_status:
              "COLLECTING",

            archived_result_count: 0,
          },
        ];

        const query = {
          select() {
            return this;
          },

          neq() {
            return this;
          },

          or() {
            return this;
          },

          lt() {
            return this;
          },

          order() {
            return this;
          },

          async limit() {
            return {
              data:
                pendingRows,

              error: null,
            };
          },
        };

        const fakeSupabase = {
          from(table: string) {
            expect(table).toBe(
              "research_races",
            );

            return query;
          },
        } as unknown as SupabaseClient;

        const loadRace =
          vi.fn(
            async (row: {
              race_date: string;
              track_id: number;
              track_name: string;
              race_number: number;
              source_race_id: string;
            }) => ({
              track: {
                id:
                  row.track_id,

                name:
                  row.track_name,
              },

              race: {
                id:
                  row.source_race_id,

                raceNumber:
                  row.race_number,
              },
            }),
          );

        const completeDate =
          vi.fn(
            async () => ({
              racesCompleted: 1,
              failedRaces: 0,
              errors: [],
            }),
          );

        const summary =
          await backfillMissingResearchResults({
            enabled: true,

            supabase:
              fakeSupabase,

            currentRaceDate:
              "2026-08-01",

            nowIso:
              "2026-08-01T10:00:00.000Z",

            maxRaces: 3,

            loadRace,

            completeDate,
          });

        expect(loadRace).toHaveBeenCalledTimes(
          3,
        );

        expect(
          completeDate,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          completeDate,
        ).toHaveBeenNthCalledWith(
          1,
          {
            raceDate:
              "2026-07-30",

            races:
              expect.arrayContaining([
                expect.objectContaining({
                  race:
                    expect.objectContaining({
                      id: "race-4",
                    }),
                }),
                expect.objectContaining({
                  race:
                    expect.objectContaining({
                      id: "race-5",
                    }),
                }),
              ]),
          },
        );

        expect(
          completeDate,
        ).toHaveBeenNthCalledWith(
          2,
          {
            raceDate:
              "2026-07-31",

            races: [
              expect.objectContaining({
                race:
                  expect.objectContaining({
                    id: "race-1",
                  }),
              }),
            ],
          },
        );

        expect(summary).toEqual({
          enabled: true,
          racesSelected: 3,
          racesFetched: 3,
          datesCompleted: 2,
          racesCompleted: 2,
          failedRaces: 0,
          errors: [],
        });
      },
    );
  },
);
