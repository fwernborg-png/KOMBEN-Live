import {
  describe,
  expect,
  it,
} from "vitest";

import {
  fetchHorseGallopPercentWithRetry,
} from "./gallopRetry";

describe(
  "fetchHorseGallopPercentWithRetry",
  () => {
    it(
      "försöker igen efter tillfälligt fel",
      async () => {
        let calls = 0;

        const fetchImpl:
          typeof fetch =
          async () => {
            calls += 1;

            if (calls === 1) {
              return new Response(
                "Tillfälligt fel",
                {
                  status: 503,
                },
              );
            }

            return new Response(
              JSON.stringify({
                records: [
                  {
                    place: "1",
                    race: {
                      type: "race",
                    },
                  },
                  {
                    place: "g",
                    race: {
                      type: "race",
                    },
                  },
                  {
                    place: "3",
                    race: {
                      type: "race",
                    },
                  },
                ],
              }),
              {
                status: 200,

                headers: {
                  "content-type":
                    "application/json",
                },
              },
            );
          };

        const value =
          await fetchHorseGallopPercentWithRetry({
            horseId: 123,
            apiBaseUrl:
              "https://example.test",

            fetchImpl,

            attempts: 2,
            retryDelayMs: 0,
          });

        expect(calls).toBe(2);

        expect(value).toBeCloseTo(
          100 / 3,
          8,
        );
      },
    );

    it(
      "returnerar null efter max antal försök",
      async () => {
        let calls = 0;

        const fetchImpl:
          typeof fetch =
          async () => {
            calls += 1;

            return new Response(
              "Fel",
              {
                status: 500,
              },
            );
          };

        const value =
          await fetchHorseGallopPercentWithRetry({
            horseId: 456,
            apiBaseUrl:
              "https://example.test",

            fetchImpl,

            attempts: 2,
            retryDelayMs: 0,
          });

        expect(calls).toBe(2);
        expect(value).toBeNull();
      },
    );
  },
);
