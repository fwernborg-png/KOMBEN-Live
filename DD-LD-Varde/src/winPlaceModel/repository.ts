import { supabase } from "../lib/supabase";
import type {
  WinPlaceBetRecord,
  WinPlaceMarket,
  WinPlaceResultOutcome,
  WinPlaceResultStatus,
  WinPlaceSignalPhase,
} from "./journal";

type DbWinPlaceBetRow = {
  id: string;
  bet_id: string;
  race_id: string;
  rule_version: string;
  market: WinPlaceMarket;
  signal_phase: WinPlaceSignalPhase;
  date: string;
  track_id: number;
  track_name: string;
  race_number: number;
  planned_start_time: string;
  lock_time: string;
  seconds_before_start: number | string;
  horse_number: number;
  horse_name: string;
  horse_id: number | null;
  start_lane: number | null;
  start_method: string | null;
  distance_meters: number | null;
  starters: number | null;
  start_odds: number | string;
  locked_win_odds: number | string;
  odds_drop_percent: number | string;
  cv_raw: number | string | null;
  cv_display: number | string | null;
  strength: number;
  indicators_green: string[];
  valid_odds_points: number;
  stake_oren: number;
  result_outcome: WinPlaceResultOutcome;
  result_status: WinPlaceResultStatus;
  finish_position_official: number | null;
  official_win_odds_decimal: number | string | null;
  place_odds_decimal: number | string | null;
  return_oren: number | null;
  net_oren: number | null;
  roi_pct: number | string | null;
  automatic_model_bet: boolean;
  user_actually_played: boolean;
  result_source: string | null;
  result_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

function numberValue(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRow(row: DbWinPlaceBetRow): WinPlaceBetRecord {
  return {
    id: row.id,
    betId: row.bet_id,
    raceId: row.race_id,
    ruleVersion: row.rule_version,
    market: row.market,
    signalPhase: row.signal_phase,
    date: row.date,
    trackId: row.track_id,
    trackName: row.track_name,
    raceNumber: row.race_number,
    plannedStartTime: row.planned_start_time,
    lockTime: row.lock_time,
    secondsBeforeStart:
      numberValue(row.seconds_before_start) ?? 0,
    horseNumber: row.horse_number,
    horseName: row.horse_name,
    horseId: row.horse_id,
    startLane: row.start_lane,
    startMethod: row.start_method,
    distanceMeters: row.distance_meters,
    starters: row.starters,
    startOdds: numberValue(row.start_odds) ?? 0,
    lockedWinOdds: numberValue(row.locked_win_odds) ?? 0,
    oddsDropPercent:
      numberValue(row.odds_drop_percent) ?? 0,
    cvRaw: numberValue(row.cv_raw),
    cvDisplay: numberValue(row.cv_display),
    strength: row.strength,
    indicatorsGreen: row.indicators_green ?? [],
    validOddsPoints: row.valid_odds_points,
    stakeOren: row.stake_oren,
    resultOutcome: row.result_outcome,
    resultStatus: row.result_status,
    finishPositionOfficial: row.finish_position_official,
    officialWinOddsDecimal: numberValue(
      row.official_win_odds_decimal,
    ),
    placeOddsDecimal: numberValue(row.place_odds_decimal),
    returnOren: row.return_oren,
    netOren: row.net_oren,
    roiPct: numberValue(row.roi_pct),
    automaticModelBet: row.automatic_model_bet,
    userActuallyPlayed: row.user_actually_played,
    resultSource: row.result_source,
    resultUpdatedAt: row.result_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadWinPlaceBetsByRange(
  dateFrom: string,
  dateTo: string,
  signalPhase: WinPlaceSignalPhase = "LIVE",
) {
  const { data, error } = await supabase
    .from("win_place_model_bets")
    .select("*")
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .eq("signal_phase", signalPhase)
    .order("date", { ascending: false })
    .order("track_name", { ascending: true })
    .order("race_number", { ascending: true })
    .order("market", { ascending: true });

  if (error) {
    throw new Error(
      `Kunde inte läsa vinnare- och platsspelen: ${error.message}`,
    );
  }

  return ((data ?? []) as DbWinPlaceBetRow[]).map(parseRow);
}

export async function loadWinPlaceBetsByDate(
  date: string,
  signalPhase: WinPlaceSignalPhase = "LIVE",
) {
  return loadWinPlaceBetsByRange(date, date, signalPhase);
}
