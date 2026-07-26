import { supabase } from "../lib/supabase";
import type { PlaceAuditLogEntry, PlaceBet, PlaceEvaluation } from "./types";

type DbEvalRow = {
  race_id: string;
  rule_version: string;
  decision: string;
  reasons: string[];
  race_json: unknown;
  lock_time_ms: number;
  locked_at: string;
  config_snapshot: unknown;
  checks_json: unknown;
  smoothest_json: unknown;
  snapshot_json: unknown;
  created_at: string;
  updated_at: string;
};

type DbBetRow = {
  bet_id: string;
  race_id: string;
  rule_version: string;
  config_snapshot: unknown;
  date: string;
  track_id: number;
  track_name: string;
  race_number: number;
  planned_start_time: string;
  lock_time: string;
  horse_number: number;
  horse_name: string;
  start_lane: number | null;
  start_method: string;
  distance_meters: number | null;
  starters: number;
  start_odds: number;
  current_win_odds: number;
  odds_drop_percent: number;
  cv_raw: number;
  cv_display: number;
  strength: number;
  indicators_green: string[];
  valid_odds_points: number;
  stake_oren: number;
  result_outcome: PlaceBet["resultOutcome"];
  result_status: PlaceBet["resultStatus"];
  finish_position_official: number | null;
  place_odds_decimal: number | null;
  return_oren: number | null;
  net_oren: number | null;
  roi_pct: number | null;
  automatic_model_bet: boolean;
  user_actually_played: boolean;
  result_source: string | null;
  result_updated_at: string | null;
  place_odds_entry_method: "AUTO" | "MANUAL" | null;
  created_at: string;
  updated_at: string;
};

