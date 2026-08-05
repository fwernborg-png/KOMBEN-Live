import { supabase } from "../lib/supabase";

import type {
  ResearchHistoryFilters,
  ResearchHistoryOptions,
  ResearchHistoryRow,
  ResearchSelection,
} from "./types";

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

function asString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value
    : "";
}

function asNullableString(
  value: unknown,
): string | null {
  const parsed =
    asString(value).trim();

  return parsed
    ? parsed
    : null;
}

function asNullableId(
  value: unknown,
): string | null {
  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return null;
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
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function asInteger(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    asNumber(value);

  return parsed === null
    ? fallback
    : Math.round(parsed);
}

function asBoolean(
  value: unknown,
): boolean {
  return value === true;
}

function asNullableBoolean(
  value: unknown,
): boolean | null {
  return typeof value === "boolean"
    ? value
    : null;
}

function asStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asString)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asNumberArray(
  value: unknown,
): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asNumber)
    .filter(
      (item): item is number =>
        item !== null,
    )
    .map(Math.round);
}

function parseSelection(
  value: unknown,
): ResearchSelection {
  if (
    value === "SMOOTHEST" ||
    value === "FAVORITE" ||
    value === "ALL_RUNNERS"
  ) {
    return value;
  }

  return "MOST_SHORTENED";
}

function parseHistoryRow(
  value: unknown,
): ResearchHistoryRow | null {
  const row =
    asRecord(value);

  if (!row) {
    return null;
  }

  const raceKey =
    asString(row.race_key);

  const raceDate =
    asString(row.race_date);

  const trackName =
    asString(row.track_name);

  const horseName =
    asString(row.horse_name);

  if (
    !raceKey ||
    !raceDate ||
    !trackName ||
    !horseName
  ) {
    return null;
  }

  return {
    raceKey,
    raceDate,

    trackName,

    raceNumber:
      asInteger(
        row.race_number,
      ),

    raceName:
      asNullableString(
        row.race_name,
      ),

    plannedStartTime:
      asNullableString(
        row.planned_start_time,
      ),

    startMethod:
      asNullableString(
        row.start_method,
      ),

    distanceMeters:
      asNumber(
        row.distance_meters,
      ),

    raceCategory:
      asNullableString(
        row.race_category,
      ),

    raceClassCode:
      asNullableString(
        row.race_class_code,
      ),

    earningsMin:
      asNumber(
        row.earnings_min,
      ),

    earningsMax:
      asNumber(
        row.earnings_max,
      ),

    starters:
      asNumber(
        row.starters,
      ),

    selectionKind:
      parseSelection(
        row.selection_kind,
      ),

    runnerNumber:
      asInteger(
        row.runner_number,
      ),

    horseName,

    startLane:
      asNumber(
        row.start_lane,
      ),

    startDistanceMeters:
      asNumber(
        row.start_distance_meters,
      ),

    distanceHandicapMeters:
      asNumber(
        row.distance_handicap_meters,
      ),

    driverId:
      asNullableId(
        row.driver_id,
      ),

    driverName:
      asNullableString(
        row.driver_name,
      ),

    strengthTotal:
      asNumber(
        row.strength_total,
      ),

    startOdds:
      asNumber(
        row.start_odds,
      ),

    lockOdds:
      asNumber(
        row.lock_odds,
      ),

    finalOdds:
      asNumber(
        row.final_odds,
      ),

    oddsDropToLockPercent:
      asNumber(
        row.odds_drop_to_lock_percent,
      ),

    oddsDropToFinalPercent:
      asNumber(
        row.odds_drop_to_final_percent,
      ),

    cvPercent:
      asNumber(
        row.cv_percent,
      ),

    validOddsPoints:
      asInteger(
        row.valid_odds_points,
      ),

    isFavoriteAtLock:
      asBoolean(
        row.is_favorite_at_lock,
      ),

    krValue:
      asNumber(
        row.kr_value,
      ),

    stValue:
      asNumber(
        row.st_value,
      ),

    driverValue:
      asNumber(
        row.driver_value,
      ),

    spValue:
      asNumber(
        row.sp_value,
      ),

    gallopValue:
      asNumber(
        row.gallop_value,
      ),

    oddsIndicatorValue:
      asNumber(
        row.odds_indicator_value,
      ),

    started:
      asNullableBoolean(
        row.started,
      ),

    scratchedAfterLock:
      asBoolean(
        row.scratched_after_lock,
      ),

    betVoid:
      asBoolean(
        row.bet_void,
      ),

    finishPositionOfficial:
      asNumber(
        row.finish_position_official,
      ),

    winnerOfficial:
      asBoolean(
        row.winner_official,
      ),

    placedOfficial:
      asNullableBoolean(
        row.placed_official,
      ),

    galloped:
      asNullableBoolean(
        row.galloped,
      ),

    disqualified:
      asBoolean(
        row.disqualified,
      ),

    didNotFinish:
      asBoolean(
        row.did_not_finish,
      ),

    officialWinOddsDecimal:
      asNumber(
        row.official_win_odds_decimal,
      ),

    officialPlaceOddsDecimal:
      asNumber(
        row.official_place_odds_decimal,
      ),

    resultStatus:
      asString(
        row.result_status,
      ),

    metricQualityStatus:
      asString(
        row.metric_quality_status,
      ),

    indicatorDataComplete:
      asBoolean(
        row.indicator_data_complete,
      ),

    oddsDataComplete:
      asBoolean(
        row.odds_data_complete,
      ),
  };
}

