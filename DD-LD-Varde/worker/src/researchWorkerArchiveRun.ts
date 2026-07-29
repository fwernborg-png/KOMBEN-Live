import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WIN_PLACE_RULE_CONFIG_V1,
  isInWinPlaceFinalSignalWindow,
} from "../../src/winPlaceModel/config";
import {
  buildResearchLockArchiveRows,
  buildResearchRaceKey,
  persistResearchLockArchive,
  type ResearchArchiveRows,
} from "./researchArchive";
import {
  buildResearchArchiveRaceInput,
  mapResearchArchiveOddsRows,
  type WorkerResearchDbOddsRow,
  type WorkerResearchRace,
  type WorkerResearchTrack,
} from "./researchWorkerIntegration";

export type ResearchArchiveRaceItem = {
  track: WorkerResearchTrack;
  race: WorkerResearchRace;
};

export type ResearchArchiveRunSummary = {
  enabled: boolean;

  eligibleRaces: number;
  archivedRaces: number;

  completeSnapshots: number;
  partialSnapshots: number;

  skippedExisting: number;
  failedRaces: number;

  errors: string[];
};

export type ResearchArchivePersistenceAdapter = {
  loadExistingRaceKeys(args: {
    raceDate: string;
  }): Promise<Set<string>>;

  loadOddsRows(args: {
    raceId: string;
    collectionStartIso: string;
    lockTimeIso: string;
  }): Promise<WorkerResearchDbOddsRow[]>;

  persistRows(
    rows: ResearchArchiveRows,
  ): ReturnType<typeof persistResearchLockArchive>;
};

function emptySummary(
  enabled: boolean,
): ResearchArchiveRunSummary {
  return {
    enabled,

    eligibleRaces: 0,
    archivedRaces: 0,

    completeSnapshots: 0,
    partialSnapshots: 0,

    skippedExisting: 0,
    failedRaces: 0,

    errors: [],
  };
}

function appendError(
  summary: ResearchArchiveRunSummary,
  message: string,
) {
  if (summary.errors.length < 10) {
    summary.errors.push(message);
  }
}

export function createSupabaseResearchArchiveAdapter(
  supabase: SupabaseClient,
): ResearchArchivePersistenceAdapter {
  return {
    async loadExistingRaceKeys({ raceDate }) {
      const {
        data,
        error,
      } = await supabase
        .from("research_race_snapshots")
        .select("race_key")
        .eq("signal_phase", "LIVE")
        .eq("capture_type", "LOCK")
        .like(
          "race_key",
          `ATG:${raceDate}:%`,
        );

      if (error) {
        throw new Error(
          `Kunde inte läsa befintliga forskningssnapshots: ${error.message}`,
        );
      }

      return new Set(
        (data ?? []).map(
          (row) =>
            (
              row as {
                race_key: string;
              }
            ).race_key,
        ),
      );
    },

    async loadOddsRows({
      raceId,
      collectionStartIso,
      lockTimeIso,
    }) {
      const {
        data,
        error,
      } = await supabase
        .from("place_live_odds_points")
        .select(
          [
            "race_id",
            "runner_number",
            "horse_id",
            "horse_name",
            "market",
            "odds_decimal",
            "point_ts",
            "source",
          ].join(","),
        )
        .eq("race_id", raceId)
        .gte(
          "point_ts",
          collectionStartIso,
        )
        .lte(
          "point_ts",
          lockTimeIso,
        )
        .order("point_ts", {
          ascending: true,
        });

      if (error) {
        throw new Error(
          `Kunde inte läsa odds för forskningsarkivet: ${error.message}`,
        );
      }

      return (
        data ?? []
      ) as WorkerResearchDbOddsRow[];
    },

    persistRows(rows) {
      return persistResearchLockArchive({
        supabase,
        rows,
      });
    },
  };
}

export async function archiveResearchRacesAtLock(
  args: {
    enabled: boolean;

    raceDate: string;
    nowMs: number;

    races: ResearchArchiveRaceItem[];

    adapter:
      ResearchArchivePersistenceAdapter;
  },
): Promise<ResearchArchiveRunSummary> {
  const summary = emptySummary(
    args.enabled,
  );

  if (!args.enabled) {
    return summary;
  }

  let existingRaceKeys: Set<string>;

  try {
    existingRaceKeys =
      await args.adapter.loadExistingRaceKeys({
        raceDate: args.raceDate,
      });
  } catch (error) {
    summary.failedRaces += 1;

    appendError(
      summary,
      error instanceof Error
        ? error.message
        : String(error),
    );

    return summary;
  }

  for (const item of args.races) {
    const {
      track,
      race,
    } = item;

    if (
      !race.startTime ||
      !isInWinPlaceFinalSignalWindow(
        race.startTime,
        args.nowMs,
        WIN_PLACE_RULE_CONFIG_V1,
      )
    ) {
      continue;
    }

    summary.eligibleRaces += 1;

    const raceKey =
      buildResearchRaceKey({
        raceDate: args.raceDate,
        trackId: track.id,
        raceNumber: race.raceNumber,
        sourceRaceId: race.id,
      });

    if (
      existingRaceKeys.has(raceKey)
    ) {
      summary.skippedExisting += 1;
      continue;
    }

    try {
      const plannedStartTimeMs =
        Date.parse(race.startTime);

      if (
        !Number.isFinite(
          plannedStartTimeMs,
        )
      ) {
        throw new Error(
          "Planerad starttid är ogiltig",
        );
      }

      const collectionStartMs =
        plannedStartTimeMs -
        WIN_PLACE_RULE_CONFIG_V1
          .collectionStartMinutesBeforeRace *
          60_000;

      const rawOddsRows =
        await args.adapter.loadOddsRows({
          raceId: race.id,

          collectionStartIso:
            new Date(
              collectionStartMs,
            ).toISOString(),

          lockTimeIso:
            new Date(
              args.nowMs,
            ).toISOString(),
        });

      const archiveRace =
        buildResearchArchiveRaceInput({
          raceDate: args.raceDate,
          track,
          race,
        });

      const archiveOdds =
        mapResearchArchiveOddsRows({
          rows: rawOddsRows,
          race,
          actualLockTimeMs: args.nowMs,
        });

      const archiveRows =
        buildResearchLockArchiveRows({
          race: archiveRace,
          odds: archiveOdds,

          actualLockTimeMs:
            args.nowMs,

          targetLockSecondsBeforeStart:
            WIN_PLACE_RULE_CONFIG_V1
              .lockTargetSecondsBeforeRace,

          fetchedAtMs:
            args.nowMs,
        });

      const persisted =
        await args.adapter.persistRows(
          archiveRows,
        );

      summary.archivedRaces += 1;

      if (
        persisted.snapshotComplete
      ) {
        summary.completeSnapshots += 1;
      } else {
        summary.partialSnapshots += 1;
      }

      existingRaceKeys.add(raceKey);
    } catch (error) {
      summary.failedRaces += 1;

      appendError(
        summary,
        `${track.name} lopp ${race.raceNumber}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  return summary;
}
