import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESEARCH_METRICS_VERSION,
  RESEARCH_SAMPLING_VERSION,
  RESEARCH_STORAGE_SCHEMA_VERSION,
} from "../../src/researchStorage/config";
import {
  computeNormalizedMarketShares,
  computeResearchRunnerMetrics,
  rankResearchRunnerMetrics,
} from "../../src/researchStorage/metrics";
import {
  combineResearchOddsObservations,
  compactResearchOddsHistory,
  isValidResearchOdds,
} from "../../src/researchStorage/sampling";
import type {
  ResearchRawOddsObservation,
  ResearchRunnerOddsMetrics,
} from "../../src/researchStorage/types";
import {
  inferResearchMeetingTimeCategory,
  parseResearchProducts,
  type ParsedResearchProduct,
  type ParsedResearchStartMethod,
} from "./researchRaceParser";

export const RESEARCH_ARCHIVE_VERSION =
  "RESEARCH_ARCHIVE_V1.0";

export const RESEARCH_PARSER_VERSION =
  "RESEARCH_PARSER_V1.0";

export type ResearchArchiveRunnerStats = {
  earningsPerStart: number | null;
  winPercent: number | null;
  driverWinPercent: number | null;
  startPoints: number | null;
  gallopPercent: number | null;
};

export type ResearchArchiveRunnerInput = {
  number: number;

  horseId: number | null;
  name: string;

  horseAge: number | null;
  horseSex: string | null;

  startLane: number | null;
  startDistanceMeters: number | null;

  driverId: number | null;
  driverName: string | null;

  trainerId: number | null;
  trainerName: string | null;

  scratched: boolean;

  currentWinOddsDecimal: number | null;
  currentPlaceOddsDecimal: number | null;

  stats: ResearchArchiveRunnerStats;

  rawRunnerJson: Record<string, unknown>;
};

export type ResearchArchiveRaceInput = {
  sourceRaceId: string;
  raceDate: string;

  eventId: string | null;
  meetingId: string | null;
  meetingName: string | null;

  countryCode: "SE" | "NO" | "DK" | "FR";
  currencyCode: "SEK" | "NOK" | "DKK" | "EUR";

  trackId: number;
  trackName: string;
  raceNumber: number;

  raceName: string | null;

  plannedStartTime: string;
  actualStartTime: string | null;

  raceStatus: string | null;

  startMethod: ParsedResearchStartMethod;
  distanceMeters: number | null;
  isMonte: boolean;

  scheduledStarters: number | null;

  raceClassCode: string | null;
  raceCategory: string | null;

  earningsMin: number | null;
  earningsMax: number | null;

  ageMin: number | null;
  ageMax: number | null;

  firstAdditionalDistanceMeters: number | null;

  prizeMoneyTotal: number | null;
  firstPrize: number | null;

  products: ParsedResearchProduct[];

  runners: ResearchArchiveRunnerInput[];

  rawRaceJson: Record<string, unknown>;
};

export type ResearchArchiveOddsRow = {
  runnerNumber: number;

  horseId: number | null;
  horseName: string;

  market: "WIN" | "PLACE";
  oddsDecimal: number | null;

  pointTimestampMs: number;

  scratched: boolean;
  source: string;
};

export type ResearchArchiveRows = {
  raceKey: string;
  snapshotKey: string;

  raceRow: Record<string, unknown>;
  productRows: Array<Record<string, unknown>>;
  snapshotRow: Record<string, unknown>;
  runnerSnapshotRows: Array<Record<string, unknown>>;
  indicatorRows: Array<Record<string, unknown>>;
  oddsPointRows: Array<Record<string, unknown>>;
  metricRows: Array<Record<string, unknown>>;

  snapshotComplete: boolean;
};

type IndicatorCode =
  | "KR"
  | "ST"
  | "K"
  | "SP"
  | "G"
  | "ODD";

type IndicatorDefinition = {
  code: IndicatorCode;
  direction: "HIGH" | "LOW";
  getValue: (
    runner: ResearchArchiveRunnerInput,
    metric: ResearchRunnerOddsMetrics | null,
  ) => number | null;
};