function parseEvalRow(row: DbEvalRow): PlaceEvaluation {
  return {
    raceId: row.race_id,
    ruleVersion: row.rule_version,
    decision: row.decision as PlaceEvaluation["decision"],
    reasons: row.reasons ?? [],
    race: row.race_json as PlaceEvaluation["race"],
    lockTimeMs: row.lock_time_ms,
    lockedAt: row.locked_at,
    configSnapshot: row.config_snapshot as PlaceEvaluation["configSnapshot"],
    checks: row.checks_json as PlaceEvaluation["checks"],
    smoothest: row.smoothest_json as PlaceEvaluation["smoothest"],
    snapshot: row.snapshot_json as PlaceEvaluation["snapshot"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseBetRow(row: DbBetRow): PlaceBet {
  return {
    betId: row.bet_id,
    raceId: row.race_id,
    ruleVersion: row.rule_version,
    configSnapshot: row.config_snapshot as PlaceBet["configSnapshot"],
    date: row.date,
    trackId: row.track_id,
    trackName: row.track_name,
    raceNumber: row.race_number,
    plannedStartTime: row.planned_start_time,
    lockTime: row.lock_time,
    horseNumber: row.horse_number,
    horseName: row.horse_name,
    startLane: row.start_lane,
    startMethod: row.start_method,
    distanceMeters: row.distance_meters,
    starters: row.starters,
    startOdds: row.start_odds,
    currentWinOdds: row.current_win_odds,
    oddsDropPercent: row.odds_drop_percent,
    cvRaw: row.cv_raw,
    cvDisplay: row.cv_display,
    strength: row.strength,
    indicatorsGreen: row.indicators_green ?? [],
    validOddsPoints: row.valid_odds_points,
    stakeOren: row.stake_oren,
    resultOutcome: row.result_outcome,
    resultStatus: row.result_status,
    finishPositionOfficial: row.finish_position_official,
    placeOddsDecimal: row.place_odds_decimal,
    returnOren: row.return_oren,
    netOren: row.net_oren,
    roiPct: row.roi_pct,
    automaticModelBet: row.automatic_model_bet,
    userActuallyPlayed: row.user_actually_played,
    resultSource: row.result_source,
    resultUpdatedAt: row.result_updated_at,
    placeOddsEntryMethod: row.place_odds_entry_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadPlaceEvaluationsByDate(date: string) {
  const { data, error } = await supabase
    .from("place_race_evaluations")
    .select("*")
    .eq("race_json->>date", date)
    .order("race_json->>trackName", { ascending: true })
    .order("race_json->>raceNumber", { ascending: true });

  if (error) {
    throw new Error(`Kunde inte lasa lopputvarderingar: ${error.message}`);
  }

  return (data as DbEvalRow[]).map(parseEvalRow);
}

export async function upsertPlaceEvaluation(evaluation: PlaceEvaluation) {
  const { error } = await supabase.from("place_race_evaluations").upsert(
    {
      race_id: evaluation.raceId,
      rule_version: evaluation.ruleVersion,
      decision: evaluation.decision,
      reasons: evaluation.reasons,
      race_json: evaluation.race,
      lock_time_ms: evaluation.lockTimeMs,
      locked_at: evaluation.lockedAt,
      config_snapshot: evaluation.configSnapshot,
      checks_json: evaluation.checks,
      smoothest_json: evaluation.smoothest,
      snapshot_json: evaluation.snapshot,
      created_at: evaluation.createdAt,
      updated_at: evaluation.updatedAt,
    },
    { onConflict: "race_id,rule_version" },
  );

  if (error) {
    throw new Error(`Kunde inte spara lopputvardering: ${error.message}`);
  }
}

export async function loadPlaceBetsByDate(date: string) {
  const { data, error } = await supabase
    .from("place_model_bets")
    .select("*")
    .eq("date", date)
    .order("track_name", { ascending: true })
    .order("race_number", { ascending: true });

  if (error) {
    throw new Error(`Kunde inte lasa platsspel: ${error.message}`);
  }

  return (data as DbBetRow[]).map(parseBetRow);
}

export async function upsertPlaceBet(bet: PlaceBet) {
  const { error } = await supabase.from("place_model_bets").upsert(
    {
      bet_id: bet.betId,
      race_id: bet.raceId,
      rule_version: bet.ruleVersion,
      config_snapshot: bet.configSnapshot,
      date: bet.date,
      track_id: bet.trackId,
      track_name: bet.trackName,
      race_number: bet.raceNumber,
      planned_start_time: bet.plannedStartTime,
      lock_time: bet.lockTime,
      horse_number: bet.horseNumber,
      horse_name: bet.horseName,
      start_lane: bet.startLane,
      start_method: bet.startMethod,
      distance_meters: bet.distanceMeters,
      starters: bet.starters,
      start_odds: bet.startOdds,
      current_win_odds: bet.currentWinOdds,
      odds_drop_percent: bet.oddsDropPercent,
      cv_raw: bet.cvRaw,
      cv_display: bet.cvDisplay,
      strength: bet.strength,
      indicators_green: bet.indicatorsGreen,
      valid_odds_points: bet.validOddsPoints,
      stake_oren: bet.stakeOren,
      result_outcome: bet.resultOutcome,
      result_status: bet.resultStatus,
      finish_position_official: bet.finishPositionOfficial,
      place_odds_decimal: bet.placeOddsDecimal,
      return_oren: bet.returnOren,
      net_oren: bet.netOren,
      roi_pct: bet.roiPct,
      automatic_model_bet: bet.automaticModelBet,
      user_actually_played: bet.userActuallyPlayed,
      result_source: bet.resultSource,
      result_updated_at: bet.resultUpdatedAt,
      place_odds_entry_method: bet.placeOddsEntryMethod,
      created_at: bet.createdAt,
      updated_at: bet.updatedAt,
    },
    { onConflict: "race_id,rule_version" },
  );

  if (error) {
    throw new Error(`Kunde inte spara platsspel: ${error.message}`);
  }
}

export async function saveAuditLog(entry: PlaceAuditLogEntry) {
  const { error } = await supabase.from("place_model_audit_log").insert({
    id: entry.id,
    bet_id: entry.betId,
    field: entry.field,
    previous_value: entry.previousValue,
    new_value: entry.newValue,
    changed_at: entry.changedAt,
  });

  if (error) {
    throw new Error(`Kunde inte spara andringslogg: ${error.message}`);
  }
}
