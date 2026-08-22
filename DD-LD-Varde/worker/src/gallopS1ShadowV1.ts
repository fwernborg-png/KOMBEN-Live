import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  settleWinPlaceBet,
} from "./winPlaceSettlement";

export const GALLOP_S1_SHADOW_RULE_VERSION =
  "GALLOP_S1_10_ODDS_5_12_5_V1.0";

export const GALLOP_S1_SHADOW_STRATEGY_CODE =
  "GALLOP_S1_10_ODDS_5_12_5";

export const GALLOP_S1_SHADOW_LABEL =
  "S1 10% · odds 5,00–12,50";

export const GALLOP_S1_SHADOW_PROSPECTIVE_LOCK_START_ISO =
  "2026-08-22T10:00:00.000Z";

export const GALLOP_S1_SHADOW_LOCK_TARGET_SECONDS =
  90;

export const GALLOP_S1_SHADOW_MIN_DROP_PERCENT =
  10;

export const GALLOP_S1_SHADOW_MIN_LOCK_ODDS =
  5;

export const GALLOP_S1_SHADOW_MAX_LOCK_ODDS =
  12.5;

export const GALLOP_S1_SHADOW_STAKE_SEK =
  100;

export const GALLOP_S1_SHADOW_ALLOWED_COUNTRIES =
  [
    "SE",
    "DK",
    "NO",
    "ZA",
  ] as const;

const LOOKBACK_MS =
  7 * 24 * 60 * 60 * 1_000;

type ShadowEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type GallopS1ShadowMetric = {
  runnerNumber: number;
  horseId: number | null;
  horseName: string;
  scratched: boolean;
  startOdds: number;
  lockOdds: number;
  dropPercent: number;
  validOddsPoints: number;
  cvPercent: number | null;
};

export type GallopS1ShadowDecision =
  | {
      decision: "PLAY";
      reason: null;
      candidate: GallopS1ShadowMetric;
    }
  | {
      decision:
        | "NO_PLAY"
        | "EXCLUDED"
        | "INSUFFICIENT_DATA";
      reason: string;
      candidate: GallopS1ShadowMetric | null;
    };

type ResearchLockRow = {
  snapshot_key: string;
  race_key: string;
  actual_snapshot_time: string;
  actual_seconds_before_start:
    | number
    | string;
};

type ResearchRaceRow = {
  race_key: string;
  source_race_id: string;
  race_date: string;
  country_code: string;
  track_id: number;
  track_name: string;
  race_number: number;
  planned_start_time: string | null;
  sport_type: string | null;
  start_method: string | null;
  distance_meters: number | null;
  actual_starters: number | null;
  scheduled_starters: number | null;
  expected_runner_count: number | null;
  is_monte: boolean;
};

type ResearchLockRunnerRow = {
  race_key: string;
  runner_number: number;
  scratched: boolean;
};

type ResearchMetricRow = {
  race_key: string;
  runner_number: number;
  horse_id: number | null;
  horse_name: string;
  calculated_at: string;
  valid_odds_points: number;
  start_odds: number | string | null;
  lock_odds: number | string | null;
  odds_drop_to_lock_percent:
    | number
    | string
    | null;
  cv_percent:
    | number
    | string
    | null;
};

type ExistingEvaluationRow = {
  race_id: string;
};

type PendingShadowBetRow = {
  id: string;
  race_id: string;
  horse_number: number;
  stake_oren: number;
  result_outcome:
    | "PENDING"
    | "HIT"
    | "MISS"
    | "VOID";
  result_status:
    | "PENDING"
    | "RESULT_READY"
    | "SAKNAR_ODDS"
    | "VOID";
};

type ResultRaceRow = {
  race_key: string;
  source_race_id: string;
};

type ResearchResultRow = {
  race_key: string;
  runner_number: number;
  started: boolean | null;
  scratched_after_lock: boolean | null;
  finish_position_official:
    | number
    | null;
  winner_official: boolean | null;
  disqualified: boolean | null;
  did_not_finish: boolean | null;
  official_win_odds_decimal:
    | number
    | string
    | null;
  result_status: string | null;
  result_source: string | null;
};

export type GallopS1ShadowCycleSummary = {
  locksSeen: number;
  racesEligible: number;
  evaluationsCreated: number;
  betsCreated: number;
  betsSettled: number;
  betsVoided: number;
};