const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  {
    code: "KR",
    direction: "HIGH",
    getValue: (runner) =>
      runner.stats.earningsPerStart,
  },
  {
    code: "ST",
    direction: "HIGH",
    getValue: (runner) =>
      runner.stats.winPercent,
  },
  {
    code: "K",
    direction: "HIGH",
    getValue: (runner) =>
      runner.stats.driverWinPercent,
  },
  {
    code: "SP",
    direction: "HIGH",
    getValue: (runner) =>
      runner.stats.startPoints,
  },
  {
    code: "G",
    direction: "LOW",
    getValue: (runner) =>
      runner.stats.gallopPercent,
  },
  {
    code: "ODD",
    direction: "HIGH",
    getValue: (_runner, metric) =>
      metric?.oddsDropToLockPercent ?? null,
  },
];

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function safeJsonRecord(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return value ?? {};
}

export function buildResearchRaceKey(args: {
  raceDate: string;
  trackId: number;
  raceNumber: number;
  sourceRaceId: string;
}): string {
  return [
    "ATG",
    args.raceDate,
    args.trackId,
    args.raceNumber,
    args.sourceRaceId,
  ].join(":");
}

function buildSnapshotKey(
  raceKey: string,
  captureType: string,
): string {
  return `${raceKey}:LIVE:${captureType}`;
}

function buildRunnerSnapshotKey(
  snapshotKey: string,
  runnerNumber: number,
): string {
  return `${snapshotKey}:RUNNER:${runnerNumber}`;
}

function buildProductKey(
  raceKey: string,
  product: ParsedResearchProduct,
): string {
  return [
    raceKey,
    "PRODUCT",
    product.productCode,
    product.productId ?? "NO_ID",
    product.legNumber ?? "NO_LEG",
  ].join(":");
}

function buildOddsPointKey(args: {
  raceKey: string;
  runnerNumber: number;
  captureType: string;
}): string {
  return [
    args.raceKey,
    "LIVE",
    "RUNNER",
    args.runnerNumber,
    args.captureType,
  ].join(":");
}

function buildMetricKey(args: {
  raceKey: string;
  runnerNumber: number;
}): string {
  return [
    args.raceKey,
    "LIVE",
    "RUNNER",
    args.runnerNumber,
    RESEARCH_METRICS_VERSION,
  ].join(":");
}

function uniqueProducts(
  products: ParsedResearchProduct[],
): ParsedResearchProduct[] {
  const byKey = new Map<
    string,
    ParsedResearchProduct
  >();

  for (const product of products) {
    const key = [
      product.productCode,
      product.productId ?? "",
      product.legNumber ?? "",
    ].join(":");

    if (!byKey.has(key)) {
      byKey.set(key, product);
    }
  }

  return [...byKey.values()];
}

