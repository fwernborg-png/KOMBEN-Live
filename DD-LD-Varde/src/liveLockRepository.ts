import { supabase } from "./lib/supabase";

export type LiveLockStrengthRow = {
  runnerNumber: number;
  strengthTotal: number;
  actualSnapshotTime: string | null;

  krTopFour: boolean;
  stTopFour: boolean;
  driverTopFour: boolean;
  spTopFour: boolean;
  gallopTopFour: boolean;
  oddsIndicatorTopFour: boolean;
};

type UnknownRecord =
  Record<string, unknown>;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}

function asNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function asBoolean(
  value: unknown,
): boolean {
  return value === true;
}

function asNullableString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim() !== ""
    ? value
    : null;
}

export async function loadLiveLockStrength(args: {
  raceDate: string;
  trackName: string;
  raceNumber: number;
}): Promise<LiveLockStrengthRow[]> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "research_live_lock_strength_v1",
    {
      p_race_date:
        args.raceDate,

      p_track_name:
        args.trackName,

      p_race_number:
        args.raceNumber,
    },
  );

  if (error) {
    throw new Error(
      `Kunde inte läsa LIVE LOCK-styrka: ${error.message}`,
    );
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((value) => {
      const row = asRecord(value);

      if (!row) {
        return null;
      }

      const runnerNumber =
        asNumber(row.runner_number);

      const strengthTotal =
        asNumber(row.strength_total);

      if (
        runnerNumber === null ||
        strengthTotal === null
      ) {
        return null;
      }

      return {
        runnerNumber:
          Math.round(runnerNumber),

        strengthTotal:
          Math.round(strengthTotal),

        actualSnapshotTime:
          asNullableString(
            row.actual_snapshot_time,
          ),

        krTopFour:
          asBoolean(row.kr_top4),

        stTopFour:
          asBoolean(row.st_top4),

        driverTopFour:
          asBoolean(row.driver_top4),

        spTopFour:
          asBoolean(row.sp_top4),

        gallopTopFour:
          asBoolean(row.gallop_top4),

        oddsIndicatorTopFour:
          asBoolean(
            row.odds_indicator_top4,
          ),
      } satisfies LiveLockStrengthRow;
    })
    .filter(
      (
        row,
      ): row is LiveLockStrengthRow =>
        row !== null,
    );
}