function numberValue(
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
    value.trim()
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function normalizeCountry(
  value: string,
) {
  return value
    .trim()
    .toUpperCase();
}

function isAllowedCountry(
  value: string,
) {
  const country =
    normalizeCountry(value);

  return (
    GALLOP_S1_SHADOW_ALLOWED_COUNTRIES
      .some(
        (allowed) =>
          allowed === country,
      )
  );
}

function validMetric(
  metric: GallopS1ShadowMetric,
) {
  return (
    metric.scratched !== true &&
    Number.isFinite(
      metric.startOdds,
    ) &&
    metric.startOdds > 0 &&
    Number.isFinite(
      metric.lockOdds,
    ) &&
    metric.lockOdds > 0 &&
    Number.isFinite(
      metric.dropPercent,
    ) &&
    metric.validOddsPoints >= 2
  );
}

export function selectGallopS1ShadowCandidate(
  metrics: GallopS1ShadowMetric[],
): GallopS1ShadowMetric | null {
  return (
    metrics
      .filter(validMetric)
      .sort(
        (a, b) =>
          b.dropPercent -
            a.dropPercent ||
          a.lockOdds -
            b.lockOdds ||
          a.runnerNumber -
            b.runnerNumber,
      )[0] ?? null
  );
}

export function evaluateGallopS1ShadowV1(
  args: {
    countryCode: string;
    sport: string | null;
    isMonte?: boolean;
    lockTimestampIso: string;
    metrics:
      GallopS1ShadowMetric[];
  },
): GallopS1ShadowDecision {
  const lockMs =
    Date.parse(
      args.lockTimestampIso,
    );

  const prospectiveStartMs =
    Date.parse(
      GALLOP_S1_SHADOW_PROSPECTIVE_LOCK_START_ISO,
    );

  if (
    !Number.isFinite(lockMs) ||
    lockMs < prospectiveStartMs
  ) {
    return {
      decision: "EXCLUDED",
      reason:
        "Före prospektiv start",
      candidate: null,
    };
  }

  if (
    !isAllowedCountry(
      args.countryCode,
    )
  ) {
    return {
      decision: "EXCLUDED",
      reason:
        "Land utanför tillåten galopp",
      candidate: null,
    };
  }

  if (
    args.sport
      ?.trim()
      .toUpperCase() !==
    "GALLOP"
  ) {
    return {
      decision: "EXCLUDED",
      reason:
        "Inte galopp",
      candidate: null,
    };
  }

  if (args.isMonte === true) {
    return {
      decision: "EXCLUDED",
      reason:
        "Monté",
      candidate: null,
    };
  }

  const candidate =
    selectGallopS1ShadowCandidate(
      args.metrics,
    );

  if (!candidate) {
    return {
      decision:
        "INSUFFICIENT_DATA",
      reason:
        "S1 kunde inte beräknas",
      candidate: null,
    };
  }

  if (
    candidate.dropPercent <
    GALLOP_S1_SHADOW_MIN_DROP_PERCENT
  ) {
    return {
      decision: "NO_PLAY",
      reason:
        "S1 sänkt mindre än 10 %",
      candidate,
    };
  }

  if (
    candidate.lockOdds <
    GALLOP_S1_SHADOW_MIN_LOCK_ODDS
  ) {
    return {
      decision: "NO_PLAY",
      reason:
        "S1 T90-odds under 5,00",
      candidate,
    };
  }

  if (
    candidate.lockOdds >
    GALLOP_S1_SHADOW_MAX_LOCK_ODDS
  ) {
    return {
      decision: "NO_PLAY",
      reason:
        "S1 T90-odds över 12,50",
      candidate,
    };
  }

  return {
    decision: "PLAY",
    reason: null,
    candidate,
  };
}

function createSupabase(
  env: ShadowEnv,
) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Missing Supabase credentials",
    );
  }

  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

function metricFromRow(
  row: ResearchMetricRow,
  scratched: boolean,
): GallopS1ShadowMetric | null {
  const startOdds =
    numberValue(
      row.start_odds,
    );

  const lockOdds =
    numberValue(
      row.lock_odds,
    );

  const dropPercent =
    numberValue(
      row
        .odds_drop_to_lock_percent,
    );

  if (
    startOdds === null ||
    lockOdds === null ||
    dropPercent === null
  ) {
    return null;
  }

  return {
    runnerNumber:
      row.runner_number,

    horseId:
      row.horse_id,

    horseName:
      row.horse_name,

    scratched,

    startOdds,
    lockOdds,
    dropPercent,

    validOddsPoints:
      Number(
        row.valid_odds_points ??
        0,
      ),

    cvPercent:
      numberValue(
        row.cv_percent,
      ),
  };
}

