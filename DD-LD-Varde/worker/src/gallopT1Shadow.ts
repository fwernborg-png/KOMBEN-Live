import type {
  SupabaseClient,
} from "@supabase/supabase-js";
import {
  GALLOP_T1_LOCK_TARGET_SECONDS,
  GALLOP_T1_MAX_DROP_PERCENT,
  GALLOP_T1_MIN_DROP_PERCENT,
  GALLOP_T1_PREVIEW_TARGET_SECONDS,
  GALLOP_T1_SHADOW_RULE_VERSION,
  GALLOP_T1_SHADOW_START_DATE,
  GALLOP_T1_SHADOW_STRATEGY_CODE,
  GALLOP_T1_STAKE_SEK,
  isGallopT1ShadowRace,
} from "../../src/gallop/gallopT1ShadowConfig";
import type {
  WorkerResearchRace,
  WorkerResearchTrack,
} from "./researchWorkerIntegration";

export type GallopT1ShadowRunner = {
  number: number;
  name: string;
  scratched: boolean;
};

export type GallopT1ShadowPoint = {
  runnerNumber: number;
  odds: number;
  timestampMs: number;
};

export type GallopT1ShadowRunnerResult = {
  runnerNumber: number;
  horseName: string;

  startOdds: number;
  t2Odds: number;
  t1Odds: number;

  totalDropAtT2Percent: number;
  totalDropAtT1Percent: number;
  lastMinuteDropPercent: number;

  totalDropAtT2Rank: number;
  totalDropAtT1Rank: number;
  lastMinuteDropRank: number;

  validOddsPoints: number;
  lockPointMs: number;
};

export type GallopT1ShadowEvaluation = {
  dataComplete: boolean;
  qualifies: boolean;

  candidate:
    GallopT1ShadowRunnerResult |
    null;

  t2LeaderRunnerNumber:
    number |
    null;

  leaderChangedLastMinute:
    boolean |
    null;

  runners:
    GallopT1ShadowRunnerResult[];
};

type DbOddsRow = {
  runner_number: number;
  odds_decimal: number | string;
  point_ts: string;
};

function percentDrop(
  startOdds: number,
  endOdds: number,
): number {
  return (
    (
      startOdds -
      endOdds
    ) /
    startOdds
  ) * 100;
}

function latestAtOrBefore(
  points: GallopT1ShadowPoint[],
  timestampMs: number,
): GallopT1ShadowPoint | null {
  return (
    [...points]
      .filter(
        (point) =>
          point.timestampMs <=
          timestampMs,
      )
      .sort(
        (a, b) =>
          b.timestampMs -
          a.timestampMs,
      )[0] ??
    null
  );
}

function rankBy(
  rows: Array<{
    runnerNumber: number;
    value: number;
    odds: number;
  }>,
): Map<number, number> {
  return new Map(
    [...rows]
      .sort(
        (a, b) =>
          b.value -
            a.value ||
          a.odds -
            b.odds ||
          a.runnerNumber -
            b.runnerNumber,
      )
      .map(
        (row, index) => [
          row.runnerNumber,
          index + 1,
        ],
      ),
  );
}

function coefficientOfVariation(
  values: number[],
): number | null {
  if (values.length < 2) {
    return null;
  }

  const mean =
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    values.length;

  if (mean <= 0) {
    return null;
  }

  const variance =
    values.reduce(
      (sum, value) =>
        sum +
        (
          value -
          mean
        ) ** 2,
      0,
    ) /
    values.length;

  return (
    Math.sqrt(variance) /
    mean
  ) * 100;
}

