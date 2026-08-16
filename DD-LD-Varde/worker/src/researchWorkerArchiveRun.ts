import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WIN_PLACE_RULE_CONFIG_V1,
  getWinPlacePlannedLockTimeMs,
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
  retriedPartial: number;
  failedRaces: number;

  errors: string[];
};

export type ResearchArchivePersistenceAdapter = {
  loadExistingLockStates(args: {
    raceDate: string;
  }): Promise<Map<string, boolean>>;

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
    retriedPartial: 0,
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
    async loadExistingLockStates({ raceDate }) {
      const {
        data,
        error,
      } = await supabase
        .from("research_race_snapshots")
        .select("race_key,snapshot_complete")
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

      return new Map(
        (data ?? []).map(
          (row) => {
            const parsed = row as {
              race_key: string;
              snapshot_complete: boolean;
            };

            return [
              parsed.race_key,
              parsed.snapshot_complete,
            ] as const;
          },
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

  let existingLockStates:
    Map<string, boolean>;

  try {
    existingLockStates =
      await args.adapter.loadExistingLockStates({
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

    if (!race.startTime) {
      continue;
    }

    const targetLockTimeMs =
      getWinPlacePlannedLockTimeMs(
        race.startTime,
        WIN_PLACE_RULE_CONFIG_V1,
      );

    /*
     * T−90 är den enda giltiga låstidpunkten.
     *
     * Cronen får fortfarande köras i toleransfönstret
     * T−120..T−60, men forskningsloppet får inte
     * arkiveras före T−90.
     */
    const plannedStartTimeMs =
      Date.parse(race.startTime);

    /*
     * Själva datalåset är ALLTID exakt T−90.
     *
     * Cronen får utföra arkiveringen efter T−90
     * (även om nästa minutkörning råkar bli T−40
     * eller strax efter start), men oddsen läses
     * aldrig längre än exakt T−90.
     */
    const archiveDeadlineMs =
      plannedStartTimeMs + 90_000;

    if (
      !Number.isFinite(targetLockTimeMs) ||
      !Number.isFinite(plannedStartTimeMs) ||
      args.nowMs < targetLockTimeMs ||
      args.nowMs > archiveDeadlineMs
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

    const existingSnapshotComplete =
      existingLockStates.get(
        raceKey,
      );

    if (
      existingSnapshotComplete === true
    ) {
      summary.skippedExisting += 1;
      continue;
    }

    if (
      existingSnapshotComplete === false
    ) {
      summary.retriedPartial += 1;
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
              targetLockTimeMs,
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
          actualLockTimeMs:
            targetLockTimeMs,
        });

      const archiveRows =
        buildResearchLockArchiveRows({
          race: archiveRace,
          odds: archiveOdds,

          actualLockTimeMs:
            targetLockTimeMs,

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

      existingLockStates.set(
        raceKey,
        persisted.snapshotComplete,
      );
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
