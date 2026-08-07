import type {
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  buildResearchProductKey,
} from "./researchArchive";
import {
  parseResearchCalendarGameProducts,
  type ParsedResearchProduct,
} from "./researchRaceParser";

export type ResearchProductBackfillRaceRow = {
  race_key: string;
  source_race_id: string;
  race_date: string;
  race_number: number;
  country_code: string;
  currency_code: string;
  parser_version: string | null;
};

export type ResearchProductBackfillAdapter = {
  listPendingRaces: (
    args: {
      parserVersion: string;
      limit: number;
    },
  ) => Promise<
    ResearchProductBackfillRaceRow[]
  >;

  replaceRaceProducts: (
    args: {
      race:
        ResearchProductBackfillRaceRow;
      products:
        ParsedResearchProduct[];
    },
  ) => Promise<void>;

  markRaceProcessed: (
    args: {
      raceKey: string;
      parserVersion: string;
      nowIso: string;
    },
  ) => Promise<void>;
};

export type ResearchProductBackfillSummary = {
  racesSelected: number;
  racesProcessed: number;
  racesWithCalendarProducts: number;
  productsUpserted: number;
  calendarDatesFetched: number;
  failures: number;
  errors: string[];
};

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? value as Record<
        string,
        unknown
      >
    : null;
}

export function buildResearchProductBackfillRows(
  args: {
    race:
      ResearchProductBackfillRaceRow;
    products:
      ParsedResearchProduct[];
  },
) {
  const unique =
    new Map<
      string,
      Record<string, unknown>
    >();

  for (const product of args.products) {
    const productKey =
      buildResearchProductKey(
        args.race.race_key,
        product,
      );

    unique.set(
      productKey,
      {
        product_key:
          productKey,

        race_key:
          args.race.race_key,

        product_code:
          product.productCode,

        product_id:
          product.productId,

        leg_number:
          product.legNumber,

        total_legs:
          product.totalLegs,

        product_start_time:
          null,

        is_main_product:
          false,

        turnover_minor_units:
          null,

        country_code:
          args.race.country_code,

        currency_code:
          args.race.currency_code,

        source:
          "ATG",

        raw_product_json:
          product.rawProductJson,
      },
    );
  }

  return [...unique.values()];
}

export function createSupabaseResearchProductBackfillAdapter(
  args: {
    supabase: SupabaseClient;
  },
): ResearchProductBackfillAdapter {
  return {
    async listPendingRaces({
      parserVersion,
      limit,
    }) {
      const {
        data,
        error,
      } = await args.supabase
        .from("research_races")
        .select(
          [
            "race_key",
            "source_race_id",
            "race_date",
            "race_number",
            "country_code",
            "currency_code",
            "parser_version",
          ].join(","),
        )
        .eq(
          "country_code",
          "SE",
        )
        .or(
          [
            "parser_version.is.null",
            `parser_version.neq.${parserVersion}`,
          ].join(","),
        )
        .order(
          "race_date",
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
        .limit(limit);

      if (error) {
        throw new Error(
          `Kunde inte läsa produkt-backfill: ${error.message}`,
        );
      }

      return (
        data ?? []
      ) as ResearchProductBackfillRaceRow[];
    },

    async replaceRaceProducts({
      race,
      products,
    }) {
      const {
        error:
          deleteError,
      } = await args.supabase
        .from(
          "research_race_products",
        )
        .delete()
        .eq(
          "race_key",
          race.race_key,
        );

      if (deleteError) {
        throw new Error(
          `Kunde inte rensa äldre produktrader för ${race.race_key}: ${deleteError.message}`,
        );
      }

      const rows =
        buildResearchProductBackfillRows({
          race,
          products,
        });

      if (!rows.length) {
        return;
      }

      const {
        error:
          upsertError,
      } = await args.supabase
        .from(
          "research_race_products",
        )
        .upsert(rows);

      if (upsertError) {
        throw new Error(
          `Kunde inte backfilla produkter för ${race.race_key}: ${upsertError.message}`,
        );
      }
    },

    async markRaceProcessed({
      raceKey,
      parserVersion,
      nowIso,
    }) {
      const {
        error,
      } = await args.supabase
        .from("research_races")
        .update({
          parser_version:
            parserVersion,
          updated_at:
            nowIso,
        })
        .eq(
          "race_key",
          raceKey,
        );

      if (error) {
        throw new Error(
          `Kunde inte markera produkt-backfill för ${raceKey}: ${error.message}`,
        );
      }
    },
  };
}

export async function runResearchProductBackfill(
  args: {
    enabled: boolean;
    parserVersion: string;
    nowIso: string;
    maxRaces?: number;

    fetchCalendar: (
      raceDate: string,
    ) => Promise<unknown>;

    adapter:
      ResearchProductBackfillAdapter;
  },
): Promise<
  ResearchProductBackfillSummary
> {
  const summary:
    ResearchProductBackfillSummary = {
      racesSelected: 0,
      racesProcessed: 0,
      racesWithCalendarProducts: 0,
      productsUpserted: 0,
      calendarDatesFetched: 0,
      failures: 0,
      errors: [],
    };

  if (!args.enabled) {
    return summary;
  }

  const appendError = (
    message: string,
  ) => {
    if (
      summary.errors.length < 10
    ) {
      summary.errors.push(
        message,
      );
    }
  };

  const pending =
    await args.adapter
      .listPendingRaces({
        parserVersion:
          args.parserVersion,
        limit:
          args.maxRaces ?? 5,
      });

  summary.racesSelected =
    pending.length;

  if (!pending.length) {
    return summary;
  }

  const racesByDate =
    new Map<
      string,
      ResearchProductBackfillRaceRow[]
    >();

  for (const race of pending) {
    const current =
      racesByDate.get(
        race.race_date,
      ) ?? [];

    current.push(race);

    racesByDate.set(
      race.race_date,
      current,
    );
  }

  for (
    const [
      raceDate,
      races,
    ]
    of racesByDate
  ) {
    let payload: unknown;

    try {
      payload =
        await args.fetchCalendar(
          raceDate,
        );

      summary.calendarDatesFetched +=
        1;
    } catch (error) {
      summary.failures +=
        races.length;

      appendError(
        `Kalender ${raceDate}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );

      continue;
    }

    const payloadRecord =
      asRecord(payload);

    const games =
      payloadRecord
        ? asRecord(
            payloadRecord.games,
          )
        : null;

    if (!games) {
      summary.failures +=
        races.length;

      appendError(
        `Kalender ${raceDate}: games saknas`,
      );

      continue;
    }

    const productsByRace =
      parseResearchCalendarGameProducts(
        games,
      );

    for (const race of races) {
      try {
        const products =
          productsByRace[
            race.source_race_id
          ] ?? [];

        await args.adapter
          .replaceRaceProducts({
            race,
            products,
          });

        await args.adapter
          .markRaceProcessed({
            raceKey:
              race.race_key,
            parserVersion:
              args.parserVersion,
            nowIso:
              args.nowIso,
          });

        summary.racesProcessed +=
          1;

        summary.productsUpserted +=
          products.length;

        if (products.length) {
          summary
            .racesWithCalendarProducts +=
            1;
        }
      } catch (error) {
        summary.failures +=
          1;

        appendError(
          `${race.race_key}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }
  }

  return summary;
}