function buildIndicators(args: {
  raceKey: string;
  snapshotKey: string;
  runners: ResearchArchiveRunnerInput[];
  metrics: ResearchRunnerOddsMetrics[];
}) {
  const {
    raceKey,
    snapshotKey,
    runners,
    metrics,
  } = args;

  const metricByRunner = new Map(
    metrics.map((metric) => [
      metric.runnerNumber,
      metric,
    ]),
  );

  const rows: Array<Record<string, unknown>> = [];

  const strengthByRunner = new Map<number, number>();

  for (const definition of INDICATOR_DEFINITIONS) {
    const ranked = runners
      .filter((runner) => !runner.scratched)
      .map((runner) => {
        const value = definition.getValue(
          runner,
          metricByRunner.get(runner.number) ?? null,
        );

        return {
          runnerNumber: runner.number,
          value,
        };
      })
      .filter(
        (
          item,
        ): item is {
          runnerNumber: number;
          value: number;
        } =>
          item.value !== null &&
          Number.isFinite(item.value),
      )
      .sort((a, b) => {
        if (a.value !== b.value) {
          return definition.direction === "LOW"
            ? a.value - b.value
            : b.value - a.value;
        }

        return a.runnerNumber - b.runnerNumber;
      });

    const rankByRunner = new Map(
      ranked.map((item, index) => [
        item.runnerNumber,
        index + 1,
      ]),
    );

    for (const runner of runners) {
      const runnerSnapshotKey =
        buildRunnerSnapshotKey(
          snapshotKey,
          runner.number,
        );

      const metric =
        metricByRunner.get(runner.number) ?? null;

      const rawValue = definition.getValue(
        runner,
        metric,
      );

      const rank =
        rankByRunner.get(runner.number) ?? null;

      const isTopFour =
        rank !== null &&
        rank >= 1 &&
        rank <= 4 &&
        !runner.scratched;

      if (isTopFour) {
        strengthByRunner.set(
          runner.number,
          (strengthByRunner.get(runner.number) ??
            0) + 1,
        );
      }

      rows.push({
        indicator_key: [
          runnerSnapshotKey,
          definition.code,
        ].join(":"),

        runner_snapshot_key: runnerSnapshotKey,
        race_key: raceKey,
        runner_number: runner.number,

        indicator_code: definition.code,

        raw_value: rawValue,
        rank_in_race: rank,

        is_top_four: isTopFour,

        ranking_direction:
          definition.direction,

        source:
          definition.code === "ODD"
            ? "KOMBEN_RESEARCH_METRICS"
            : "ATG",

        source_updated_at: null,

        data_quality_status:
          rawValue === null
            ? "PARTIAL"
            : "COMPLETE",
      });
    }
  }

  return {
    rows,
    strengthByRunner,
  };
}

function latestCombinedPointAtOrBefore(args: {
  combined: ReturnType<
    typeof combineResearchOddsObservations
  >;
  runnerNumber: number;
  timestampMs: number;
}) {
  return (
    args.combined
      .filter(
        (point) =>
          point.runnerNumber === args.runnerNumber &&
          point.timestampMs <= args.timestampMs,
      )
      .sort(
        (a, b) =>
          b.timestampMs - a.timestampMs,
      )[0] ?? null
  );
}

function mapShareByRunner(
  values: Array<{
    runnerNumber: number;
    oddsDecimal: number | null;
  }>,
) {
  return new Map(
    computeNormalizedMarketShares(values).map(
      (share) => [
        share.runnerNumber,
        share.normalizedMarketShare,
      ],
    ),
  );
}

function mapRankedMetrics(
  args: {
    race: ResearchArchiveRaceInput;
    odds: ResearchArchiveOddsRow[];
    plannedStartTimeMs: number;
    actualLockTimeMs: number;
  },
): ResearchRunnerOddsMetrics[] {
  const winHistoryByRunner = new Map<
    number,
    Array<{
      odds: number;
      timestamp: number;
    }>
  >();

  for (const row of args.odds) {
    if (
      row.market !== "WIN" ||
      row.pointTimestampMs >
        args.actualLockTimeMs ||
      !isValidResearchOdds(row.oddsDecimal)
    ) {
      continue;
    }

    const history =
      winHistoryByRunner.get(row.runnerNumber) ??
      [];

    history.push({
      odds: row.oddsDecimal,
      timestamp: row.pointTimestampMs,
    });

    winHistoryByRunner.set(
      row.runnerNumber,
      history,
    );
  }

  const metrics = args.race.runners.map(
    (runner) =>
      computeResearchRunnerMetrics({
        runner: {
          runnerNumber: runner.number,
          horseId: runner.horseId,
          horseName: runner.name,
          scratched: runner.scratched,
          oddsHistory:
            winHistoryByRunner.get(
              runner.number,
            ) ?? [],
        },
        plannedStartTimeMs:
          args.plannedStartTimeMs,
        actualLockTimeMs:
          args.actualLockTimeMs,
      }),
  );

  return rankResearchRunnerMetrics(metrics);
}