export function evaluateGallopT1Shadow(args: {
  runners: GallopT1ShadowRunner[];
  points: GallopT1ShadowPoint[];
  plannedStartTimeMs: number;
}): GallopT1ShadowEvaluation {
  const activeRunners =
    args.runners.filter(
      (runner) =>
        !runner.scratched,
    );

  const collectionStartMs =
    args.plannedStartTimeMs -
    60 * 60_000;

  const t2TargetMs =
    args.plannedStartTimeMs -
    GALLOP_T1_PREVIEW_TARGET_SECONDS *
      1_000;

  const t1TargetMs =
    args.plannedStartTimeMs -
    GALLOP_T1_LOCK_TARGET_SECONDS *
      1_000;

  const provisional =
    activeRunners.map(
      (runner) => {
        const history =
          args.points
            .filter(
              (point) =>
                point.runnerNumber ===
                  runner.number &&
                point.timestampMs >=
                  collectionStartMs &&
                point.timestampMs <=
                  t1TargetMs &&
                Number.isFinite(
                  point.odds,
                ) &&
                point.odds > 0 &&
                point.odds <= 200 &&
                Math.abs(
                  point.odds -
                  99.99,
                ) > 0.000001,
            )
            .sort(
              (a, b) =>
                a.timestampMs -
                b.timestampMs,
            );

        const startPoint =
          history[0] ??
          null;

        const t2Point =
          latestAtOrBefore(
            history,
            t2TargetMs,
          );

        const t1Point =
          latestAtOrBefore(
            history,
            t1TargetMs,
          );

        const complete =
          history.length >= 5 &&
          startPoint !== null &&
          t2Point !== null &&
          t1Point !== null &&
          Math.abs(
            t2Point.timestampMs -
            t2TargetMs,
          ) <=
            75_000 &&
          Math.abs(
            t1Point.timestampMs -
            t1TargetMs,
          ) <=
            35_000;

        if (
          !complete ||
          !startPoint ||
          !t2Point ||
          !t1Point
        ) {
          return null;
        }

        return {
          runnerNumber:
            runner.number,

          horseName:
            runner.name,

          startOdds:
            startPoint.odds,

          t2Odds:
            t2Point.odds,

          t1Odds:
            t1Point.odds,

          totalDropAtT2Percent:
            percentDrop(
              startPoint.odds,
              t2Point.odds,
            ),

          totalDropAtT1Percent:
            percentDrop(
              startPoint.odds,
              t1Point.odds,
            ),

          lastMinuteDropPercent:
            percentDrop(
              t2Point.odds,
              t1Point.odds,
            ),

          validOddsPoints:
            history.length,

          lockPointMs:
            t1Point.timestampMs,
        };
      },
    );

  const completeRows =
    provisional.filter(
      (
        row,
      ): row is NonNullable<
        typeof row
      > =>
        row !== null,
    );

  const dataComplete =
    activeRunners.length > 0 &&
    completeRows.length ===
      activeRunners.length;

  if (!dataComplete) {
    return {
      dataComplete: false,
      qualifies: false,
      candidate: null,
      t2LeaderRunnerNumber:
        null,
      leaderChangedLastMinute:
        null,
      runners: [],
    };
  }

  const t2Ranks =
    rankBy(
      completeRows.map(
        (row) => ({
          runnerNumber:
            row.runnerNumber,
          value:
            row.totalDropAtT2Percent,
          odds:
            row.t2Odds,
        }),
      ),
    );

  const t1Ranks =
    rankBy(
      completeRows.map(
        (row) => ({
          runnerNumber:
            row.runnerNumber,
          value:
            row.totalDropAtT1Percent,
          odds:
            row.t1Odds,
        }),
      ),
    );

  const lastMinuteRanks =
    rankBy(
      completeRows.map(
        (row) => ({
          runnerNumber:
            row.runnerNumber,
          value:
            row.lastMinuteDropPercent,
          odds:
            row.t1Odds,
        }),
      ),
    );

  const runners =
    completeRows
      .map(
        (row) => ({
          ...row,

          totalDropAtT2Rank:
            t2Ranks.get(
              row.runnerNumber,
            ) ??
            0,

          totalDropAtT1Rank:
            t1Ranks.get(
              row.runnerNumber,
            ) ??
            0,

          lastMinuteDropRank:
            lastMinuteRanks.get(
              row.runnerNumber,
            ) ??
            0,
        }),
      )
      .sort(
        (a, b) =>
          a.runnerNumber -
          b.runnerNumber,
      );

  const candidate =
    runners.find(
      (runner) =>
        runner.totalDropAtT1Rank ===
        1,
    ) ??
    null;

  const t2Leader =
    runners.find(
      (runner) =>
        runner.totalDropAtT2Rank ===
        1,
    ) ??
    null;

  const qualifies =
    candidate !== null &&
    candidate
      .totalDropAtT1Percent >=
      GALLOP_T1_MIN_DROP_PERCENT &&
    candidate
      .totalDropAtT1Percent <
      GALLOP_T1_MAX_DROP_PERCENT;

  return {
    dataComplete: true,
    qualifies,
    candidate,
    t2LeaderRunnerNumber:
      t2Leader?.runnerNumber ??
      null,
    leaderChangedLastMinute:
      candidate !== null &&
      t2Leader !== null
        ? candidate.runnerNumber !==
          t2Leader.runnerNumber
        : null,
    runners,
  };
}