function emptySummary():
  GallopS1ShadowCycleSummary {
  return {
    locksSeen: 0,
    racesEligible: 0,
    evaluationsCreated: 0,
    betsCreated: 0,
    betsSettled: 0,
    betsVoided: 0,
  };
}

async function evaluateNewLocks(
  supabase: SupabaseClient,
  nowMs: number,
  summary:
    GallopS1ShadowCycleSummary,
) {
  const prospectiveStartMs =
    Date.parse(
      GALLOP_S1_SHADOW_PROSPECTIVE_LOCK_START_ISO,
    );

  const lookbackStartMs =
    Math.max(
      prospectiveStartMs,
      nowMs - LOOKBACK_MS,
    );

  const {
    data: lockData,
    error: lockError,
  } = await supabase
    .from(
      "research_race_snapshots",
    )
    .select(
      [
        "snapshot_key",
        "race_key",
        "actual_snapshot_time",
        "actual_seconds_before_start",
      ].join(","),
    )
    .eq(
      "signal_phase",
      "LIVE",
    )
    .eq(
      "capture_type",
      "LOCK",
    )
    .eq(
      "snapshot_complete",
      true,
    )
    .gte(
      "actual_seconds_before_start",
      89,
    )
    .lte(
      "actual_seconds_before_start",
      91,
    )
    .gte(
      "actual_snapshot_time",
      new Date(
        lookbackStartMs,
      ).toISOString(),
    )
    .order(
      "actual_snapshot_time",
      {
        ascending: false,
      },
    )
    .limit(500);

  if (lockError) {
    throw new Error(
      `Could not load T90 research locks: ${lockError.message}`,
    );
  }

  const lockRows =
    (lockData ?? []) as
      ResearchLockRow[];

  summary.locksSeen +=
    lockRows.length;

  if (!lockRows.length) {
    return;
  }

  const latestLockByRace =
    new Map<
      string,
      ResearchLockRow
    >();

  for (const row of lockRows) {
    if (
      !latestLockByRace.has(
        row.race_key,
      )
    ) {
      latestLockByRace.set(
        row.race_key,
        row,
      );
    }
  }

  const raceKeys = [
    ...latestLockByRace.keys(),
  ];

  const {
    data: raceData,
    error: raceError,
  } = await supabase
    .from("research_races")
    .select(
      [
        "race_key",
        "source_race_id",
        "race_date",
        "country_code",
        "track_id",
        "track_name",
        "race_number",
        "planned_start_time",
        "sport_type",
        "start_method",
        "distance_meters",
        "actual_starters",
        "scheduled_starters",
        "expected_runner_count",
        "is_monte",
      ].join(","),
    )
    .in(
      "race_key",
      raceKeys,
    )
    .eq(
      "sport_type",
      "GALLOP",
    )
    .eq(
      "is_monte",
      false,
    )
    .in(
      "country_code",
      [
        ...GALLOP_S1_SHADOW_ALLOWED_COUNTRIES,
      ],
    );

  if (raceError) {
    throw new Error(
      `Could not load gallop shadow races: ${raceError.message}`,
    );
  }

  const races =
    (
      raceData ?? []
    ) as ResearchRaceRow[];

  if (!races.length) {
    return;
  }

  summary.racesEligible +=
    races.length;

  const sourceRaceIds =
    races.map(
      (race) =>
        race.source_race_id,
    );

  const {
    data: evaluationData,
    error: evaluationError,
  } = await supabase
    .from(
      "win_place_race_evaluations",
    )
    .select("race_id")
    .eq(
      "rule_version",
      GALLOP_S1_SHADOW_RULE_VERSION,
    )
    .eq(
      "signal_phase",
      "LIVE",
    )
    .in(
      "race_id",
      sourceRaceIds,
    );

  if (evaluationError) {
    throw new Error(
      `Could not load existing gallop shadow evaluations: ${evaluationError.message}`,
    );
  }

  const alreadyEvaluated =
    new Set(
      (
        (
          evaluationData ?? []
        ) as
          ExistingEvaluationRow[]
      ).map(
        (row) =>
          row.race_id,
      ),
    );

  const pendingRaces =
    races.filter(
      (race) =>
        !alreadyEvaluated.has(
          race.source_race_id,
        ),
    );

  if (!pendingRaces.length) {
    return;
  }

  const pendingRaceKeys =
    pendingRaces.map(
      (race) =>
        race.race_key,
    );

  const {
    data: lockRunnerData,
    error: lockRunnerError,
  } = await supabase
    .from(
      "research_runner_snapshots",
    )
    .select(
      "race_key,runner_number,scratched",
    )
    .in(
      "race_key",
      pendingRaceKeys,
    )
    .like(
      "snapshot_key",
      "%:LIVE:LOCK",
    );

  if (lockRunnerError) {
    throw new Error(
      `Could not load gallop S1 LOCK runners: ${lockRunnerError.message}`,
    );
  }

  const scratchedByRunner =
    new Map(
      (
        (
          lockRunnerData ?? []
        ) as ResearchLockRunnerRow[]
      ).map(
        (row) => [
          `${row.race_key}:${row.runner_number}`,
          row.scratched === true,
        ],
      ),
    );

  const {
    data: metricData,
    error: metricError,
  } = await supabase
    .from(
      "research_runner_metrics",
    )
    .select(
      [
        "race_key",
        "runner_number",
        "horse_id",
        "horse_name",
        "calculated_at",
        "valid_odds_points",
        "start_odds",
        "lock_odds",
        "odds_drop_to_lock_percent",
        "cv_percent",
      ].join(","),
    )
    .eq(
      "signal_phase",
      "LIVE",
    )
    .in(
      "race_key",
      pendingRaceKeys,
    )
    .order(
      "calculated_at",
      {
        ascending: false,
      },
    );

  if (metricError) {
    throw new Error(
      `Could not load gallop shadow metrics: ${metricError.message}`,
    );
  }

  const latestMetricByRunner =
    new Map<
      string,
      ResearchMetricRow
    >();

  for (
    const row of
    (
      metricData ?? []
    ) as ResearchMetricRow[]
  ) {
    const key =
      `${row.race_key}:${row.runner_number}`;

    if (
      !latestMetricByRunner.has(
        key,
      )
    ) {
      latestMetricByRunner.set(
        key,
        row,
      );
    }
  }

  for (
    const race of
    pendingRaces
  ) {
    const lock =
      latestLockByRace.get(
        race.race_key,
      );

    if (
      !lock ||
      !race.planned_start_time
    ) {
      continue;
    }

    const metrics = [
      ...latestMetricByRunner
        .values(),
    ]
      .filter(
        (row) =>
          row.race_key ===
          race.race_key,
      )
      .map(
        (row) =>
          metricFromRow(
            row,
            scratchedByRunner.get(
              `${row.race_key}:${row.runner_number}`,
            ) === true,
          ),
      )
      .filter(
        (
          metric,
        ): metric is
          GallopS1ShadowMetric =>
          metric !== null,
      );

    /*
     * Om den kompletta LOCK-snapshoten
     * precis har skrivits men metriken ännu
     * inte är läsbar väntar vi till nästa cron.
     * Vi fryser alltså aldrig ett falskt
     * INSUFFICIENT_DATA-beslut.
     */
    if (!metrics.length) {
      continue;
    }

    const decision =
      evaluateGallopS1ShadowV1(
        {
          countryCode:
            race.country_code,

          sport:
            race.sport_type,

          isMonte:
            race.is_monte,

          lockTimestampIso:
            lock
              .actual_snapshot_time,

          metrics,
        },
      );

    if (
      decision.decision ===
      "EXCLUDED"
    ) {
      continue;
    }

    const candidate =
      decision.candidate;

    if (!candidate) {
      continue;
    }

    const nowIso =
      new Date(
        nowMs,
      ).toISOString();

    const plannedStartMs =
      Date.parse(
        race
          .planned_start_time,
      );

    if (
      !Number.isFinite(
        plannedStartMs,
      )
    ) {
      continue;
    }

    const plannedLockMs =
      plannedStartMs -
      GALLOP_S1_SHADOW_LOCK_TARGET_SECONDS *
        1_000;

    const actualLockMs =
      Date.parse(
        lock
          .actual_snapshot_time,
      );

    if (
      !Number.isFinite(
        actualLockMs,
      )
    ) {
      continue;
    }

    const actualSecondsBeforeStart =
      numberValue(
        lock
          .actual_seconds_before_start,
      ) ??
      GALLOP_S1_SHADOW_LOCK_TARGET_SECONDS;

    const starters =
      race.actual_starters ??
      race.scheduled_starters ??
      race.expected_runner_count ??
      0;

    const configSnapshot = {
      ruleVersion:
        GALLOP_S1_SHADOW_RULE_VERSION,

      strategyCode:
        GALLOP_S1_SHADOW_STRATEGY_CODE,

      strategyLabel:
        GALLOP_S1_SHADOW_LABEL,

      shadowMode: true,

      prospectiveLockStart:
        GALLOP_S1_SHADOW_PROSPECTIVE_LOCK_START_ISO,

      allowedCountries:
        [
          ...GALLOP_S1_SHADOW_ALLOWED_COUNTRIES,
        ],

      sport:
        "GALLOP",

      selection:
        "S1",

      lockTargetSecondsBeforeRace:
        GALLOP_S1_SHADOW_LOCK_TARGET_SECONDS,

      minDropPercentInclusive:
        GALLOP_S1_SHADOW_MIN_DROP_PERCENT,

      minLockOddsInclusive:
        GALLOP_S1_SHADOW_MIN_LOCK_ODDS,

      maxLockOddsInclusive:
        GALLOP_S1_SHADOW_MAX_LOCK_ODDS,

      market:
        "WIN",

      defaultWinStakeSEK:
        GALLOP_S1_SHADOW_STAKE_SEK,

      pushEnabled: false,

      prospectiveTargetBets:
        100,
    };

    const candidateJson = {
      runnerNumber:
        candidate.runnerNumber,

      horseId:
        candidate.horseId,

      horseName:
        candidate.horseName,

      startOdds:
        candidate.startOdds,

      lockOdds:
        candidate.lockOdds,

      dropPercent:
        candidate.dropPercent,

      validOddsPoints:
        candidate.validOddsPoints,

      cvPercent:
        candidate.cvPercent,
    };

    /*
     * PLAY-raden skrivs före evaluationen.
     * Om bet-upsert av någon anledning faller
     * får nästa cron försöka igen i stället
     * för att evaluationen låser loppet.
     */
    if (
      decision.decision ===
      "PLAY"
    ) {
      const {
        error: betError,
      } = await supabase
        .from(
          "win_place_model_bets",
        )
        .upsert(
          {
            bet_id: [
              race.source_race_id,
              GALLOP_S1_SHADOW_RULE_VERSION,
              "WIN",
              "LIVE",
              candidate.runnerNumber,
            ].join(":"),

            race_id:
              race.source_race_id,

            rule_version:
              GALLOP_S1_SHADOW_RULE_VERSION,

            market:
              "WIN",

            signal_phase:
              "LIVE",

            config_snapshot:
              configSnapshot,

            date:
              race.race_date,

            track_id:
              race.track_id,

            track_name:
              race.track_name,

            race_number:
              race.race_number,

            planned_start_time:
              race.planned_start_time,

            lock_time:
              lock
                .actual_snapshot_time,

            seconds_before_start:
              actualSecondsBeforeStart,

            horse_number:
              candidate.runnerNumber,

            horse_name:
              candidate.horseName,

            horse_id:
              candidate.horseId,

            start_lane:
              null,

            start_method:
              race.start_method,

            distance_meters:
              race.distance_meters,

            starters,

            start_odds:
              candidate.startOdds,

            locked_win_odds:
              candidate.lockOdds,

            odds_drop_percent:
              candidate.dropPercent,

            cv_raw:
              candidate.cvPercent,

            cv_display:
              candidate.cvPercent,

            strength:
              0,

            indicators_green:
              [],

            valid_odds_points:
              candidate
                .validOddsPoints,

            stake_oren:
              GALLOP_S1_SHADOW_STAKE_SEK *
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
          },
          {
            onConflict:
              "race_id,rule_version,market,signal_phase,horse_number",
          },
        );

      if (betError) {
        throw new Error(
          `Could not persist gallop S1 shadow bet ${race.source_race_id}: ${betError.message}`,
        );
      }

      summary.betsCreated +=
        1;
    }

    const reasons =
      decision.reason
        ? [decision.reason]
        : [];

    const {
      error:
        persistEvaluationError,
    } = await supabase
      .from(
        "win_place_race_evaluations",
      )
      .upsert(
        {
          race_id:
            race.source_race_id,

          rule_version:
            GALLOP_S1_SHADOW_RULE_VERSION,

          strategy_code:
            GALLOP_S1_SHADOW_STRATEGY_CODE,

          decision:
            decision.decision,

          reasons,

          race_json: {
            raceId:
              race.source_race_id,

            researchRaceKey:
              race.race_key,

            date:
              race.race_date,

            countryCode:
              race.country_code,

            sport:
              race.sport_type,

            trackId:
              race.track_id,

            trackName:
              race.track_name,

            raceNumber:
              race.race_number,

            plannedStartTime:
              race
                .planned_start_time,

            startMethod:
              race.start_method,

            distanceMeters:
              race.distance_meters,

            starters,
          },

          planned_lock_time_ms:
            plannedLockMs,

          actual_lock_time_ms:
            actualLockMs,

          locked_at:
            lock
              .actual_snapshot_time,

          seconds_before_start:
            actualSecondsBeforeStart,

          config_snapshot:
            configSnapshot,

          checks_json: [
            {
              key:
                "ALLOWED_COUNTRY",
              passed:
                isAllowedCountry(
                  race.country_code,
                ),
            },
            {
              key:
                "GALLOP_ONLY",
              passed:
                race.sport_type ===
                "GALLOP",
            },
            {
              key:
                "EXACT_T90_COMPLETE",
              passed: true,
            },
            {
              key:
                "S1_DROP_MIN_10",
              passed:
                candidate.dropPercent >=
                GALLOP_S1_SHADOW_MIN_DROP_PERCENT,
            },
            {
              key:
                "LOCK_ODDS_MIN_5",
              passed:
                candidate.lockOdds >=
                GALLOP_S1_SHADOW_MIN_LOCK_ODDS,
            },
            {
              key:
                "LOCK_ODDS_MAX_12_5",
              passed:
                candidate.lockOdds <=
                GALLOP_S1_SHADOW_MAX_LOCK_ODDS,
            },
          ],

          candidate_json:
            candidateJson,

          most_shortened_json:
            candidateJson,

          snapshot_json: {
            canonicalSnapshotKey:
              lock.snapshot_key,

            canonicalActualSecondsBeforeStart:
              actualSecondsBeforeStart,

            dataSource:
              "RESEARCH_EXACT_T90",

            candidate:
              candidateJson,
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

    if (
      persistEvaluationError
    ) {
      throw new Error(
        `Could not persist gallop S1 shadow evaluation ${race.source_race_id}: ${persistEvaluationError.message}`,
      );
    }

    summary
      .evaluationsCreated +=
      1;
  }
}

async function settleShadowBets(
  supabase: SupabaseClient,
  nowMs: number,
  summary:
    GallopS1ShadowCycleSummary,
) {
  const {
    data: betData,
    error: betError,
  } = await supabase
    .from(
      "win_place_model_bets",
    )
    .select(
      [
        "id",
        "race_id",
        "horse_number",
        "stake_oren",
        "result_outcome",
        "result_status",
      ].join(","),
    )
    .eq(
      "rule_version",
      GALLOP_S1_SHADOW_RULE_VERSION,
    )
    .eq(
      "signal_phase",
      "LIVE",
    )
    .or(
      "result_outcome.eq.PENDING,and(result_outcome.eq.HIT,result_status.eq.SAKNAR_ODDS)",
    )
    .limit(250);

  if (betError) {
    throw new Error(
      `Could not load pending gallop S1 shadow bets: ${betError.message}`,
    );
  }

  const bets =
    (
      betData ?? []
    ) as PendingShadowBetRow[];

  if (!bets.length) {
    return;
  }

  const sourceRaceIds = [
    ...new Set(
      bets.map(
        (bet) =>
          bet.race_id,
      ),
    ),
  ];

  const {
    data: raceData,
    error: raceError,
  } = await supabase
    .from("research_races")
    .select(
      "race_key,source_race_id",
    )
    .in(
      "source_race_id",
      sourceRaceIds,
    );

  if (raceError) {
    throw new Error(
      `Could not load result races for gallop S1 shadow: ${raceError.message}`,
    );
  }

  const resultRaces =
    (
      raceData ?? []
    ) as ResultRaceRow[];

  if (!resultRaces.length) {
    return;
  }

  const raceKeyBySource =
    new Map(
      resultRaces.map(
        (race) => [
          race.source_race_id,
          race.race_key,
        ],
      ),
    );

  const raceKeys =
    resultRaces.map(
      (race) =>
        race.race_key,
    );

  const {
    data: resultData,
    error: resultError,
  } = await supabase
    .from(
      "research_runner_results",
    )
    .select(
      [
        "race_key",
        "runner_number",
        "started",
        "scratched_after_lock",
        "finish_position_official",
        "winner_official",
        "disqualified",
        "did_not_finish",
        "official_win_odds_decimal",
        "result_status",
        "result_source",
      ].join(","),
    )
    .in(
      "race_key",
      raceKeys,
    );

  if (resultError) {
    throw new Error(
      `Could not load gallop S1 shadow results: ${resultError.message}`,
    );
  }

  const results =
    (
      resultData ?? []
    ) as ResearchResultRow[];

  const resultByKey =
    new Map(
      results.map(
        (result) => [
          `${result.race_key}:${result.runner_number}`,
          result,
        ],
      ),
    );

  const nowIso =
    new Date(
      nowMs,
    ).toISOString();

  for (const bet of bets) {
    const raceKey =
      raceKeyBySource.get(
        bet.race_id,
      );

    if (!raceKey) {
      continue;
    }

    const result =
      resultByKey.get(
        `${raceKey}:${bet.horse_number}`,
      );

    if (!result) {
      continue;
    }

    let finishPosition =
      result
        .finish_position_official;

    /*
     * DNF/diskvalificerad häst är en
     * avgjord WIN-förlust även om officiell
     * numerisk placering saknas.
     */
    if (
      finishPosition === null &&
      result.started === true &&
      (
        result.did_not_finish ===
          true ||
        result.disqualified ===
          true
      )
    ) {
      finishPosition = 999;
    }

    const settled =
      settleWinPlaceBet({
        market:
          "WIN",

        stakeOren:
          bet.stake_oren,

        raceCancelled:
          result.result_status ===
          "VOID",

        horseScratched:
          result.started ===
            false ||
          result
            .scratched_after_lock ===
            true,

        finishPosition,

        officialWinOddsDecimal:
          numberValue(
            result
              .official_win_odds_decimal,
          ),

        placeOddsDecimal:
          null,

        placeHitMaxOfficialFinishPosition:
          3,
      });

    if (
      settled.resultOutcome ===
      "PENDING"
    ) {
      continue;
    }

    const {
      error: updateError,
    } = await supabase
      .from(
        "win_place_model_bets",
      )
      .update({
        result_outcome:
          settled.resultOutcome,

        result_status:
          settled.resultStatus,

        finish_position_official:
          settled
            .finishPositionOfficial,

        official_win_odds_decimal:
          settled
            .officialWinOddsDecimal,

        place_odds_decimal:
          null,

        return_oren:
          settled.returnOren,

        net_oren:
          settled.netOren,

        roi_pct:
          settled.roiPct,

        result_source:
          result.result_source ??
          "ATG_RESEARCH",

        result_updated_at:
          nowIso,

        updated_at:
          nowIso,
      })
      .eq(
        "id",
        bet.id,
      )
      .or(
        "result_outcome.eq.PENDING,and(result_outcome.eq.HIT,result_status.eq.SAKNAR_ODDS)",
      );

    if (updateError) {
      throw new Error(
        `Could not settle gallop S1 shadow bet ${bet.id}: ${updateError.message}`,
      );
    }

    if (
      settled.resultOutcome ===
      "VOID"
    ) {
      summary.betsVoided +=
        1;
    } else {
      summary.betsSettled +=
        1;
    }
  }
}

export async function runGallopS1ShadowCycle(
  env: ShadowEnv,
  nowMs = Date.now(),
): Promise<
  GallopS1ShadowCycleSummary
> {
  const summary =
    emptySummary();

  const supabase =
    createSupabase(env);

  /*
   * Settlement först:
   * gamla pending-rader kan då avslutas
   * oberoende av om dagens LOCK-data finns.
   */
  await settleShadowBets(
    supabase,
    nowMs,
    summary,
  );

  await evaluateNewLocks(
    supabase,
    nowMs,
    summary,
  );

  return summary;
}