export function buildResearchLockArchiveRows(
  args: {
    race: ResearchArchiveRaceInput;
    odds: ResearchArchiveOddsRow[];
    actualLockTimeMs: number;
    targetLockSecondsBeforeStart?: number;
    fetchedAtMs?: number;
  },
): ResearchArchiveRows {
  const {
    race,
    actualLockTimeMs,
    targetLockSecondsBeforeStart = 90,
    fetchedAtMs = actualLockTimeMs,
  } = args;

  const plannedStartTimeMs = Date.parse(
    race.plannedStartTime,
  );

  if (!Number.isFinite(plannedStartTimeMs)) {
    throw new Error(
      `Ogiltig planerad starttid för ${race.sourceRaceId}`,
    );
  }

  if (
    !Number.isFinite(actualLockTimeMs) ||
    actualLockTimeMs >= plannedStartTimeMs
  ) {
    throw new Error(
      `Ogiltig låstid för ${race.sourceRaceId}`,
    );
  }

  const raceKey = buildResearchRaceKey({
    raceDate: race.raceDate,
    trackId: race.trackId,
    raceNumber: race.raceNumber,
    sourceRaceId: race.sourceRaceId,
  });

  const snapshotKey = buildSnapshotKey(
    raceKey,
    "LOCK",
  );

  const observations: ResearchRawOddsObservation[] =
    args.odds.map((row) => ({
      runnerNumber: row.runnerNumber,
      horseId: row.horseId,
      horseName: row.horseName,
      market: row.market,
      oddsDecimal: row.oddsDecimal,
      timestampMs: row.pointTimestampMs,
      scratched: row.scratched,
      source: row.source,
    }));

  const combined =
    combineResearchOddsObservations({
      observations,
    });

  const rankedMetrics = mapRankedMetrics({
    race,
    odds: args.odds,
    plannedStartTimeMs,
    actualLockTimeMs,
  });

  const metricByRunner = new Map(
    rankedMetrics.map((metric) => [
      metric.runnerNumber,
      metric,
    ]),
  );

  const startShareByRunner = mapShareByRunner(
    rankedMetrics.map((metric) => ({
      runnerNumber: metric.runnerNumber,
      oddsDecimal: metric.startOdds,
    })),
  );

  const lockShareByRunner = mapShareByRunner(
    rankedMetrics.map((metric) => ({
      runnerNumber: metric.runnerNumber,
      oddsDecimal: metric.lockOdds,
    })),
  );

  const actualSecondsBeforeStart =
    (plannedStartTimeMs - actualLockTimeMs) /
    1_000;

  const allCompacted =
    compactResearchOddsHistory({
      observations: observations.filter(
        (observation) =>
          observation.timestampMs <=
          actualLockTimeMs,
      ),
      plannedStartTimeMs,
      actualLockTimeMs,
    });

  const compacted = allCompacted.filter(
    (point) => {
      if (
        point.captureType === "FINAL" ||
        point.captureType === "RESULT" ||
        point.captureType === "EVENT"
      ) {
        return false;
      }

      if (point.captureType === "LOCK") {
        return true;
      }

      return (
        point.targetSecondsBeforeStart !==
          null &&
        point.targetSecondsBeforeStart >=
          actualSecondsBeforeStart
      );
    },
  );

  const indicatorBuild = buildIndicators({
    raceKey,
    snapshotKey,
    runners: race.runners,
    metrics: rankedMetrics,
  });

  const activeRunners = race.runners.filter(
    (runner) => !runner.scratched,
  );

  const oddsComplete =
    activeRunners.length > 0 &&
    activeRunners.every(
      (runner) =>
        (metricByRunner.get(runner.number)
          ?.validOddsPoints ?? 0) >= 5,
    );

  const indicatorsComplete =
    activeRunners.every((runner) =>
      [
        runner.stats.earningsPerStart,
        runner.stats.winPercent,
        runner.stats.driverWinPercent,
        runner.stats.startPoints,
        runner.stats.gallopPercent,
        metricByRunner.get(runner.number)
          ?.oddsDropToLockPercent ?? null,
      ].every(
        (value) =>
          value !== null &&
          Number.isFinite(value),
      ),
    );

  const snapshotComplete =
    oddsComplete && indicatorsComplete;

  const inferredMeeting =
    inferResearchMeetingTimeCategory({
      plannedStartTime:
        race.plannedStartTime,
      rawMeetingOrRace:
        race.rawRaceJson,
    });

  const products = uniqueProducts([
    ...race.products,
    ...parseResearchProducts(
      race.rawRaceJson,
    ),
  ]);

  const latestOddsTimestampMs =
    observations
      .filter(
        (observation) =>
          observation.timestampMs <=
          actualLockTimeMs,
      )
      .reduce<number | null>(
        (latest, observation) =>
          latest === null
            ? observation.timestampMs
            : Math.max(
                latest,
                observation.timestampMs,
              ),
        null,
      );

  const runnerSnapshotRows =
    race.runners.map((runner) => {
      const runnerSnapshotKey =
        buildRunnerSnapshotKey(
          snapshotKey,
          runner.number,
        );

      const metric =
        metricByRunner.get(runner.number) ??
        null;

      const latest =
        latestCombinedPointAtOrBefore({
          combined,
          runnerNumber: runner.number,
          timestampMs: actualLockTimeMs,
        });

      const strength =
        indicatorBuild.strengthByRunner.get(
          runner.number,
        ) ?? 0;

      const missingFields: string[] = [];

      if (runner.startLane === null) {
        missingFields.push("startLane");
      }

      if (runner.startDistanceMeters === null) {
        missingFields.push(
          "startDistanceMeters",
        );
      }

      if (metric?.startOdds === null) {
        missingFields.push("startOdds");
      }

      if (metric?.lockOdds === null) {
        missingFields.push("lockOdds");
      }

      const distanceHandicapMeters =
        runner.startDistanceMeters !== null &&
        race.distanceMeters !== null
          ? Math.max(
              0,
              runner.startDistanceMeters -
                race.distanceMeters,
            )
          : null;

      return {
        runner_snapshot_key:
          runnerSnapshotKey,

        snapshot_key: snapshotKey,
        race_key: raceKey,

        runner_number: runner.number,

        horse_id: runner.horseId,
        horse_name: runner.name,

        horse_age: runner.horseAge,
        horse_sex: runner.horseSex,

        start_lane: runner.startLane,
        start_distance_meters:
          runner.startDistanceMeters,

        distance_handicap_meters:
          distanceHandicapMeters,

        driver_id: runner.driverId,
        driver_name: runner.driverName,

        trainer_id: runner.trainerId,
        trainer_name: runner.trainerName,

        scratched: runner.scratched,
        scratched_at: null,
        scratch_reason: null,

        runner_status: runner.scratched
          ? "SCRATCHED"
          : "ACTIVE",

        current_win_odds:
          latest?.winOddsDecimal ??
          metric?.lockOdds ??
          runner.currentWinOddsDecimal,

        current_place_odds:
          latest?.placeOddsDecimal ??
          runner.currentPlaceOddsDecimal,

        start_win_odds:
          metric?.startOdds ?? null,

        odds_drop_percent:
          metric?.oddsDropToLockPercent ??
          null,

        implied_probability_raw:
          metric?.impliedProbabilityLock ??
          null,

        normalized_market_share:
          lockShareByRunner.get(
            runner.number,
          ) ?? null,

        strength_total: strength,

        odds_drop_rank:
          metric?.oddsDropRank ?? null,

        smoothness_rank:
          metric?.smoothnessRank ?? null,

        market_rank:
          metric?.lockMarketRank ?? null,

        is_most_shortened:
          metric?.isMostShortened ?? false,

        is_second_most_shortened:
          metric?.oddsDropRank === 2,

        is_smoothest:
          metric?.isSmoothest ?? false,

        is_second_smoothest:
          metric?.smoothnessRank === 2,

        is_favorite:
          metric?.isFavoriteAtLock ?? false,

        indicator_data_complete:
          [
            runner.stats.earningsPerStart,
            runner.stats.winPercent,
            runner.stats.driverWinPercent,
            runner.stats.startPoints,
            runner.stats.gallopPercent,
            metric?.oddsDropToLockPercent ??
              null,
          ].every(
            (value) =>
              value !== null &&
              Number.isFinite(value),
          ),

        odds_data_complete:
          (metric?.validOddsPoints ?? 0) >= 5,

        missing_fields: missingFields,
        invalid_fields: [],

        raw_runner_json:
          safeJsonRecord(
            runner.rawRunnerJson,
          ),
      };
    });

  const metricRows = rankedMetrics.map(
    (metric) => ({
      metric_key: buildMetricKey({
        raceKey,
        runnerNumber: metric.runnerNumber,
      }),

      race_key: raceKey,
      signal_phase: "LIVE",

      runner_number: metric.runnerNumber,

      horse_id: metric.horseId,
      horse_name: metric.horseName,

      metrics_version:
        RESEARCH_METRICS_VERSION,

      calculated_at: iso(fetchedAtMs),

      valid_odds_points:
        metric.validOddsPoints,

      start_odds: metric.startOdds,
      lock_odds: metric.lockOdds,
      final_odds: null,

      start_odds_timestamp:
        metric.startOddsTimestampMs === null
          ? null
          : iso(
              metric.startOddsTimestampMs,
            ),

      lock_odds_timestamp:
        metric.lockOddsTimestampMs === null
          ? null
          : iso(
              metric.lockOddsTimestampMs,
            ),

      final_odds_timestamp: null,

      odds_drop_to_lock_percent:
        metric.oddsDropToLockPercent,

      odds_drop_to_final_percent: null,

      odds_drop_last_10_minutes_percent:
        null,

      odds_drop_last_5_minutes_percent:
        null,

      odds_drop_last_2_minutes_percent:
        null,

      minimum_odds: metric.minimumOdds,
      maximum_odds: metric.maximumOdds,
      mean_odds: metric.meanOdds,

      cv_percent: metric.cvPercent,

      cv_last_10_minutes_percent:
        metric.cvLast10MinutesPercent,

      odds_drops_count:
        metric.oddsDropsCount,

      odds_rises_count:
        metric.oddsRisesCount,

      odds_unchanged_count:
        metric.oddsUnchangedCount,

      largest_single_drop_percent:
        metric.largestSingleDropPercent,

      largest_single_rise_percent:
        metric.largestSingleRisePercent,

      largest_rebound_percent:
        metric.largestReboundPercent,

      trend_slope_odds_per_minute:
        metric.trendSlopeOddsPerMinute,

      implied_probability_start:
        metric.impliedProbabilityStart,

      implied_probability_lock:
        metric.impliedProbabilityLock,

      implied_probability_final: null,

      normalized_market_share_start:
        startShareByRunner.get(
          metric.runnerNumber,
        ) ?? null,

      normalized_market_share_lock:
        lockShareByRunner.get(
          metric.runnerNumber,
        ) ?? null,

      normalized_market_share_final: null,

      odds_drop_rank:
        metric.oddsDropRank,

      smoothness_rank:
        metric.smoothnessRank,

      lock_market_rank:
        metric.lockMarketRank,

      is_most_shortened:
        metric.isMostShortened,

      is_smoothest:
        metric.isSmoothest,

      is_favorite_at_lock:
        metric.isFavoriteAtLock,

      top_odds_drop_gap_to_second:
        metric.topOddsDropGapToSecond,

      top_smoothness_gap_to_second:
        metric.topSmoothnessGapToSecond,

      data_quality_status:
        metric.validOddsPoints >= 5
          ? "COMPLETE"
          : "PARTIAL",
    }),
  );

  const oddsPointRows = compacted.map(
    (point) => ({
      odds_point_key:
        buildOddsPointKey({
          raceKey,
          runnerNumber:
            point.runnerNumber,
          captureType:
            point.captureType,
        }),

      race_key: raceKey,
      signal_phase: "LIVE",

      runner_number:
        point.runnerNumber,

      horse_id: point.horseId,
      horse_name: point.horseName,

      capture_type:
        point.captureType,

      target_seconds_before_start:
        point.targetSecondsBeforeStart,

      actual_seconds_before_start:
        point.secondsBeforeStart,

      point_timestamp:
        iso(point.pointTimestampMs),

      target_timestamp:
        point.targetSecondsBeforeStart ===
        null
          ? null
          : iso(
              plannedStartTimeMs -
                point.targetSecondsBeforeStart *
                  1_000,
            ),

      source_timestamp_delta_seconds:
        point.sourceTimestampDeltaSeconds,

      win_odds_decimal:
        point.winOddsDecimal,

      place_odds_decimal:
        point.placeOddsDecimal,

      odds_valid:
        point.winOddsDecimal !== null ||
        point.placeOddsDecimal !== null,

      invalid_reason: null,

      scratched_at_point:
        point.scratched,

      source: point.source,

      fetched_at: iso(fetchedAtMs),

      sampling_version:
        RESEARCH_SAMPLING_VERSION,
    }),
  );

  const productRows = products.map(
    (product) => ({
      product_key: buildProductKey(
        raceKey,
        product,
      ),

      race_key: raceKey,

      product_code:
        product.productCode,

      product_id: product.productId,

      leg_number: product.legNumber,

      total_legs: product.totalLegs,

      product_start_time: null,

      is_main_product: false,

      turnover_minor_units: null,

      country_code: race.countryCode,
      currency_code:
        race.currencyCode,

      source: "ATG",

      raw_product_json:
        product.rawProductJson,
    }),
  );

  const raceRow = {
    race_key: raceKey,

    source_race_id:
      race.sourceRaceId,

    race_date: race.raceDate,

    event_id: race.eventId,
    meeting_id: race.meetingId,
    meeting_name: race.meetingName,

    country_code: race.countryCode,
    currency_code: race.currencyCode,

    track_id: race.trackId,
    track_name: race.trackName,
    race_number: race.raceNumber,

    race_name: race.raceName,

    planned_start_time:
      race.plannedStartTime,

    actual_start_time:
      race.actualStartTime,

    race_status: race.raceStatus,

    start_method:
      race.startMethod,

    distance_meters:
      race.distanceMeters,

    is_monte: race.isMonte,

    scheduled_starters:
      race.scheduledStarters,

    actual_starters:
      activeRunners.length,

    race_class_code:
      race.raceClassCode,

    race_category:
      race.raceCategory,

    earnings_min:
      race.earningsMin,

    earnings_max:
      race.earningsMax,

    age_min: race.ageMin,
    age_max: race.ageMax,

    sex_condition: null,

    first_additional_distance_meters:
      race.firstAdditionalDistanceMeters,

    prize_money_total:
      race.prizeMoneyTotal,

    first_prize:
      race.firstPrize,

    meeting_time_category:
      inferredMeeting.category,

    meeting_time_category_method:
      inferredMeeting.method,

    archive_status: "COLLECTING",

    expected_runner_count:
      race.runners.length,

    archived_runner_count:
      runnerSnapshotRows.length,

    archived_result_count: 0,

    archived_odds_point_count:
      oddsPointRows.length,

    missing_fields: [
      ...(race.distanceMeters === null
        ? ["distanceMeters"]
        : []),

      ...(race.startMethod === "UNKNOWN"
        ? ["startMethod"]
        : []),
    ],

    invalid_fields: [],

    collector_version:
      RESEARCH_ARCHIVE_VERSION,

    parser_version:
      RESEARCH_PARSER_VERSION,

    source_provider: "ATG",

    last_seen_at:
      iso(fetchedAtMs),

    updated_at:
      iso(fetchedAtMs),
  };

  const snapshotRow = {
    snapshot_key: snapshotKey,

    race_key: raceKey,

    signal_phase: "LIVE",

    capture_type: "LOCK",

    target_snapshot_time: iso(
      plannedStartTimeMs -
        targetLockSecondsBeforeStart *
          1_000,
    ),

    actual_snapshot_time:
      iso(actualLockTimeMs),

    target_seconds_before_start:
      targetLockSecondsBeforeStart,

    actual_seconds_before_start:
      actualSecondsBeforeStart,

    latest_odds_timestamp:
      latestOddsTimestampMs === null
        ? null
        : iso(latestOddsTimestampMs),

    data_fetched_at:
      iso(fetchedAtMs),

    data_quality_status:
      snapshotComplete
        ? "COMPLETE"
        : "PARTIAL",

    snapshot_complete:
      snapshotComplete,

    expected_runner_count:
      race.runners.length,

    archived_runner_count:
      runnerSnapshotRows.length,

    missing_fields: [
      ...(!oddsComplete
        ? ["oddsHistory"]
        : []),

      ...(!indicatorsComplete
        ? ["indicatorData"]
        : []),
    ],

    invalid_fields: [],
    stale_fields: [],
    source_errors: [],

    collector_version:
      RESEARCH_ARCHIVE_VERSION,

    parser_version:
      RESEARCH_PARSER_VERSION,

    sampling_version:
      RESEARCH_SAMPLING_VERSION,

    raw_race_json:
      safeJsonRecord(
        race.rawRaceJson,
      ),

    updated_at:
      iso(fetchedAtMs),
  };

  return {
    raceKey,
    snapshotKey,

    raceRow,
    productRows,
    snapshotRow,
    runnerSnapshotRows,
    indicatorRows:
      indicatorBuild.rows,
    oddsPointRows,
    metricRows,

    snapshotComplete,
  };
}