export async function runGallopT1ShadowModel(args: {
  supabase: SupabaseClient;
  raceDate: string;
  nowMs: number;
  track: WorkerResearchTrack;
  race: WorkerResearchRace;
}): Promise<{
  eligible: boolean;
  evaluationCreated: boolean;
  betCreated: boolean;
  dataComplete: boolean;
}> {
  const {
    supabase,
    raceDate,
    nowMs,
    track,
    race,
  } = args;

  if (
    !race.startTime ||
    !isGallopT1ShadowRace({
      date: raceDate,
      countryCode:
        track.countryCode,
      sport:
        race.sport,
    })
  ) {
    return {
      eligible: false,
      evaluationCreated: false,
      betCreated: false,
      dataComplete: false,
    };
  }

  const plannedStartTimeMs =
    Date.parse(
      race.startTime,
    );

  const plannedLockTimeMs =
    plannedStartTimeMs -
    GALLOP_T1_LOCK_TARGET_SECONDS *
      1_000;

  if (
    !Number.isFinite(
      plannedStartTimeMs,
    ) ||
    nowMs <
      plannedLockTimeMs ||
    nowMs >
      plannedStartTimeMs +
        90_000
  ) {
    return {
      eligible: false,
      evaluationCreated: false,
      betCreated: false,
      dataComplete: false,
    };
  }

  const {
    data:
      existingRows,
    error:
      existingError,
  } =
    await supabase
      .from(
        "win_place_race_evaluations",
      )
      .select(
        "race_id",
      )
      .eq(
        "race_id",
        race.id,
      )
      .eq(
        "rule_version",
        GALLOP_T1_SHADOW_RULE_VERSION,
      )
      .eq(
        "signal_phase",
        "LIVE",
      )
      .limit(1);

  if (existingError) {
    throw new Error(
      `Could not check T1 shadow evaluation ${race.id}: ${existingError.message}`,
    );
  }

  if (
    existingRows &&
    existingRows.length > 0
  ) {
    return {
      eligible: true,
      evaluationCreated: false,
      betCreated: false,
      dataComplete: true,
    };
  }

  const {
    data:
      rawRows,
    error:
      rawError,
  } =
    await supabase
      .from(
        "place_live_odds_points",
      )
      .select(
        "runner_number,odds_decimal,point_ts",
      )
      .eq(
        "race_id",
        race.id,
      )
      .eq(
        "market",
        "WIN",
      )
      .gte(
        "point_ts",
        new Date(
          plannedStartTimeMs -
            60 * 60_000,
        ).toISOString(),
      )
      .lte(
        "point_ts",
        new Date(
          plannedLockTimeMs,
        ).toISOString(),
      )
      .order(
        "point_ts",
        {
          ascending: true,
        },
      );

  if (rawError) {
    throw new Error(
      `Could not load T1 shadow odds ${race.id}: ${rawError.message}`,
    );
  }

  const points =
    (
      (
        rawRows ??
        []
      ) as DbOddsRow[]
    )
      .map(
        (row) => ({
          runnerNumber:
            Number(
              row.runner_number,
            ),

          odds:
            Number(
              row.odds_decimal,
            ),

          timestampMs:
            Date.parse(
              row.point_ts,
            ),
        }),
      )
      .filter(
        (point) =>
          Number.isInteger(
            point.runnerNumber,
          ) &&
          Number.isFinite(
            point.odds,
          ) &&
          Number.isFinite(
            point.timestampMs,
          ),
      );

  const evaluation =
    evaluateGallopT1Shadow({
      runners:
        race.runners.map(
          (runner) => ({
            number:
              runner.number,
            name:
              runner.name,
            scratched:
              runner.scratched,
          }),
        ),

      points,
      plannedStartTimeMs,
    });

  /*
   * Ofullständig T1-data registreras inte som
   * ett NO_PLAY. Workern får försöka igen inom
   * efterfönstret.
   */
  if (
    !evaluation.dataComplete ||
    !evaluation.candidate
  ) {
    return {
      eligible: true,
      evaluationCreated: false,
      betCreated: false,
      dataComplete: false,
    };
  }

  const candidate =
    evaluation.candidate;

  const candidateRunner =
    race.runners.find(
      (runner) =>
        runner.number ===
        candidate.runnerNumber,
    );

  if (!candidateRunner) {
    throw new Error(
      `T1 shadow candidate missing in race ${race.id}`,
    );
  }

  const nowIso =
    new Date(
      nowMs,
    ).toISOString();

  const configSnapshot = {
    ruleVersion:
      GALLOP_T1_SHADOW_RULE_VERSION,

    strategyCode:
      GALLOP_T1_SHADOW_STRATEGY_CODE,

    strategyLabel:
      "T1 Sverige 25–40 skuggmodell",

    prospectiveStartDate:
      GALLOP_T1_SHADOW_START_DATE,

    countryCode:
      "SE",

    sport:
      "GALLOP",

    selection:
      "S1",

    lockTargetSecondsBeforeRace:
      GALLOP_T1_LOCK_TARGET_SECONDS,

    previewTargetSecondsBeforeRace:
      GALLOP_T1_PREVIEW_TARGET_SECONDS,

    collectionWindowMinutes:
      60,

    minDropPercentInclusive:
      GALLOP_T1_MIN_DROP_PERCENT,

    maxDropPercentExclusive:
      GALLOP_T1_MAX_DROP_PERCENT,

    market:
      "WIN",

    defaultWinStakeSEK:
      GALLOP_T1_STAKE_SEK,

    shadowModel:
      true,
  };

  const candidateJson = {
    runnerNumber:
      candidate.runnerNumber,

    horseName:
      candidate.horseName,

    startOdds:
      candidate.startOdds,

    t2Odds:
      candidate.t2Odds,

    t1Odds:
      candidate.t1Odds,

    totalDropAtT2Percent:
      candidate
        .totalDropAtT2Percent,

    totalDropAtT1Percent:
      candidate
        .totalDropAtT1Percent,

    lastMinuteDropPercent:
      candidate
        .lastMinuteDropPercent,

    totalDropAtT2Rank:
      candidate
        .totalDropAtT2Rank,

    totalDropAtT1Rank:
      candidate
        .totalDropAtT1Rank,

    lastMinuteDropRank:
      candidate
        .lastMinuteDropRank,

    validOddsPoints:
      candidate
        .validOddsPoints,

    lockPointMs:
      candidate
        .lockPointMs,

    leaderChangedLastMinute:
      evaluation
        .leaderChangedLastMinute,
  };

  const {
    error:
      evaluationError,
  } =
    await supabase
      .from(
        "win_place_race_evaluations",
      )
      .upsert(
        {
          race_id:
            race.id,

          rule_version:
            GALLOP_T1_SHADOW_RULE_VERSION,

          strategy_code:
            GALLOP_T1_SHADOW_STRATEGY_CODE,

          decision:
            evaluation.qualifies
              ? "PLAY"
              : "NO_PLAY",

          reasons:
            evaluation.qualifies
              ? []
              : [
                  candidate
                    .totalDropAtT1Percent <
                    GALLOP_T1_MIN_DROP_PERCENT
                    ? "Sänkning under 25 % vid T1"
                    : "Sänkning 40 % eller högre vid T1",
                ],

          race_json: {
            date:
              raceDate,
            countryCode:
              track.countryCode,
            trackId:
              track.id,
            trackName:
              track.name,
            raceNumber:
              race.raceNumber,
            plannedStartTime:
              race.startTime,
            sport:
              race.sport,
          },

          planned_lock_time_ms:
            plannedLockTimeMs,

          actual_lock_time_ms:
            plannedLockTimeMs,

          locked_at:
            nowIso,

          seconds_before_start:
            GALLOP_T1_LOCK_TARGET_SECONDS,

          config_snapshot:
            configSnapshot,

          checks_json: [
            {
              key:
                "SWEDEN_ONLY",
              passed:
                true,
            },
            {
              key:
                "GALLOP_ONLY",
              passed:
                true,
            },
            {
              key:
                "COMPLETE_T1_DATA",
              passed:
                evaluation
                  .dataComplete,
            },
            {
              key:
                "DROP_MIN_25",
              passed:
                candidate
                  .totalDropAtT1Percent >=
                  GALLOP_T1_MIN_DROP_PERCENT,
            },
            {
              key:
                "DROP_UNDER_40",
              passed:
                candidate
                  .totalDropAtT1Percent <
                  GALLOP_T1_MAX_DROP_PERCENT,
            },
          ],

          candidate_json:
            candidateJson,

          most_shortened_json:
            candidateJson,

          snapshot_json: {
            t2LeaderRunnerNumber:
              evaluation
                .t2LeaderRunnerNumber,

            t1LeaderRunnerNumber:
              candidate
                .runnerNumber,

            leaderChangedLastMinute:
              evaluation
                .leaderChangedLastMinute,

            runners:
              evaluation.runners,
          },

          signal_phase:
            "LIVE",

          created_at:
            nowIso,

          updated_at:
            nowIso,
        },
        {
          onConflict:
            "race_id,rule_version,signal_phase",
        },
      );

  if (evaluationError) {
    throw new Error(
      `Could not persist T1 shadow evaluation ${race.id}: ${evaluationError.message}`,
    );
  }

  if (!evaluation.qualifies) {
    return {
      eligible: true,
      evaluationCreated: true,
      betCreated: false,
      dataComplete: true,
    };
  }

  const historyValues =
    points
      .filter(
        (point) =>
          point.runnerNumber ===
            candidate
              .runnerNumber &&
          point.timestampMs <=
            candidate
              .lockPointMs,
      )
      .sort(
        (a, b) =>
          a.timestampMs -
          b.timestampMs,
      )
      .map(
        (point) =>
          point.odds,
      );

  const cv =
    coefficientOfVariation(
      historyValues,
    );

  const betRow = {
    bet_id: [
      race.id,
      GALLOP_T1_SHADOW_RULE_VERSION,
      "WIN",
      "LIVE",
      candidate
        .runnerNumber,
    ].join(":"),

    race_id:
      race.id,

    rule_version:
      GALLOP_T1_SHADOW_RULE_VERSION,

    market:
      "WIN",

    signal_phase:
      "LIVE",

    config_snapshot:
      configSnapshot,

    date:
      raceDate,

    track_id:
      track.id,

    track_name:
      track.name,

    race_number:
      race.raceNumber,

    planned_start_time:
      race.startTime,

    lock_time:
      new Date(
        plannedLockTimeMs,
      ).toISOString(),

    seconds_before_start:
      GALLOP_T1_LOCK_TARGET_SECONDS,

    horse_number:
      candidate
        .runnerNumber,

    horse_name:
      candidate
        .horseName,

    horse_id:
      candidateRunner
        .horseId,

    start_lane:
      candidateRunner
        .startLane,

    start_method:
      race.startMethod,

    distance_meters:
      race.distanceMeters,

    starters:
      race.runners.filter(
        (runner) =>
          !runner.scratched,
      ).length,

    start_odds:
      candidate
        .startOdds,

    locked_win_odds:
      candidate
        .t1Odds,

    odds_drop_percent:
      candidate
        .totalDropAtT1Percent,

    cv_raw:
      cv,

    cv_display:
      cv,

    strength:
      0,

    indicators_green:
      [],

    valid_odds_points:
      candidate
        .validOddsPoints,

    stake_oren:
      GALLOP_T1_STAKE_SEK *
      100,

    result_outcome:
      "PENDING",

    result_status:
      "PENDING",

    finish_position_official:
      null,

    official_win_odds_decimal:
      null,

    place_odds_decimal:
      null,

    return_oren:
      null,

    net_oren:
      null,

    roi_pct:
      null,

    automatic_model_bet:
      true,

    user_actually_played:
      false,

    result_source:
      null,

    result_updated_at:
      null,

    created_at:
      nowIso,

    updated_at:
      nowIso,
  };

  const {
    error:
      betError,
  } =
    await supabase
      .from(
        "win_place_model_bets",
      )
      .upsert(
        [betRow],
        {
          onConflict:
            "race_id,rule_version,market,signal_phase,horse_number",
        },
      );

  if (betError) {
    throw new Error(
      `Could not persist T1 shadow bet ${race.id}: ${betError.message}`,
    );
  }

  return {
    eligible: true,
    evaluationCreated: true,
    betCreated: true,
    dataComplete: true,
  };
}
