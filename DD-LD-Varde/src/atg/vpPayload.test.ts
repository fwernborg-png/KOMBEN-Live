import {
  describe,
  expect,
  it,
} from "vitest";

import {
  extractVpPlaceOddsRawByRunner,
  mergeVpPayloadIntoWinnerPayload,
} from "./vpPayload";

type TestRunner = {
  number: number;
  placeOdds?: number;
  pools?: {
    vinnare?: {
      odds?: number;
    };
    plats?: {
      odds?: number;
    };
  };
};

type TestPayload = {
  races: Array<{
    number: number;
    starts: TestRunner[];
  }>;
};

describe(
  "mergeVpPayloadIntoWinnerPayload",
  () => {
    it(
      "kopplar platsodds efter startnummer även när ordningen skiljer sig",
      () => {
        const winnerPayload = {
          races: [
            {
              number: 4,
              starts: [
                {
                  number: 1,
                  pools: {
                    vinnare: {
                      odds: 425,
                    },
                  },
                },
                {
                  number: 2,
                  pools: {
                    vinnare: {
                      odds: 710,
                    },
                  },
                },
              ],
            },
          ],
        };

        const vpPayload = {
          races: [
            {
              number: 4,
              starts: [
                {
                  number: 2,
                  pools: {
                    plats: {
                      odds: 221,
                    },
                  },
                },
                {
                  number: 1,
                  pools: {
                    plats: {
                      odds: 164,
                    },
                  },
                },
              ],
            },
          ],
        };

        const merged =
          mergeVpPayloadIntoWinnerPayload(
            winnerPayload,
            vpPayload,
          ) as TestPayload;

        expect(
          merged.races[0]
            .starts[0]
            .pools
            ?.vinnare
            ?.odds,
        ).toBe(425);

        expect(
          merged.races[0]
            .starts[0]
            .pools
            ?.plats
            ?.odds,
        ).toBe(164);

        expect(
          merged.races[0]
            .starts[1]
            .pools
            ?.plats
            ?.odds,
        ).toBe(221);
      },
    );

    it(
      "kan läsa direkt placeOdds när poolobjektet saknas",
      () => {
        const winnerPayload = {
          races: [
            {
              number: 1,
              starts: [
                {
                  number: 3,
                },
              ],
            },
          ],
        };

        const vpPayload = {
          races: [
            {
              number: 1,
              starts: [
                {
                  number: 3,
                  placeOdds: 187,
                },
              ],
            },
          ],
        };

        const merged =
          mergeVpPayloadIntoWinnerPayload(
            winnerPayload,
            vpPayload,
          ) as TestPayload;

        expect(
          merged.races[0]
            .starts[0]
            .placeOdds,
        ).toBe(187);

        expect(
          merged.races[0]
            .starts[0]
            .pools
            ?.plats
            ?.odds,
        ).toBe(187);
      },
    );

    it(
      "ändrar inte ursprungsobjektet",
      () => {
        const winnerPayload = {
          races: [
            {
              number: 1,
              starts: [
                {
                  number: 1,
                },
              ],
            },
          ],
        };

        const before =
          JSON.stringify(
            winnerPayload,
          );

        mergeVpPayloadIntoWinnerPayload(
          winnerPayload,
          {
            races: [
              {
                number: 1,
                starts: [
                  {
                    number: 1,
                    placeOdds: 133,
                  },
                ],
              },
            ],
          },
        );

        expect(
          JSON.stringify(
            winnerPayload,
          ),
        ).toBe(before);
      },
    );

    it(
      "returnerar vinnardatan oförändrad när V/P saknas",
      () => {
        const winnerPayload = {
          races: [
            {
              number: 1,
              starts: [
                {
                  number: 1,
                },
              ],
            },
          ],
        };

        expect(
          mergeVpPayloadIntoWinnerPayload(
            winnerPayload,
            null,
          ),
        ).toBe(winnerPayload);
      },
    );
  },
);

describe(
  "extractVpPlaceOddsRawByRunner",
  () => {
    it(
      "skapar en startnummerbaserad oddskarta",
      () => {
        const result =
          extractVpPlaceOddsRawByRunner({
            races: [
              {
                starts: [
                  {
                    number: 4,
                    pools: {
                      plats: {
                        odds: 176,
                      },
                    },
                  },
                  {
                    number: 9,
                    placeOdds: 315,
                  },
                ],
              },
            ],
          });

        expect(
          result.get(4),
        ).toBe(176);

        expect(
          result.get(9),
        ).toBe(315);
      },
    );

    it(
      "ignorerar ogiltiga odds",
      () => {
        const result =
          extractVpPlaceOddsRawByRunner({
            races: [
              {
                starts: [
                  {
                    number: 1,
                    placeOdds: 0,
                  },
                  {
                    number: 2,
                    placeOdds: 9999,
                  },
                ],
              },
            ],
          });

        expect(result.size).toBe(0);
      },
    );
  },
);
