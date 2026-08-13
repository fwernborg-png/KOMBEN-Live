import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export type ResearchResultBackfillRow = {
  race_key: string;
  source_race_id: string;

  race_date: string;
  country_code: string;

  track_id: number;
  track_name: string;
  race_number: number;

  planned_start_time: string | null;

  archive_status: string;
  archived_result_count: number | null;
};

export type ResearchResultBackfillRaceItem = {
  track: {
    id: number;
    name: string;
    countryCode: string;
  };

  race: {
    id: string;
    raceNumber: number;

    [key: string]: unknown;
  };
};

export type ResearchResultBackfillSummary = {
  enabled: boolean;

  racesSelected: number;
  racesFetched: number;

  datesCompleted: number;
  racesCompleted: number;

  failedRaces: number;
  errors: string[];
};

type CompletionResult = {
  racesCompleted: number;
  failedRaces: number;
  errors: string[];
};

function emptySummary(
  enabled: boolean,
): ResearchResultBackfillSummary {
  return {
    enabled,

    racesSelected: 0,
    racesFetched: 0,

    datesCompleted: 0,
    racesCompleted: 0,

    failedRaces: 0,
    errors: [],
  };
}

function appendError(
  summary: ResearchResultBackfillSummary,
  message: string,
) {
  if (summary.errors.length < 10) {
    summary.errors.push(
      message,
    );
  }
}

export async function backfillMissingResearchResults<
  RaceItem extends ResearchResultBackfillRaceItem,
>(
  args: {
    enabled: boolean;

    supabase:
      SupabaseClient;

    currentRaceDate: string;
    nowIso: string;

    maxRaces?: number;

    loadRace: (
      row: ResearchResultBackfillRow,
    ) => Promise<
      RaceItem | null
    >;

    completeDate: (
      args: {
        raceDate: string;
        races:
          RaceItem[];
      },
    ) => Promise<CompletionResult>;
  },
): Promise<ResearchResultBackfillSummary> {
  const summary =
    emptySummary(
      args.enabled,
    );

  if (!args.enabled) {
    return summary;
  }

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
        "country_code",
        "track_id",
        "track_name",
        "race_number",
        "planned_start_time",
        "archive_status",
        "archived_result_count",
      ].join(","),
    )
    .neq(
      "archive_status",
      "COMPLETE",
    )
    .lt(
      "race_date",
      args.currentRaceDate,
    )
    .order(
      "updated_at",
      {
        ascending: true,
      },
    )
    .order(
      "race_date",
      {
        ascending: true,
      },
    )
    .order(
      "planned_start_time",
      {
        ascending: true,
      },
    )
    .limit(
      args.maxRaces ?? 3,
    );

  if (error) {
    throw new Error(
      `Kunde inte läsa äldre ofärdiga forskningslopp: ${error.message}`,
    );
  }

  const rows =
    (
      data ?? []
    ) as ResearchResultBackfillRow[];

  summary.racesSelected =
    rows.length;

  if (rows.length > 0) {
    const {
      error: rotationError,
    } = await args.supabase
      .from("research_races")
      .update({
        updated_at:
          args.nowIso,
      })
      .in(
        "race_key",
        rows.map(
          (row) =>
            row.race_key,
        ),
      );

    if (rotationError) {
      throw new Error(
        `Kunde inte rotera forskningskön: ${rotationError.message}`,
      );
    }
  }

  const racesByDate =
    new Map<
      string,
      RaceItem[]
    >();

  for (const row of rows) {
    try {
      const item =
        await args.loadRace(
          row,
        );

      if (!item) {
        summary.failedRaces += 1;

        appendError(
          summary,
          `${row.track_name} lopp ${row.race_number}: loppet kunde inte hämtas`,
        );

        continue;
      }

      summary.racesFetched += 1;

      const dateRaces =
        racesByDate.get(
          row.race_date,
        ) ?? [];

      dateRaces.push(
        item,
      );

      racesByDate.set(
        row.race_date,
        dateRaces,
      );
    } catch (error) {
      summary.failedRaces += 1;

      appendError(
        summary,
        `${row.track_name} lopp ${row.race_number}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  for (
    const [
      raceDate,
      races,
    ] of racesByDate
  ) {
    try {
      const completion =
        await args.completeDate({
          raceDate,
          races,
        });

      summary.datesCompleted += 1;

      summary.racesCompleted +=
        completion.racesCompleted;

      summary.failedRaces +=
        completion.failedRaces;

      for (
        const error of
        completion.errors
      ) {
        appendError(
          summary,
          error,
        );
      }
    } catch (error) {
      summary.failedRaces +=
        races.length;

      appendError(
        summary,
        `${raceDate}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  return summary;
}
