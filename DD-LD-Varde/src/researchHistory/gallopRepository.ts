import {
  supabase,
} from "../lib/supabase";

import type {
  ResearchHistoryRow,
} from "./types";

export type GallopSelection =
  | "S1"
  | "S2"
  | "ALL_RUNNERS";

export type GallopRankFilter =
  | ""
  | "1"
  | "2"
  | "3"
  | "4"
  | "5+";

export type GallopHistoryFilters = {
  dateFrom: string;
  dateTo: string;

  selection:
    GallopSelection;

  countryCode: string;
  trackName: string;
  surface: string;

  distanceMeters:
    number | null;

  minStarters:
    number | null;

  maxStarters:
    number | null;

  minHandicapRating:
    number | null;

  maxHandicapRating:
    number | null;

  handicapRank:
    GallopRankFilter;

  minCarriedWeightKg:
    number | null;

  maxCarriedWeightKg:
    number | null;

  weightRank:
    GallopRankFilter;

  minDropPercent:
    number | null;

  maxDropPercent:
    number | null;

  minLockOdds:
    number | null;

  maxLockOdds:
    number | null;

  limit: number;
};

export type GallopHistoryOptions = {
  minDate: string | null;
  maxDate: string | null;

  raceCount: number;

  countries: string[];
  tracks: string[];
  surfaces: string[];
  distances: number[];
};

export type GallopHistoryRow =
  ResearchHistoryRow & {
    gallopSelection:
      GallopSelection;

    countryCode: string;

    surface: string | null;
    going: string | null;

    isHandicapRace:
      boolean | null;

    handicapRating:
      number | null;

    handicapRank:
      number | null;

    handicapDeltaFromTop:
      number | null;

    carriedWeightKg:
      number | null;

    weightRank:
      number | null;

    riderId:
      string | null;

    riderName:
      string | null;
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

  return parsed || null;
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

    return Number.isFinite(
      parsed,
    )
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
  return typeof value ===
    "boolean"
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
    .map(
      (item) =>
        item.trim(),
    )
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
      (
        value,
      ): value is number =>
        value !== null,
    )
    .map(Math.round);
}

function parseGallopSelection(
  value: unknown,
): GallopSelection {
  if (
    value === "S2" ||
    value === "ALL_RUNNERS"
  ) {
    return value;
  }

  return "S1";
}

export function parseGallopHistoryRow(
  value: unknown,
): GallopHistoryRow | null {
  const row =
    asRecord(value);

  if (!row) {
    return null;
  }

  const raceKey =
    asString(row.race_key);

  const raceDate =
    asString(row.race_date);

  const countryCode =
    asString(
      row.country_code,
    );

  const trackName =
    asString(
      row.track_name,
    );

  const horseName =
    asString(
      row.horse_name,
    );

  if (
    !raceKey ||
    !raceDate ||
    !countryCode ||
    !trackName ||
    !horseName
  ) {
    return null;
  }

  const gallopSelection =
    parseGallopSelection(
      row.selection_kind,
    );

  const riderIdValue =
    row.rider_id;

  const riderId =
    typeof riderIdValue ===
      "number"
      ? String(riderIdValue)
      : asNullableString(
          riderIdValue,
        );

  return {
    raceKey,
    raceDate,

    countryCode,

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

    raceCategory: null,
    raceClassCode: null,

    earningsMin: null,
    earningsMax: null,

    starters:
      asNumber(
        row.starters,
      ),

    /*
     * Standardanalysen använder inte
     * selectionKind i ROI-uträkningen.
     * S1/S2 ligger separat i gallopSelection.
     */
    selectionKind:
      gallopSelection ===
        "ALL_RUNNERS"
        ? "ALL_RUNNERS"
        : "MOST_SHORTENED",

    gallopSelection,

    runnerNumber:
      asInteger(
        row.runner_number,
      ),

    horseName,

    startLane: null,
    startDistanceMeters: null,
    distanceHandicapMeters:
      null,

    riderId,

    riderName:
      asNullableString(
        row.rider_name,
      ),

    driverId:
      riderId,

    driverName:
      asNullableString(
        row.rider_name,
      ),

    handicapRating:
      asNumber(
        row.handicap_rating,
      ),

    handicapRank:
      asNumber(
        row.handicap_rank,
      ),

    handicapDeltaFromTop:
      asNumber(
        row.handicap_delta_from_top,
      ),

    carriedWeightKg:
      asNumber(
        row.carried_weight_kg,
      ),

    weightRank:
      asNumber(
        row.weight_rank,
      ),

    surface:
      asNullableString(
        row.surface,
      ),

    going:
      asNullableString(
        row.going,
      ),

    isHandicapRace:
      asNullableBoolean(
        row.is_handicap_race,
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
      false,

    krValue: null,
    stValue: null,
    driverValue: null,
    spValue: null,
    gallopValue: null,
    oddsIndicatorValue: null,

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

export async function
loadGallopHistoryOptions():
Promise<GallopHistoryOptions> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "research_gallop_history_options_v1",
  );

  if (error) {
    throw new Error(
      `Kunde inte läsa galoppfilter: ${error.message}`,
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

      countries: [],
      tracks: [],
      surfaces: [],
      distances: [],
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

    countries:
      asStringArray(
        row.countries,
      ),

    tracks:
      asStringArray(
        row.tracks,
      ),

    surfaces:
      asStringArray(
        row.surfaces,
      ),

    distances:
      asNumberArray(
        row.distances,
      ),
  };
}

export async function
loadGallopHistoryRows(
  filters:
    GallopHistoryFilters,
): Promise<GallopHistoryRow[]> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "research_gallop_history_rows_v2",
    {
      p_date_from:
        filters.dateFrom ||
        null,

      p_date_to:
        filters.dateTo ||
        null,

      p_selection:
        filters.selection,

      p_country_code:
        filters.countryCode ||
        null,

      p_track_name:
        filters.trackName ||
        null,

      p_surface:
        filters.surface ||
        null,

      p_distance_meters:
        filters.distanceMeters,

      p_min_starters:
        filters.minStarters,

      p_max_starters:
        filters.maxStarters,

      p_min_handicap_rating:
        filters.minHandicapRating,

      p_max_handicap_rating:
        filters.maxHandicapRating,

      p_handicap_rank:
        filters.handicapRank ||
        null,

      p_min_carried_weight_kg:
        filters.minCarriedWeightKg,

      p_max_carried_weight_kg:
        filters.maxCarriedWeightKg,

      p_weight_rank:
        filters.weightRank ||
        null,

      p_min_drop_percent:
        filters.minDropPercent,

      p_max_drop_percent:
        filters.maxDropPercent,

      p_min_lock_odds:
        filters.minLockOdds,

      p_max_lock_odds:
        filters.maxLockOdds,

      p_limit:
        filters.limit,
    },
  );

  if (error) {
    throw new Error(
      `Kunde inte läsa galopphistoriken: ${error.message}`,
    );
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(
      parseGallopHistoryRow,
    )
    .filter(
      (
        row,
      ): row is GallopHistoryRow =>
        row !== null,
    );
}