export async function loadResearchHistoryOptions():
  Promise<ResearchHistoryOptions> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "research_history_options_v2",
  );

  if (error) {
    throw new Error(
      `Kunde inte läsa analysfilter V2: ${error.message}`,
    );
  }

  const source =
    Array.isArray(data)
      ? data[0]
      : data;

  const row =
    asRecord(source);

  if (!row) {
    return {
      minDate: null,
      maxDate: null,

      raceCount: 0,

      tracks: [],
      distances: [],
      startMethods: [],

      raceCategories: [],
      raceClassCodes: [],

      drivers: [],
      startLanes: [],
    };
  }

  return {
    minDate:
      asNullableString(
        row.min_date,
      ),

    maxDate:
      asNullableString(
        row.max_date,
      ),

    raceCount:
      asInteger(
        row.race_count,
      ),

    tracks:
      asStringArray(
        row.tracks,
      ),

    distances:
      asNumberArray(
        row.distances,
      ),

    startMethods:
      asStringArray(
        row.start_methods,
      ),

    raceCategories:
      asStringArray(
        row.race_categories,
      ),

    raceClassCodes:
      asStringArray(
        row.race_class_codes,
      ),

    drivers:
      asStringArray(
        row.drivers,
      ),

    startLanes:
      asNumberArray(
        row.start_lanes,
      ),
  };
}

export async function loadResearchHistoryRows(
  filters: ResearchHistoryFilters,
): Promise<ResearchHistoryRow[]> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "research_history_rows_v4",
    {
      p_date_from:
        filters.dateFrom || null,

      p_date_to:
        filters.dateTo || null,

      p_selection:
        filters.selection,

      p_start_method:
        filters.startMethod || null,

      p_distance_meters:
        filters.distanceMeters,

      p_track_name:
        filters.trackName || null,

      p_driver_name:
        filters.driverName || null,

      p_start_lane:
        filters.startLane,

      p_lane_group:
        filters.laneGroup || "ALL",

      p_race_category:
        filters.raceCategory || null,

      p_race_class_code:
        filters.raceClassCode || null,

      p_earnings_min:
        filters.earningsMin,

      p_earnings_max:
        filters.earningsMax,

      p_min_starters:
        filters.minStarters,

      p_max_starters:
        filters.maxStarters,

      p_min_strength:
        filters.minStrength,

      p_max_strength:
        filters.maxStrength,

      p_kr_top4:
        filters.krTopFour,

      p_st_top4:
        filters.stTopFour,

      p_driver_top4:
        filters.driverTopFour,

      p_sp_top4:
        filters.spTopFour,

      p_gallop_top4:
        filters.gallopTopFour,

      p_odds_indicator_top4:
        filters.oddsIndicatorTopFour,

      p_min_drop_percent:
        filters.minDropPercent,

      p_max_drop_percent:
        filters.maxDropPercent,

      p_min_start_odds:
        filters.minStartOdds,

      p_max_start_odds:
        filters.maxStartOdds,

      p_min_lock_odds:
        filters.minLockOdds,

      p_max_lock_odds:
        filters.maxLockOdds,

      p_complete_only:
        filters.completeOnly,

      p_limit:
        filters.limit,
    },
  );

  if (error) {
    throw new Error(
      `Kunde inte läsa historiken V4: ${error.message}`,
    );
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(parseHistoryRow)
    .filter(
      (
        row,
      ): row is ResearchHistoryRow =>
        row !== null,
    );
}
