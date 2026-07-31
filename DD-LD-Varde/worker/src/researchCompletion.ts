import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESEARCH_SAMPLING_VERSION,
} from "../../src/researchStorage/config";

export type ResearchCompletionRunner = {
  number: number;
  horseId: number | null;
  name: string;

  oddsRaw: number | null;
  placeOddsRaw: number | null;
  scratched: boolean;

  horseAge: number | null;
  horseSex: string | null;

  startLane: number | null;
  startDistanceMeters: number | null;

  driverId: number | null;
  driverName: string | null;

  trainerId: number | null;
  trainerName: string | null;

  rawRunnerJson: Record<string, unknown>;
};

export type ResearchCompletionRace = {
  raceNumber: number;
  id: string;

  startTime?: string;
  status?: string;

  runners: ResearchCompletionRunner[];
  finishOrder: number[];

  rawRaceJson: Record<string, unknown>;
};

export type ResearchCompletionRaceItem = {
  track: {
    id: number;
    name: string;
  };

  race: ResearchCompletionRace;
};

export type ResearchCompletionSummary = {
  enabled: boolean;

  racesChecked: number;
  racesCompleted: number;

  resultRowsArchived: number;
  eventRowsProcessed: number;
  finalOddsPointsArchived: number;
  resultSnapshotsArchived: number;

  failedRaces: number;
  errors: string[];
};

type ResearchRaceRow = {
  race_key: string;
  source_race_id: string;

  race_date: string;

  track_id: number;
  track_name: string;
  race_number: number;

  planned_start_time: string | null;
  race_status: string | null;

  scheduled_starters: number | null;
  expected_runner_count: number | null;

  archived_result_count: number | null;
  archived_odds_point_count: number | null;

  archive_status: string;
};

type ResearchRunnerSnapshotRow =
  Record<string, unknown> & {
    runner_snapshot_key: string;
    snapshot_key: string;
    race_key: string;

    runner_number: number;

    horse_id: number | null;
    horse_name: string;

    start_lane: number | null;

    driver_id: number | null;
    driver_name: string | null;

    scratched: boolean;

    current_win_odds: number | string | null;
    current_place_odds: number | string | null;

    start_win_odds: number | string | null;
  };

type ResearchRaceSnapshotRow =
  Record<string, unknown> & {
    snapshot_key: string;
    race_key: string;
  };

type ResearchMetricRow =
  Record<string, unknown> & {
    metric_key: string;
    race_key: string;
    runner_number: number;
    start_odds: number | string | null;
  };

type ResearchOddsPointRow =
  Record<string, unknown> & {
    odds_point_key: string;
    race_key: string;
    runner_number: number;
    capture_type: string;
    win_odds_decimal: number | string | null;
  };

const LARGE_ODDS_MOVE_PERCENT = 20;

function emptySummary(
  enabled: boolean,
): ResearchCompletionSummary {
  return {
    enabled,

    racesChecked: 0,
    racesCompleted: 0,

    resultRowsArchived: 0,
    eventRowsProcessed: 0,
    finalOddsPointsArchived: 0,
    resultSnapshotsArchived: 0,

    failedRaces: 0,
    errors: [],
  };
}

function appendError(
  summary: ResearchCompletionSummary,
  message: string,
) {
  if (summary.errors.length < 10) {
    summary.errors.push(message);
  }
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function toNumber(
  value: unknown,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
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

function rawOddsToDecimal(
  value: number | null,
): number | null {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.round(value) === 9_999
  ) {
    return null;
  }

  return value / 100;
}

function normalizeText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function collectStrings(
  value: unknown,
  depth = 0,
): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(
      (item) => collectStrings(
        item,
        depth + 1,
      ),
    );
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.values(record).flatMap(
    (item) => collectStrings(
      item,
      depth + 1,
    ),
  );
}

function normalizeKey(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/g, "");
}

