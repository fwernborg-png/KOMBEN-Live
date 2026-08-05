import type { WinPlaceEvaluation } from "../../src/winPlaceModel/types";

export type WinPlaceMarket = "WIN" | "PLACE";

export function buildWinPlaceBetRows(args: {
  evaluation: WinPlaceEvaluation;
  nowIso: string;
}) {
  const { evaluation, nowIso } = args;
  const candidate =
    evaluation.selectedCandidate ?? evaluation.mostShortened;

  if (evaluation.decision !== "PLAY" || !candidate) {
    return [];
  }

  const base = {
    race_id: evaluation.raceId,
    rule_version: evaluation.ruleVersion,
    signal_phase: "LIVE",
    config_snapshot: evaluation.configSnapshot,

    date: evaluation.race.date,
    track_id: evaluation.race.trackId,
    track_name: evaluation.race.trackName,
    race_number: evaluation.race.raceNumber,
    planned_start_time: evaluation.race.plannedStartTime,
    lock_time: evaluation.lockedAt,
    seconds_before_start: evaluation.secondsBeforeStartAtLock,

    horse_number: candidate.runnerNumber,
    horse_name: candidate.runnerName,
    horse_id: candidate.horseId,
    start_lane: candidate.startLane,
    start_method: evaluation.race.startMethod,
    distance_meters: evaluation.race.distanceMeters,
    starters: evaluation.race.starters,

    start_odds: candidate.startOdds,
    locked_win_odds: candidate.currentWinOdds,
    odds_drop_percent: candidate.oddsDropPercent,
    cv_raw: candidate.cvRaw,
    cv_display: candidate.cvDisplay,
    strength: candidate.strength,
    indicators_green: candidate.indicatorsGreen,
    valid_odds_points: candidate.validOddsPoints,

    result_outcome: "PENDING",
    result_status: "PENDING",
    finish_position_official: null,
    official_win_odds_decimal: null,
    place_odds_decimal: null,
    return_oren: null,
    net_oren: null,
    roi_pct: null,

    automatic_model_bet: true,
    user_actually_played: false,
    result_source: null,
    result_updated_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  return [
    {
      ...base,
      bet_id: [
        evaluation.raceId,
        evaluation.ruleVersion,
        "WIN",
        "LIVE",
      ].join(":"),
      market: "WIN" satisfies WinPlaceMarket,
      stake_oren:
        evaluation.configSnapshot.defaultWinStakeSEK * 100,
    },
    {
      ...base,
      bet_id: [
        evaluation.raceId,
        evaluation.ruleVersion,
        "PLACE",
        "LIVE",
      ].join(":"),
      market: "PLACE" satisfies WinPlaceMarket,
      stake_oren:
        evaluation.configSnapshot.defaultPlaceStakeSEK * 100,
    },
  ];
}