async function upsertRows(args: {
  supabase: SupabaseClient;
  table: string;
  rows:
    | Record<string, unknown>
    | Array<Record<string, unknown>>;
}) {
  const isArray = Array.isArray(args.rows);

  if (isArray && args.rows.length === 0) {
    return;
  }

  const { error } = await args.supabase
    .from(args.table)
    .upsert(args.rows);

  if (error) {
    throw new Error(
      `Kunde inte skriva ${args.table}: ${error.message}`,
    );
  }
}

export async function persistResearchLockArchive(
  args: {
    supabase: SupabaseClient;
    rows: ResearchArchiveRows;
  },
) {
  await upsertRows({
    supabase: args.supabase,
    table: "research_races",
    rows: args.rows.raceRow,
  });

  await upsertRows({
    supabase: args.supabase,
    table: "research_race_products",
    rows: args.rows.productRows,
  });

  await upsertRows({
    supabase: args.supabase,
    table: "research_race_snapshots",
    rows: args.rows.snapshotRow,
  });

  await upsertRows({
    supabase: args.supabase,
    table: "research_runner_snapshots",
    rows: args.rows.runnerSnapshotRows,
  });

  await upsertRows({
    supabase: args.supabase,
    table: "research_runner_indicators",
    rows: args.rows.indicatorRows,
  });

  await upsertRows({
    supabase: args.supabase,
    table: "research_odds_points",
    rows: args.rows.oddsPointRows,
  });

  await upsertRows({
    supabase: args.supabase,
    table: "research_runner_metrics",
    rows: args.rows.metricRows,
  });

  return {
    raceKey: args.rows.raceKey,
    snapshotKey:
      args.rows.snapshotKey,

    runners:
      args.rows.runnerSnapshotRows.length,

    indicators:
      args.rows.indicatorRows.length,

    permanentOddsPoints:
      args.rows.oddsPointRows.length,

    metrics:
      args.rows.metricRows.length,

    products:
      args.rows.productRows.length,

    snapshotComplete:
      args.rows.snapshotComplete,
  };
}

export const researchStorageVersions = {
  schema: RESEARCH_STORAGE_SCHEMA_VERSION,
  archive: RESEARCH_ARCHIVE_VERSION,
  parser: RESEARCH_PARSER_VERSION,
  sampling: RESEARCH_SAMPLING_VERSION,
  metrics: RESEARCH_METRICS_VERSION,
} as const;
