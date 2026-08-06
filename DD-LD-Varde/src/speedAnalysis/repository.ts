import {
  supabase,
} from "../lib/supabase";

import {
  normalizeTrackKey,
} from "./logic";

import type {
  SpeedAnalysisDocument,
  SpeedAnalysisMarker,
  SpeedAnalysisProduct,
  SpeedCellColor,
} from "./types";

type UnknownRecord =
  Record<string, unknown>;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as
      UnknownRecord
    : null;
}

function asString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value
    : "";
}

function asNumber(
  value: unknown,
): number | null {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  }

  return null;
}

function parseColor(
  value: unknown,
): SpeedCellColor {
  return (
    value === "GREEN" ||
    value === "YELLOW" ||
    value === "RED"
  )
    ? value
    : "NONE";
}

function parseProduct(
  value: unknown,
): SpeedAnalysisProduct {
  return value ===
    "V85"
    ? "V85"
    : "V86";
}

function parseMarker(
  value: unknown,
): SpeedAnalysisMarker | null {
  const row =
    asRecord(value);

  if (!row) {
    return null;
  }

  const raceDate =
    asString(
      row.race_date,
    );

  const trackName =
    asString(
      row.track_name,
    );

  const horseName =
    asString(
      row.horse_name,
    );

  const legNumber =
    asNumber(
      row.leg_number,
    );

  const runnerNumber =
    asNumber(
      row.runner_number,
    );

  if (
    !raceDate ||
    !trackName ||
    !horseName ||
    legNumber === null ||
    runnerNumber === null
  ) {
    return null;
  }

  return {
    id:
      asString(
        row.id,
      ) ||
      null,

    importId:
      asString(
        row.import_id,
      ) ||
      null,

    product:
      parseProduct(
        row.product,
      ),

    raceDate,

    trackName,

    trackKey:
      asString(
        row.track_key,
      ) ||
      normalizeTrackKey(
        trackName,
      ),

    sourceFilename:
      asString(
        row.source_filename,
      ),

    legNumber:
      Math.round(
        legNumber,
      ),

    runnerNumber:
      Math.round(
        runnerNumber,
      ),

    horseName,

    normalizedHorseName:
      asString(
        row.normalized_horse_name,
      ),

    spetsText:
      asString(
        row.spets_text,
      ),

    botText:
      asString(
        row.bot_text,
      ),

    s1000Text:
      asString(
        row.s1000_text,
      ),

    s500Text:
      asString(
        row.s500_text,
      ),

    botColor:
      parseColor(
        row.bot_color,
      ),

    s1000Color:
      parseColor(
        row.s1000_color,
      ),

    s500Color:
      parseColor(
        row.s500_color,
      ),

    probableLeader:
      row.probable_leader ===
      true,

    ownProbableLeader:
      row.own_probable_leader ===
      true,

    rankPosition:
      asNumber(
        row.rank_position,
      ),

    rankText:
      asString(
        row.rank_text,
      ),

    sourcePage:
      Math.round(
        asNumber(
          row.source_page,
        ) ??
        0,
      ),
  };
}

export async function loadSpeedAnalysisMarkersByDate(
  raceDate: string,
): Promise<SpeedAnalysisMarker[]> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "speed_analysis_runners",
    )
    .select("*")
    .eq(
      "race_date",
      raceDate,
    )
    .order(
      "track_name",
      {
        ascending: true,
      },
    )
    .order(
      "leg_number",
      {
        ascending: true,
      },
    )
    .order(
      "runner_number",
      {
        ascending: true,
      },
    );

  if (error) {
    throw new Error(
      `Kunde inte läsa Speedanalysen: ${error.message}`,
    );
  }

  return (
    Array.isArray(data)
      ? data
      : []
  )
    .map(
      parseMarker,
    )
    .filter(
      (
        marker,
      ): marker is
        SpeedAnalysisMarker =>
        marker !== null,
    );
}

export async function saveSpeedAnalysisDocument(
  document:
    SpeedAnalysisDocument,
): Promise<string> {
  const trackKey =
    normalizeTrackKey(
      document.trackName,
    );

  const runnerPayload =
    document.runners.map(
      (runner) => ({
        leg_number:
          runner.legNumber,

        runner_number:
          runner.runnerNumber,

        horse_name:
          runner.horseName,

        normalized_horse_name:
          runner.normalizedHorseName,

        spets_text:
          runner.spetsText,

        bot_text:
          runner.botText,

        s1000_text:
          runner.s1000Text,

        s500_text:
          runner.s500Text,

        bot_color:
          runner.botColor,

        s1000_color:
          runner.s1000Color,

        s500_color:
          runner.s500Color,

        probable_leader:
          runner.probableLeader,

        own_probable_leader:
          runner.ownProbableLeader,

        rank_position:
          runner.rankPosition,

        rank_text:
          runner.rankText,

        source_page:
          runner.sourcePage,
      }),
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "replace_speed_analysis_import",
    {
      p_race_date:
        document.raceDate,

      p_track_name:
        document.trackName.trim(),

      p_track_key:
        trackKey,

      p_product:
        document.product,

      p_source_filename:
        document.sourceFilename,

      p_page_count:
        document.pageCount,

      p_runners:
        runnerPayload,
    },
  );

  if (error) {
    throw new Error(
      `Kunde inte spara Speedanalysen: ${error.message}`,
    );
  }

  if (
    typeof data !==
      "string" ||
    !data
  ) {
    throw new Error(
      "Databasen returnerade inget import-ID.",
    );
  }

  return data;
}