function findBooleanDeep(
  value: unknown,
  wantedKeys: string[],
  depth = 0,
): boolean | null {
  if (depth > 5) {
    return null;
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const wanted = new Set(
    wantedKeys.map(normalizeKey),
  );

  for (const [key, item] of Object.entries(record)) {
    if (
      wanted.has(normalizeKey(key)) &&
      typeof item === "boolean"
    ) {
      return item;
    }
  }

  for (const item of Object.values(record)) {
    const nested = findBooleanDeep(
      item,
      wantedKeys,
      depth + 1,
    );

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function parseFinishPosition(
  rawRunnerJson: Record<string, unknown>,
): number | null {
  const result = asRecord(
    rawRunnerJson.result,
  );

  const values = [
    rawRunnerJson.finishPosition,
    rawRunnerJson.position,
    rawRunnerJson.place,
    rawRunnerJson.rank,

    result?.finishPosition,
    result?.position,
    result?.place,
    result?.rank,
  ];

  for (const value of values) {
    const parsed = toNumber(value);

    if (
      parsed !== null &&
      parsed > 0
    ) {
      return Math.round(parsed);
    }
  }

  return null;
}

function parseOutcomeFlags(
  rawRunnerJson: Record<string, unknown>,
) {
  const statusText = collectStrings(
    rawRunnerJson,
  )
    .join(" ")
    .toLowerCase();

  const explicitGallop = findBooleanDeep(
    rawRunnerJson,
    [
      "galloped",
      "gallop",
      "galopp",
      "hasGalloped",
    ],
  );

  const explicitDisqualified =
    findBooleanDeep(
      rawRunnerJson,
      [
        "disqualified",
        "diskvalificerad",
        "diskad",
      ],
    );

  const explicitDidNotFinish =
    findBooleanDeep(
      rawRunnerJson,
      [
        "didNotFinish",
        "dnf",
        "aborted",
      ],
    );

  const galloped =
    explicitGallop ??
    (
      /\b(gallop|galopp)\b/.test(
        statusText,
      )
        ? true
        : null
    );

  const disqualified =
    explicitDisqualified ??
    (
      /(disqual|diskval|diskad)/.test(
        statusText,
      )
        ? true
        : false
    );

  const didNotFinish =
    explicitDidNotFinish ??
    (
      /(did not finish|\bdnf\b|brutit|utgick)/.test(
        statusText,
      )
        ? true
        : false
    );

  return {
    galloped,
    disqualified,
    didNotFinish,
  };
}

function isRaceCancelled(
  status: string | undefined | null,
): boolean {
  return /(inställd|installt|installd|cancel|abandon|void)/i.test(
    status ?? "",
  );
}

function hasResult(
  race: ResearchCompletionRace,
): boolean {
  if (isRaceCancelled(race.status)) {
    return true;
  }

  if (race.finishOrder.length > 0) {
    return true;
  }

  return race.runners.some(
    (runner) =>
      parseFinishPosition(
        runner.rawRunnerJson,
      ) !== null,
  );
}

function paidPlaceCount(
  actualStarters: number,
): number | null {
  if (actualStarters >= 7) {
    return 3;
  }

  if (actualStarters >= 5) {
    return 2;
  }

  return null;
}

function percentDrop(
  startOdds: number | null,
  endOdds: number | null,
): number | null {
  if (
    startOdds === null ||
    endOdds === null ||
    startOdds <= 0
  ) {
    return null;
  }

  return (
    (
      startOdds -
      endOdds
    ) /
    startOdds
  ) * 100;
}

function impliedProbability(
  odds: number | null,
): number | null {
  if (
    odds === null ||
    odds <= 0
  ) {
    return null;
  }

  return 1 / odds;
}

function stableKeyPart(
  value: unknown,
): string {
  const text =
    value === null ||
    value === undefined
      ? "NULL"
      : String(value);

  return text
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

function buildEventKey(
  raceKey: string,
  eventType: string,
  runnerNumber: number | null,
  previousValue: unknown,
  newValue: unknown,
): string {
  return [
    raceKey,
    "EVENT",
    eventType,
    runnerNumber ?? "RACE",
    stableKeyPart(previousValue),
    stableKeyPart(newValue),
  ].join(":");
}

function secondsBeforeStart(
  startTime: string | undefined | null,
  timestampIso: string,
): number | null {
  if (!startTime) {
    return null;
  }

  const startMs = Date.parse(startTime);
  const timestampMs = Date.parse(
    timestampIso,
  );

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(timestampMs)
  ) {
    return null;
  }

  return (
    startMs -
    timestampMs
  ) / 1_000;
}

function buildFinalMarket(
  race: ResearchCompletionRace,
) {
  const oddsByRunner = new Map<
    number,
    number
  >();

  for (const runner of race.runners) {
    if (runner.scratched) {
      continue;
    }

    const odds = rawOddsToDecimal(
      runner.oddsRaw,
    );

    if (odds !== null) {
      oddsByRunner.set(
        runner.number,
        odds,
      );
    }
  }

  const sorted = [
    ...oddsByRunner.entries(),
  ].sort(
    (a, b) =>
      a[1] - b[1] ||
      a[0] - b[0],
  );

  const rankByRunner = new Map<
    number,
    number
  >();

  sorted.forEach(
    ([runnerNumber], index) => {
      rankByRunner.set(
        runnerNumber,
        index + 1,
      );
    },
  );

  const inverseTotal = [
    ...oddsByRunner.values(),
  ].reduce(
    (sum, odds) =>
      sum + 1 / odds,
    0,
  );

  const shareByRunner = new Map<
    number,
    number
  >();

  if (inverseTotal > 0) {
    for (
      const [
        runnerNumber,
        odds,
      ] of oddsByRunner
    ) {
      shareByRunner.set(
        runnerNumber,
        (1 / odds) / inverseTotal,
      );
    }
  }

  return {
    oddsByRunner,
    rankByRunner,
    shareByRunner,
  };
}

export function buildResearchResultRows(
  args: {
    raceKey: string;
    race: ResearchCompletionRace;
    resultReceivedAt: string;
  },
): Array<Record<string, unknown>> {
  const {
    raceKey,
    race,
    resultReceivedAt,
  } = args;

  const cancelled =
    isRaceCancelled(race.status);

  const actualStarters =
    race.runners.filter(
      (runner) => !runner.scratched,
    ).length;

  const placeCount =
    paidPlaceCount(actualStarters);

  const finishPositionByRunner =
    new Map<number, number | null>();

  for (const runner of race.runners) {
    const rawPosition =
      parseFinishPosition(
        runner.rawRunnerJson,
      );

    const orderIndex =
      race.finishOrder.indexOf(
        runner.number,
      );

    finishPositionByRunner.set(
      runner.number,
      rawPosition ??
        (
          orderIndex >= 0
            ? orderIndex + 1
            : null
        ),
    );
  }

  const countByPosition =
    new Map<number, number>();

  for (
    const position of
    finishPositionByRunner.values()
  ) {
    if (position === null) {
      continue;
    }

    countByPosition.set(
      position,
      (
        countByPosition.get(
          position,
        ) ?? 0
      ) + 1,
    );
  }

  return race.runners.map(
    (runner) => {
      const position =
        finishPositionByRunner.get(
          runner.number,
        ) ?? null;

      const flags =
        parseOutcomeFlags(
          runner.rawRunnerJson,
        );

      const started =
        !cancelled &&
        !runner.scratched;

      const disqualified =
        flags.disqualified;

      const didNotFinish =
        started &&
        position === null
          ? (
              flags.didNotFinish ||
              !disqualified
            )
          : flags.didNotFinish;

      const shared =
        position !== null &&
        (
          countByPosition.get(
            position,
          ) ?? 0
        ) > 1;

      return {
        result_key: [
          raceKey,
          "RESULT",
          1,
          "RUNNER",
          runner.number,
        ].join(":"),

        race_key: raceKey,

        runner_number:
          runner.number,

        horse_id:
          runner.horseId,

        horse_name:
          runner.name,

        result_revision: 1,

        started,

        scratched_after_lock:
          runner.scratched,

        finish_position_official:
          cancelled
            ? null
            : position,

        finish_position_shared:
          shared,

        dead_heat_group:
          shared && position !== null
            ? `${raceKey}:POSITION:${position}`
            : null,

        winner_official:
          !cancelled &&
          position === 1,

        placed_official:
          cancelled ||
          placeCount === null ||
          position === null
            ? null
            : position <= placeCount,

        paid_place_count:
          cancelled
            ? null
            : placeCount,

        disqualified,

        did_not_finish:
          didNotFinish,

        galloped:
          flags.galloped,

        official_win_odds_decimal:
          rawOddsToDecimal(
            runner.oddsRaw,
          ),

        official_place_odds_decimal:
          rawOddsToDecimal(
            runner.placeOddsRaw,
          ),

        result_status:
          cancelled
            ? "VOID"
            : "OFFICIAL",

        result_source: "ATG",

        result_received_at:
          resultReceivedAt,

        raw_result_json: {
          raceStatus:
            race.status ?? null,

          finishOrder:
            race.finishOrder,

          runner:
            runner.rawRunnerJson,

          race:
            race.rawRaceJson,
        },

        updated_at:
          resultReceivedAt,
      };
    },
  );
}

export function buildResearchEventRows(
  args: {
    raceKey: string;

    previousRace:
      ResearchRaceRow;

    previousRunners:
      ResearchRunnerSnapshotRow[];

    currentRace:
      ResearchCompletionRace;

    eventTimestamp: string;

    largeOddsMovePercent?: number;
  },
): Array<Record<string, unknown>> {
  const {
    raceKey,
    previousRace,
    previousRunners,
    currentRace,
    eventTimestamp,
    largeOddsMovePercent =
      LARGE_ODDS_MOVE_PERCENT,
  } = args;

  const rows:
    Array<Record<string, unknown>> = [];

  const seconds =
    secondsBeforeStart(
      currentRace.startTime ??
        previousRace
          .planned_start_time,
      eventTimestamp,
    );

  const addEvent = (
    eventType: string,
    runnerNumber: number | null,
    horseId: number | null,
    previousValue: unknown,
    newValue: unknown,
    rawEventJson:
      Record<string, unknown>,
  ) => {
    rows.push({
      event_key:
        buildEventKey(
          raceKey,
          eventType,
          runnerNumber,
          previousValue,
          newValue,
        ),

      race_key: raceKey,
      event_type: eventType,

      event_timestamp:
        eventTimestamp,

      seconds_before_start:
        seconds,

      runner_number:
        runnerNumber,

      horse_id:
        horseId,

      previous_value_json:
        previousValue,

      new_value_json:
        newValue,

      source: "ATG",

      raw_event_json:
        rawEventJson,
    });
  };

  const previousStartMs =
    previousRace.planned_start_time
      ? Date.parse(
          previousRace
            .planned_start_time,
        )
      : Number.NaN;

  const currentStartMs =
    currentRace.startTime
      ? Date.parse(
          currentRace.startTime,
        )
      : Number.NaN;

  if (
    Number.isFinite(
      previousStartMs,
    ) &&
    Number.isFinite(
      currentStartMs,
    ) &&
    Math.abs(
      currentStartMs -
      previousStartMs
    ) >= 15_000
  ) {
    addEvent(
      "START_TIME_CHANGED",
      null,
      null,
      {
        startTime:
          previousRace
            .planned_start_time,
      },
      {
        startTime:
          currentRace.startTime,
      },
      {
        differenceSeconds:
          (
            currentStartMs -
            previousStartMs
          ) / 1_000,
      },
    );
  }

  const previousStatus =
    normalizeText(
      previousRace.race_status,
    );

  const currentStatus =
    normalizeText(
      currentRace.status,
    );

  if (
    previousStatus &&
    currentStatus &&
    previousStatus !==
      currentStatus
  ) {
    addEvent(
      "RACE_STATUS_CHANGED",
      null,
      null,
      {
        status:
          previousRace.race_status,
      },
      {
        status:
          currentRace.status,
      },
      {},
    );
  }

  const previousByRunner =
    new Map(
      previousRunners.map(
        (runner) => [
          runner.runner_number,
          runner,
        ],
      ),
    );

  const currentByRunner =
    new Map(
      currentRace.runners.map(
        (runner) => [
          runner.number,
          runner,
        ],
      ),
    );

  const previousNumbers = [
    ...previousByRunner.keys(),
  ].sort((a, b) => a - b);

  const currentNumbers = [
    ...currentByRunner.keys(),
  ].sort((a, b) => a - b);

  const previousActiveCount =
    previousRunners.filter(
      (runner) =>
        runner.scratched !== true,
    ).length;

  const currentActiveCount =
    currentRace.runners.filter(
      (runner) =>
        !runner.scratched,
    ).length;

  if (
    JSON.stringify(previousNumbers) !==
      JSON.stringify(currentNumbers) ||
    previousActiveCount !==
      currentActiveCount
  ) {
    addEvent(
      "START_FIELD_CHANGED",
      null,
      null,
      {
        runnerNumbers:
          previousNumbers,

        activeRunners:
          previousActiveCount,
      },
      {
        runnerNumbers:
          currentNumbers,

        activeRunners:
          currentActiveCount,
      },
      {},
    );
  }

  for (
    const current of
    currentRace.runners
  ) {
    const previous =
      previousByRunner.get(
        current.number,
      );

    if (!previous) {
      continue;
    }

    if (
      previous.scratched !== true &&
      current.scratched
    ) {
      addEvent(
        "SCRATCHED",
        current.number,
        current.horseId,
        {
          scratched: false,
        },
        {
          scratched: true,
        },
        {
          runner:
            current.rawRunnerJson,
        },
      );
    }

    if (
      previous.scratched === true &&
      !current.scratched
    ) {
      addEvent(
        "SCRATCH_REVERSED",
        current.number,
        current.horseId,
        {
          scratched: true,
        },
        {
          scratched: false,
        },
        {
          runner:
            current.rawRunnerJson,
        },
      );
    }

    const previousDriverId =
      toNumber(
        previous.driver_id,
      );

    const previousDriverName =
      normalizeText(
        previous.driver_name,
      );

    const currentDriverName =
      normalizeText(
        current.driverName,
      );

    const driverChangedById =
      previousDriverId !== null &&
      current.driverId !== null &&
      previousDriverId !==
        current.driverId;

    const driverChangedByName =
      previousDriverName &&
      currentDriverName &&
      previousDriverName !==
        currentDriverName;

    if (
      driverChangedById ||
      driverChangedByName
    ) {
      addEvent(
        "DRIVER_CHANGED",
        current.number,
        current.horseId,
        {
          driverId:
            previousDriverId,

          driverName:
            previous.driver_name,
        },
        {
          driverId:
            current.driverId,

          driverName:
            current.driverName,
        },
        {},
      );
    }

    const previousLane =
      toNumber(
        previous.start_lane,
      );

    if (
      previousLane !== null &&
      current.startLane !== null &&
      previousLane !==
        current.startLane
    ) {
      addEvent(
        "START_LANE_CHANGED",
        current.number,
        current.horseId,
        {
          startLane:
            previousLane,
        },
        {
          startLane:
            current.startLane,
        },
        {},
      );
    }

    const previousOdds =
      toNumber(
        previous.current_win_odds,
      );

    const currentOdds =
      rawOddsToDecimal(
        current.oddsRaw,
      );

    if (
      previousOdds !== null &&
      currentOdds !== null &&
      previousOdds > 0
    ) {
      const changePercent =
        (
          (
            currentOdds -
            previousOdds
          ) /
          previousOdds
        ) * 100;

      if (
        Math.abs(
          changePercent,
        ) >=
        largeOddsMovePercent
      ) {
        const bucket =
          Math.round(
            changePercent / 5,
          ) * 5;

        addEvent(
          "LARGE_ODDS_MOVE",
          current.number,
          current.horseId,
          {
            winOdds:
              previousOdds,
          },
          {
            winOdds:
              currentOdds,

            changePercent,

            changeBucket:
              bucket,
          },
          {},
        );
      }
    }
  }

  return rows;
}

export function buildResearchFinalOddsRows(
  args: {
    raceKey: string;
    race: ResearchCompletionRace;
    fetchedAt: string;
  },
): Array<Record<string, unknown>> {
  const {
    raceKey,
    race,
    fetchedAt,
  } = args;

  const remainingSeconds =
    secondsBeforeStart(
      race.startTime,
      fetchedAt,
    ) ?? 0;

  return race.runners.map(
    (runner) => {
      const winOdds =
        rawOddsToDecimal(
          runner.oddsRaw,
        );

      const placeOdds =
        rawOddsToDecimal(
          runner.placeOddsRaw,
        );

      return {
        odds_point_key: [
          raceKey,
          "LIVE",
          "RUNNER",
          runner.number,
          "FINAL",
        ].join(":"),

        race_key: raceKey,
        signal_phase: "LIVE",

        runner_number:
          runner.number,

        horse_id:
          runner.horseId,

        horse_name:
          runner.name,

        capture_type: "FINAL",

        target_seconds_before_start:
          0,

        actual_seconds_before_start:
          remainingSeconds,

        point_timestamp:
          fetchedAt,

        target_timestamp:
          race.startTime ?? null,

        source_timestamp_delta_seconds:
          0,

        win_odds_decimal:
          winOdds,

        place_odds_decimal:
          placeOdds,

        odds_valid:
          winOdds !== null ||
          placeOdds !== null,

        invalid_reason:
          winOdds === null &&
          placeOdds === null
            ? "FINAL_ODDS_MISSING"
            : null,

        scratched_at_point:
          runner.scratched,

        source: "ATG",

        fetched_at:
          fetchedAt,

        sampling_version:
          RESEARCH_SAMPLING_VERSION,

        updated_at:
          fetchedAt,
      };
    },
  );
}

export function buildResearchFinalMetricRows(
  args: {
    raceKey: string;
    race: ResearchCompletionRace;

    metricRows:
      ResearchMetricRow[];

    oddsPointRows:
      ResearchOddsPointRow[];

    calculatedAt: string;
  },
): Array<Record<string, unknown>> {
  const {
    raceKey,
    race,
    metricRows,
    oddsPointRows,
    calculatedAt,
  } = args;

  const finalMarket =
    buildFinalMarket(race);

  const pointByRunnerAndCapture =
    new Map<string, number>();

  for (const point of oddsPointRows) {
    if (
      point.race_key !==
      raceKey
    ) {
      continue;
    }

    const odds =
      toNumber(
        point.win_odds_decimal,
      );

    if (odds === null) {
      continue;
    }

    pointByRunnerAndCapture.set(
      [
        point.runner_number,
        point.capture_type,
      ].join(":"),
      odds,
    );
  }

  const currentByRunner =
    new Map(
      race.runners.map(
        (runner) => [
          runner.number,
          runner,
        ],
      ),
    );

  return metricRows
    .filter(
      (metric) =>
        metric.race_key ===
          raceKey &&
        currentByRunner.has(
          metric.runner_number,
        ),
    )
    .map((metric) => {
      const runner =
        currentByRunner.get(
          metric.runner_number,
        );

      if (!runner) {
        return metric;
      }

      const finalOdds =
        rawOddsToDecimal(
          runner.oddsRaw,
        );

      const startOdds =
        toNumber(
          metric.start_odds,
        );

      const point = (
        captureType: string,
      ) =>
        pointByRunnerAndCapture.get(
          [
            runner.number,
            captureType,
          ].join(":"),
        ) ?? null;

      return {
        ...metric,

        final_odds:
          finalOdds,

        final_odds_timestamp:
          finalOdds === null
            ? null
            : calculatedAt,

        odds_drop_to_final_percent:
          percentDrop(
            startOdds,
            finalOdds,
          ),

        odds_drop_last_10_minutes_percent:
          percentDrop(
            point("T10"),
            finalOdds,
          ),

        odds_drop_last_5_minutes_percent:
          percentDrop(
            point("T5"),
            finalOdds,
          ),

        odds_drop_last_2_minutes_percent:
          percentDrop(
            point("T2"),
            finalOdds,
          ),

        implied_probability_final:
          impliedProbability(
            finalOdds,
          ),

        normalized_market_share_final:
          finalMarket
            .shareByRunner
            .get(
              runner.number,
            ) ?? null,

        data_quality_status:
          (
            runner.scratched ||
            finalOdds !== null
          )
            ? (
                metric
                  .data_quality_status ??
                "COMPLETE"
              )
            : "PARTIAL",

        updated_at:
          calculatedAt,
      };
    });
}

function buildResultSnapshotRows(
  args: {
    raceKey: string;
    race: ResearchCompletionRace;

    lockSnapshot:
      ResearchRaceSnapshotRow | null;

    lockRunners:
      ResearchRunnerSnapshotRow[];

    timestamp: string;
  },
) {
  const {
    raceKey,
    race,
    lockSnapshot,
    lockRunners,
    timestamp,
  } = args;

  if (!lockSnapshot) {
    return {
      snapshotRow: null,
      runnerRows: [],
    };
  }

  const snapshotKey =
    `${raceKey}:LIVE:RESULT`;

  const finalMarket =
    buildFinalMarket(race);

  const activeRunners =
    race.runners.filter(
      (runner) =>
        !runner.scratched,
    );

  const finalOddsComplete =
    activeRunners.every(
      (runner) =>
        rawOddsToDecimal(
          runner.oddsRaw,
        ) !== null,
    );

  const snapshotRow = {
    ...lockSnapshot,

    snapshot_key:
      snapshotKey,

    race_key:
      raceKey,

    signal_phase: "LIVE",
    capture_type: "RESULT",

    target_snapshot_time:
      race.startTime ?? null,

    actual_snapshot_time:
      timestamp,

    target_seconds_before_start:
      0,

    actual_seconds_before_start:
      secondsBeforeStart(
        race.startTime,
        timestamp,
      ),

    latest_odds_timestamp:
      timestamp,

    data_fetched_at:
      timestamp,

    data_quality_status:
      finalOddsComplete
        ? "COMPLETE"
        : "PARTIAL",

    snapshot_complete:
      finalOddsComplete,

    expected_runner_count:
      race.runners.length,

    archived_runner_count:
      race.runners.length,

    missing_fields:
      finalOddsComplete
        ? []
        : ["finalOdds"],

    invalid_fields: [],
    stale_fields: [],
    source_errors: [],

    raw_race_json:
      race.rawRaceJson,

    created_at:
      timestamp,

    updated_at:
      timestamp,
  };

  const previousByRunner =
    new Map(
      lockRunners.map(
        (runner) => [
          runner.runner_number,
          runner,
        ],
      ),
    );

  const runnerRows =
    race.runners.map(
      (runner) => {
        const previous =
          previousByRunner.get(
            runner.number,
          );

        const finalOdds =
          rawOddsToDecimal(
            runner.oddsRaw,
          );

        const finalPlaceOdds =
          rawOddsToDecimal(
            runner.placeOddsRaw,
          );

        const finishPosition =
          parseFinishPosition(
            runner.rawRunnerJson,
          ) ??
          (
            race.finishOrder.indexOf(
              runner.number,
            ) >= 0
              ? race.finishOrder.indexOf(
                  runner.number,
                ) + 1
              : null
          );

        const startOdds =
          toNumber(
            previous
              ?.start_win_odds,
          );

        const base =
          previous ?? {
            horse_id:
              runner.horseId,

            horse_name:
              runner.name,

            horse_age:
              runner.horseAge,

            horse_sex:
              runner.horseSex,

            start_lane:
              runner.startLane,

            start_distance_meters:
              runner
                .startDistanceMeters,

            distance_handicap_meters:
              null,

            driver_id:
              runner.driverId,

            driver_name:
              runner.driverName,

            trainer_id:
              runner.trainerId,

            trainer_name:
              runner.trainerName,

            scratched: false,

            scratched_at: null,
            scratch_reason: null,

            runner_status: "ACTIVE",

            current_win_odds: null,
            current_place_odds: null,

            start_win_odds: null,
            odds_drop_percent: null,

            implied_probability_raw:
              null,

            normalized_market_share:
              null,

            strength_total: 0,

            odds_drop_rank: null,
            smoothness_rank: null,
            market_rank: null,

            is_most_shortened: false,
            is_second_most_shortened:
              false,

            is_smoothest: false,
            is_second_smoothest:
              false,

            is_favorite: false,

            indicator_data_complete:
              false,

            odds_data_complete:
              false,

            missing_fields: [],
            invalid_fields: [],
          };

        return {
          ...base,

          runner_snapshot_key: [
            snapshotKey,
            "RUNNER",
            runner.number,
          ].join(":"),

          snapshot_key:
            snapshotKey,

          race_key:
            raceKey,

          runner_number:
            runner.number,

          horse_id:
            runner.horseId,

          horse_name:
            runner.name,

          horse_age:
            runner.horseAge,

          horse_sex:
            runner.horseSex,

          start_lane:
            runner.startLane,

          start_distance_meters:
            runner
              .startDistanceMeters,

          driver_id:
            runner.driverId,

          driver_name:
            runner.driverName,

          trainer_id:
            runner.trainerId,

          trainer_name:
            runner.trainerName,

          scratched:
            runner.scratched,

          scratched_at:
            runner.scratched
              ? timestamp
              : null,

          runner_status:
            runner.scratched
              ? "SCRATCHED"
              : (
                  finishPosition !== null
                    ? "FINISHED"
                    : (
                        isRaceCancelled(
                          race.status,
                        )
                          ? "VOID"
                          : "DID_NOT_FINISH"
                      )
                ),

          current_win_odds:
            finalOdds,

          current_place_odds:
            finalPlaceOdds,

          odds_drop_percent:
            percentDrop(
              startOdds,
              finalOdds,
            ),

          implied_probability_raw:
            impliedProbability(
              finalOdds,
            ),

          normalized_market_share:
            finalMarket
              .shareByRunner
              .get(
                runner.number,
              ) ?? null,

          market_rank:
            finalMarket
              .rankByRunner
              .get(
                runner.number,
              ) ?? null,

          is_favorite:
            finalMarket
              .rankByRunner
              .get(
                runner.number,
              ) === 1,

          odds_data_complete:
            runner.scratched ||
            finalOdds !== null,

          missing_fields:
            (
              runner.scratched ||
              finalOdds !== null
            )
              ? []
              : ["finalOdds"],

          invalid_fields: [],

          raw_runner_json:
            runner.rawRunnerJson,

          created_at:
            timestamp,

          updated_at:
            timestamp,
        };
      },
    );

  return {
    snapshotRow,
    runnerRows,
  };
}

async function upsertRows(
  args: {
    supabase: SupabaseClient;
    table: string;

    rows:
      | Record<string, unknown>
      | Array<Record<string, unknown>>;

    onConflict?: string;
    ignoreDuplicates?: boolean;
  },
) {
  if (
    Array.isArray(args.rows) &&
    args.rows.length === 0
  ) {
    return;
  }

  const { error } =
    await args.supabase
      .from(args.table)
      .upsert(
        args.rows,
        {
          onConflict:
            args.onConflict,

          ignoreDuplicates:
            args.ignoreDuplicates ??
            false,
        },
      );

  if (error) {
    throw new Error(
      `Kunde inte skriva ${args.table}: ${error.message}`,
    );
  }
}

export async function completeResearchRacesForDay(
  args: {
    enabled: boolean;

    supabase:
      SupabaseClient;

    raceDate: string;

    races:
      ResearchCompletionRaceItem[];

    nowIso: string;
  },
): Promise<ResearchCompletionSummary> {
  const summary =
    emptySummary(
      args.enabled,
    );

  if (!args.enabled) {
    return summary;
  }

  const {
    data: raceRowsData,
    error: raceRowsError,
  } = await args.supabase
    .from("research_races")
    .select(
      [
        "race_key",
        "source_race_id",
        "race_date",
        "track_id",
        "track_name",
        "race_number",
        "planned_start_time",
        "race_status",
        "scheduled_starters",
        "expected_runner_count",
        "archived_result_count",
        "archived_odds_point_count",
        "archive_status",
      ].join(","),
    )
    .eq(
      "race_date",
      args.raceDate,
    )
    .neq(
      "archive_status",
      "COMPLETE",
    );

  if (raceRowsError) {
    throw new Error(
      `Kunde inte läsa forskningsloppen: ${raceRowsError.message}`,
    );
  }

  const raceRows =
    (
      raceRowsData ?? []
    ) as ResearchRaceRow[];

  if (raceRows.length === 0) {
    return summary;
  }

  const raceKeys =
    raceRows.map(
      (row) => row.race_key,
    );

  const [
    lockRunnerResponse,
    lockSnapshotResponse,
    metricResponse,
    oddsPointResponse,
  ] = await Promise.all([
    args.supabase
      .from(
        "research_runner_snapshots",
      )
      .select("*")
      .in(
        "race_key",
        raceKeys,
      )
      .like(
        "snapshot_key",
        "%:LIVE:LOCK",
      ),

    args.supabase
      .from(
        "research_race_snapshots",
      )
      .select("*")
      .in(
        "race_key",
        raceKeys,
      )
      .eq(
        "signal_phase",
        "LIVE",
      )
      .eq(
        "capture_type",
        "LOCK",
      ),

    args.supabase
      .from(
        "research_runner_metrics",
      )
      .select("*")
      .in(
        "race_key",
        raceKeys,
      )
      .eq(
        "signal_phase",
        "LIVE",
      ),

    args.supabase
      .from(
        "research_odds_points",
      )
      .select(
        [
          "odds_point_key",
          "race_key",
          "runner_number",
          "capture_type",
          "win_odds_decimal",
        ].join(","),
      )
      .in(
        "race_key",
        raceKeys,
      )
      .eq(
        "signal_phase",
        "LIVE",
      ),
  ]);

  if (lockRunnerResponse.error) {
    throw new Error(
      `Kunde inte läsa LOCK-hästar: ${lockRunnerResponse.error.message}`,
    );
  }

  if (lockSnapshotResponse.error) {
    throw new Error(
      `Kunde inte läsa LOCK-snapshots: ${lockSnapshotResponse.error.message}`,
    );
  }

  if (metricResponse.error) {
    throw new Error(
      `Kunde inte läsa forskningsmått: ${metricResponse.error.message}`,
    );
  }

  if (oddsPointResponse.error) {
    throw new Error(
      `Kunde inte läsa forskningsodds: ${oddsPointResponse.error.message}`,
    );
  }

  const lockRunners =
    (
      lockRunnerResponse.data ?? []
    ) as ResearchRunnerSnapshotRow[];

  const lockSnapshots =
    (
      lockSnapshotResponse.data ?? []
    ) as ResearchRaceSnapshotRow[];

  const metricRows =
    (
      metricResponse.data ?? []
    ) as ResearchMetricRow[];

  const oddsPointRows =
    (
      oddsPointResponse.data ?? []
    ) as ResearchOddsPointRow[];

  const currentBySourceRaceId =
    new Map(
      args.races.map(
        (item) => [
          item.race.id,
          item,
        ],
      ),
    );

  const currentByTrackAndRace =
    new Map(
      args.races.map(
        (item) => [
          [
            item.track.id,
            item.race.raceNumber,
          ].join(":"),
          item,
        ],
      ),
    );

  for (const raceRow of raceRows) {
    summary.racesChecked += 1;

    const item =
      currentBySourceRaceId.get(
        raceRow.source_race_id,
      ) ??
      currentByTrackAndRace.get(
        [
          raceRow.track_id,
          raceRow.race_number,
        ].join(":"),
      );

    if (!item) {
      continue;
    }

    const race =
      item.race;

    const previousRunners =
      lockRunners.filter(
        (runner) =>
          runner.race_key ===
          raceRow.race_key,
      );

    try {
      const eventRows =
        buildResearchEventRows({
          raceKey:
            raceRow.race_key,

          previousRace:
            raceRow,

          previousRunners,

          currentRace:
            race,

          eventTimestamp:
            args.nowIso,
        });

      if (eventRows.length > 0) {
        await upsertRows({
          supabase:
            args.supabase,

          table:
            "research_race_events",

          rows:
            eventRows,

          onConflict:
            "event_key",

          ignoreDuplicates:
            true,
        });

        summary.eventRowsProcessed +=
          eventRows.length;
      }

      if (!hasResult(race)) {
        const {
          error: liveUpdateError,
        } = await args.supabase
          .from("research_races")
          .update({
            planned_start_time:
              race.startTime ??
              raceRow
                .planned_start_time,

            race_status:
              race.status ??
              raceRow.race_status,

            actual_starters:
              race.runners.filter(
                (runner) =>
                  !runner.scratched,
              ).length,

            last_seen_at:
              args.nowIso,

            updated_at:
              args.nowIso,
          })
          .eq(
            "race_key",
            raceRow.race_key,
          );

        if (liveUpdateError) {
          throw new Error(
            `Kunde inte uppdatera pågående forskningslopp: ${liveUpdateError.message}`,
          );
        }

        continue;
      }

      const resultRows =
        buildResearchResultRows({
          raceKey:
            raceRow.race_key,

          race,

          resultReceivedAt:
            args.nowIso,
        });

      const finalOddsRows =
        buildResearchFinalOddsRows({
          raceKey:
            raceRow.race_key,

          race,

          fetchedAt:
            args.nowIso,
        });

      const finalMetricRows =
        buildResearchFinalMetricRows({
          raceKey:
            raceRow.race_key,

          race,

          metricRows:
            metricRows.filter(
              (metric) =>
                metric.race_key ===
                raceRow.race_key,
            ),

          oddsPointRows:
            oddsPointRows.filter(
              (point) =>
                point.race_key ===
                raceRow.race_key,
            ),

          calculatedAt:
            args.nowIso,
        });

      const lockSnapshot =
        lockSnapshots.find(
          (snapshot) =>
            snapshot.race_key ===
            raceRow.race_key,
        ) ?? null;

      const resultSnapshots =
        buildResultSnapshotRows({
          raceKey:
            raceRow.race_key,

          race,

          lockSnapshot,

          lockRunners:
            previousRunners,

          timestamp:
            args.nowIso,
        });

      if (
        resultSnapshots
          .snapshotRow
      ) {
        await upsertRows({
          supabase:
            args.supabase,

          table:
            "research_race_snapshots",

          rows:
            resultSnapshots
              .snapshotRow,

          onConflict:
            "snapshot_key",
        });

        await upsertRows({
          supabase:
            args.supabase,

          table:
            "research_runner_snapshots",

          rows:
            resultSnapshots
              .runnerRows,

          onConflict:
            "runner_snapshot_key",
        });

        summary
          .resultSnapshotsArchived += 1;
      }

      await upsertRows({
        supabase:
          args.supabase,

        table:
          "research_odds_points",

        rows:
          finalOddsRows,

        onConflict:
          "odds_point_key",
      });

      await upsertRows({
        supabase:
          args.supabase,

        table:
          "research_runner_metrics",

        rows:
          finalMetricRows,

        onConflict:
          "metric_key",
      });

      await upsertRows({
        supabase:
          args.supabase,

        table:
          "research_runner_results",

        rows:
          resultRows,

        onConflict:
          "result_key",
      });

      const existingPointKeys =
        new Set(
          oddsPointRows
            .filter(
              (point) =>
                point.race_key ===
                raceRow.race_key,
            )
            .map(
              (point) =>
                point.odds_point_key,
            ),
        );

      for (
        const row of
        finalOddsRows
      ) {
        existingPointKeys.add(
          String(
            row.odds_point_key,
          ),
        );
      }

      const actualStarters =
        race.runners.filter(
          (runner) =>
            !runner.scratched,
        ).length;

      const {
        error: raceUpdateError,
      } = await args.supabase
        .from("research_races")
        .update({
          planned_start_time:
            race.startTime ??
            raceRow
              .planned_start_time,

          actual_start_time:
            race.startTime ??
            raceRow
              .planned_start_time,

          race_status:
            race.status ??
            raceRow.race_status,

          actual_starters:
            actualStarters,

          archived_result_count:
            resultRows.length,

          archived_odds_point_count:
            existingPointKeys.size,

          archive_status:
            resultRows.length ===
            race.runners.length
              ? "COMPLETE"
              : "INCOMPLETE",

          archived_at:
            args.nowIso,

          last_seen_at:
            args.nowIso,

          updated_at:
            args.nowIso,
        })
        .eq(
          "race_key",
          raceRow.race_key,
        );

      if (raceUpdateError) {
        throw new Error(
          `Kunde inte slutmarkera forskningsloppet: ${raceUpdateError.message}`,
        );
      }

      summary.racesCompleted += 1;

      summary.resultRowsArchived +=
        resultRows.length;

      summary.finalOddsPointsArchived +=
        finalOddsRows.length;
    } catch (error) {
      summary.failedRaces += 1;

      appendError(
        summary,
        `${raceRow.track_name} lopp ${raceRow.race_number}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  return summary;
}
