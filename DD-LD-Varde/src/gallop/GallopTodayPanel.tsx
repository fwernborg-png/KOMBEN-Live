import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  loadGallopHistoryOptions,
  loadGallopHistoryRows,
  type GallopHistoryRow,
} from "../researchHistory/gallopRepository";
import {
  GALLOP_T1_CAPTURE_TOLERANCE_SECONDS,
  GALLOP_T1_LOCK_TARGET_SECONDS,
  GALLOP_T1_MAX_DROP_PERCENT,
  GALLOP_T1_MIN_DROP_PERCENT,
  GALLOP_T1_PREVIEW_TARGET_SECONDS,
  GALLOP_T1_SHADOW_RULE_VERSION,
  isGallopT1ShadowRace,
} from "./gallopT1ShadowConfig";

import "./gallopToday.css";

const WORKER_API =
  "https://dd-ld-varde-place-live-worker.fredde-platsmodell-live.workers.dev";

const API =
  `${WORKER_API}/atg`;

const PLACE_HISTORY_API =
  `${WORKER_API}/api/place-live/history`;

const SETTINGS_KEY =
  "platsjagaren-gallop-v1-settings";

/*
 * Godkända galoppmarknader:
 * Sverige, Danmark, Norge och Sydafrika.
 * Okänd eller saknad landkod stoppas.
 */
const ALLOWED_GALLOP_COUNTRY_CODES =
  new Set([
    "SE",
    "DK",
    "NO",
    "ZA",
  ]);

const T90_SWEDEN_START_DATE =
  "2026-08-18";

const T90_SWEDEN_MIN_DROP_PERCENT =
  25;

const T90_SWEDEN_MAX_DROP_PERCENT =
  40;

type UnknownRecord =
  Record<string, unknown>;

type GallopRaceRef = {
  raceNumber: number;
  raceId: string | null;
  startTime: string | null;
};

type GallopTrack = {
  id: number;
  name: string;
  countryCode: string;
  races: GallopRaceRef[];
};

type GallopTimelineRace = {
  key: string;
  track: GallopTrack;
  race: GallopRaceRef;
  startMs: number | null;
};

type GallopRunner = {
  number: number;
  name: string;
  scratched: boolean;
  oddsRaw: number | null;
  finishPosition: number | null;
};

type OddsMemory = {
  firstOddsRaw: number;
  currentOddsRaw: number;
  samples: number;
};

type OddsMemoryByRunner =
  Record<string, OddsMemory>;

type GallopLockedSignal = {
  runnerNumber: number;
  runnerName: string;

  firstOddsRaw: number;
  lockOddsRaw: number;

  dropPercent: number;
  samples: number;

  lockedAtMs: number;

  minDropPercent: number;
  maxOdds: number;

  qualifies: boolean;
};

type GallopLockedSignals =
  Record<string, GallopLockedSignal>;

type RaceRunners =
  Record<string, GallopRunner[]>;

type ServerOddsPoint = {
  runnerNumber: number;
  market: "WIN" | "PLACE";
  oddsDecimal: number;
  pointTs: string;
};

type ServerOddsHistoryResponse = {
  ok: boolean;
  count: number;
  firstPointTs: string | null;
  lastPointTs: string | null;
  points: ServerOddsPoint[];
  error?: string;
};

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
    value.trim()
  ) {
    const parsed =
      Number(
        value
          .replace(/\s+/g, "")
          .replace(",", "."),
      );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function getArray(
  value: unknown,
  key: string,
): unknown[] {
  const record =
    asRecord(value);

  if (!record) {
    return [];
  }

  return Array.isArray(
    record[key],
  )
    ? record[key] as unknown[]
    : [];
}

function getRecord(
  value: unknown,
  key: string,
): UnknownRecord | null {
  const record =
    asRecord(value);

  return record
    ? asRecord(record[key])
    : null;
}


function parseFinishPosition(
  value: unknown,
): number | null {
  const record =
    asRecord(value);

  if (!record) {
    return null;
  }

  const result =
    getRecord(
      record,
      "result",
    );

  const candidates = [
    record.finishPosition,
    record.position,
    record.place,
    record.rank,
    record.finishOrder,
    result?.finishPosition,
    result?.position,
    result?.place,
    result?.rank,
    result?.finishOrder,
  ];

  for (
    const candidate of
    candidates
  ) {
    const parsed =
      asNumber(
        candidate,
      );

    if (
      parsed !== null &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  return null;
}

function normalizeSport(
  value: unknown,
): string {
  const text =
    asString(value)
      .trim()
      .toLowerCase();

  if (
    text === "gallop" ||
    text === "galopp"
  ) {
    return "gallop";
  }

  return text;
}

function normalizeCountry(
  value: UnknownRecord,
): string {
  const raw =
    asString(
      value.countryCode,
    ) ||
    asString(
      value.country,
    ) ||
    asString(
      value.nation,
    );

  return raw
    .trim()
    .toUpperCase() ||
    "–";
}

function isAllowedGallopCountry(
  countryCode: string,
): boolean {
  return (
    ALLOWED_GALLOP_COUNTRY_CODES
      .has(
        countryCode
          .trim()
          .toUpperCase(),
      )
  );
}

function parseRaceRefs(
  track: UnknownRecord,
): GallopRaceRef[] {
  const candidates = [
    ...getArray(
      track,
      "races",
    ),
    ...getArray(
      track,
      "starts",
    ),
    ...getArray(
      track,
      "games",
    ),
    ...getArray(
      track,
      "raceSummaries",
    ),
  ];

  const byNumber =
    new Map<
      number,
      GallopRaceRef
    >();

  for (
    const value of
    candidates
  ) {
    const race =
      asRecord(value);

    if (!race) {
      continue;
    }

    const raceNumber =
      asNumber(
        race.number,
      ) ??
      asNumber(
        race.raceNumber,
      ) ??
      asNumber(
        race.leg,
      );

    if (
      raceNumber === null ||
      raceNumber <= 0
    ) {
      continue;
    }

    if (
      byNumber.has(
        raceNumber,
      )
    ) {
      continue;
    }

    byNumber.set(
      raceNumber,
      {
        raceNumber,

        raceId:
          asString(
            race.id,
          ) ||
          asString(
            race.raceId,
          ) ||
          null,

        startTime:
          asString(
            race.startTime,
          ) ||
          asString(
            race.scheduledStartTime,
          ) ||
          asString(
            race.postTime,
          ) ||
          null,
      },
    );
  }

  return [
    ...byNumber.values(),
  ].sort(
    (a, b) =>
      a.raceNumber -
      b.raceNumber,
  );
}

function trackSport(
  track: UnknownRecord,
): string {
  const direct =
    normalizeSport(
      track.sport,
    ) ||
    normalizeSport(
      track.sportType,
    ) ||
    normalizeSport(
      track.racingType,
    );

  if (direct) {
    return direct;
  }

  const races = [
    ...getArray(
      track,
      "races",
    ),
    ...getArray(
      track,
      "starts",
    ),
  ];

  for (
    const value of races
  ) {
    const race =
      asRecord(value);

    if (!race) {
      continue;
    }

    const sport =
      normalizeSport(
        race.sport,
      );

    if (sport) {
      return sport;
    }
  }

  return "";
}

function parseGallopTracks(
  data: unknown,
): GallopTrack[] {
  return getArray(
    data,
    "tracks",
  )
    .map(
      (value) => {
        const track =
          asRecord(value);

        if (!track) {
          return null;
        }

        if (
          trackSport(
            track,
          ) !==
          "gallop"
        ) {
          return null;
        }

        const countryCode =
          normalizeCountry(
            track,
          );

        if (
          !isAllowedGallopCountry(
            countryCode,
          )
        ) {
          return null;
        }

        const id =
          asNumber(
            track.id,
          ) ??
          asNumber(
            track.trackId,
          ) ??
          asNumber(
            track.number,
          );

        const name =
          asString(
            track.name,
          ) ||
          asString(
            track.trackName,
          ) ||
          asString(
            track.displayName,
          );

        if (
          id === null ||
          !name
        ) {
          return null;
        }

        return {
          id,
          name,
          countryCode,
          races:
            parseRaceRefs(
              track,
            ),
        };
      },
    )
    .filter(
      (
        track,
      ): track is GallopTrack =>
        track !== null,
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "sv",
        ),
    );
}

function parseRunners(
  data: unknown,
): GallopRunner[] {
  const races =
    getArray(
      data,
      "races",
    );

  const race =
    asRecord(
      races[0],
    );

  if (!race) {
    return [];
  }

  const starts =
    getArray(
      race,
      "starts",
    );

  const horses =
    getArray(
      race,
      "horses",
    );

  const entries =
    starts.length
      ? starts
      : horses;

  return entries
    .map(
      (
        value,
        index,
      ) => {
        const start =
          asRecord(value);

        if (!start) {
          return null;
        }

        const horse =
          getRecord(
            start,
            "horse",
          ) ??
          start;

        const number =
          asNumber(
            start.number,
          ) ??
          asNumber(
            start.startNumber,
          ) ??
          asNumber(
            horse.number,
          ) ??
          index + 1;

        const name =
          asString(
            horse.name,
          ) ||
          asString(
            start.horseName,
          ) ||
          asString(
            start.name,
          ) ||
          `Häst ${number}`;

        const pools =
          getRecord(
            start,
            "pools",
          );

        const winnerPool =
          pools
            ? (
                getRecord(
                  pools,
                  "vinnare",
                ) ??
                getRecord(
                  pools,
                  "winner",
                ) ??
                getRecord(
                  pools,
                  "win",
                )
              )
            : null;

        const oddsRaw =
          (
            winnerPool
              ? asNumber(
                  winnerPool.odds,
                )
              : null
          ) ??
          asNumber(
            start.odds,
          );

        const status =
          asString(
            start.status,
          )
            .toLowerCase();

        return {
          number,
          name,

          scratched:
            start.scratched ===
              true ||
            start.withdrawn ===
              true ||
            status ===
              "scratched",

          oddsRaw,

          finishPosition:
            parseFinishPosition(
              start,
            ),
        };
      },
    )
    .filter(
      (
        runner,
      ): runner is GallopRunner =>
        runner !== null,
    )
    .sort(
      (a, b) =>
        a.number -
        b.number,
    );
}

function raceKey(
  trackId: number,
  raceNumber: number,
): string {
  return (
    `${trackId}:${raceNumber}`
  );
}

function preferredRaceForTrack(
  track: GallopTrack,
): GallopRaceRef | null {
  const now =
    Date.now();

  const scheduled =
    track.races
      .map(
        (race) => {
          const parsedStartMs =
            race.startTime
              ? Date.parse(
                  race.startTime,
                )
              : Number.NaN;

          return {
            race,

            startMs:
              Number.isFinite(
                parsedStartMs,
              )
                ? parsedStartMs
                : null,
          };
        },
      )
      .filter(
        (
          item,
        ): item is {
          race: GallopRaceRef;
          startMs: number;
        } =>
          item.startMs !==
          null,
      )
      .sort(
        (a, b) =>
          a.startMs -
          b.startMs,
      );

  const next =
    scheduled.find(
      (item) =>
        item.startMs >
        now,
    );

  return (
    next?.race ??
    scheduled[
      scheduled.length -
        1
    ]?.race ??
    track.races[0] ??
    null
  );
}

function runnerKey(
  date: string,
  trackId: number,
  raceNumber: number,
  runnerNumber: number,
): string {
  return [
    date,
    trackId,
    raceNumber,
    runnerNumber,
  ].join(":");
}

function lockedSignalKey(
  date: string,
  trackId: number,
  raceNumber: number,
): string {
  return [
    date,
    trackId,
    raceNumber,
  ].join(":");
}

function formatTime(
  value: string | null,
): string {
  if (!value) {
    return "–";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "–";
  }

  return date
    .toLocaleTimeString(
      "sv-SE",
      {
        hour:
          "2-digit",
        minute:
          "2-digit",
      },
    );
}

function decimalOdds(
  raw: number | null,
): number | null {
  if (
    raw === null ||
    raw <= 0
  ) {
    return null;
  }

  /*
   * ATG:s vinnarodds i nuvarande
   * Platsjägaren är normalt heltal:
   * 350 = 3,50.
   */
  return raw >= 100
    ? raw / 100
    : raw;
}

function formatOdds(
  raw: number | null,
): string {
  const value =
    decimalOdds(raw);

  if (value === null) {
    return "–";
  }

  return value
    .toFixed(2)
    .replace(
      ".",
      ",",
    );
}

function formatDrop(
  value: number | null,
): string {
  if (
    value === null
  ) {
    return "–";
  }

  return (
    `${value
      .toFixed(1)
      .replace(
        ".",
        ",",
      )} %`
  );
}

function flag(
  code: string,
): string {
  const flags:
    Record<
      string,
      string
    > = {
      SE: "🇸🇪",
      DK: "🇩🇰",
      NO: "🇳🇴",
      GB: "🇬🇧",
      IE: "🇮🇪",
      FR: "🇫🇷",
      DE: "🇩🇪",
      ZA: "🇿🇦",
      AU: "🇦🇺",
      NZ: "🇳🇿",
      US: "🇺🇸",
      CA: "🇨🇦",
      HK: "🇭🇰",
      AE: "🇦🇪",
    };

  return (
    flags[code] ??
    "🏳️"
  );
}

type GallopPerformanceStats = {
  bets: number;
  wins: number;
  hitPercent: number | null;
  roiPercent: number | null;
  netSek: number | null;
};

function shiftIsoDate(
  value: string,
  deltaDays: number,
): string {
  const parts =
    value
      .split("-")
      .map(Number);

  if (
    parts.length !== 3 ||
    parts.some(
      (part) =>
        !Number.isFinite(part),
    )
  ) {
    return value;
  }

  const date =
    new Date(
      Date.UTC(
        parts[0],
        parts[1] - 1,
        parts[2],
      ),
    );

  date.setUTCDate(
    date.getUTCDate() +
      deltaDays,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function summarizeGallopPerformance(
  rows: GallopHistoryRow[],
  dateFrom?: string,
  dateTo?: string,
): GallopPerformanceStats {
  const validRows =
    rows.filter(
      (row) => {
        if (
          dateFrom &&
          row.raceDate < dateFrom
        ) {
          return false;
        }

        if (
          dateTo &&
          row.raceDate > dateTo
        ) {
          return false;
        }

        return (
          !row.betVoid &&
          row.started !== false &&
          row.finishPositionOfficial !==
            null &&
          row.validOddsPoints >= 2
        );
      },
    );

  const bets =
    validRows.length;

  const winnerRows =
    validRows.filter(
      (row) =>
        row.winnerOfficial ||
        row.finishPositionOfficial ===
          1,
    );

  const wins =
    winnerRows.length;

  const roiComplete =
    winnerRows.every(
      (row) =>
        row.officialWinOddsDecimal !==
          null &&
        row.officialWinOddsDecimal >
          0,
    );

  if (!bets) {
    return {
      bets: 0,
      wins: 0,
      hitPercent: null,
      roiPercent: null,
      netSek: 0,
    };
  }

  const hitPercent =
    (wins / bets) * 100;

  if (!roiComplete) {
    return {
      bets,
      wins,
      hitPercent,
      roiPercent: null,
      netSek: null,
    };
  }

  const stakeSek =
    bets * 100;

  const returnSek =
    winnerRows.reduce(
      (sum, row) =>
        sum +
        100 *
          (
            row
              .officialWinOddsDecimal ??
            0
          ),
      0,
    );

  const netSek =
    returnSek -
    stakeSek;

  return {
    bets,
    wins,
    hitPercent,
    roiPercent:
      stakeSek > 0
        ? (
            netSek /
            stakeSek
          ) *
          100
        : null,
    netSek,
  };
}

function performanceRaceKey(
  raceDate: string,
  trackName: string,
  raceNumber: number,
): string {
  return [
    raceDate,
    trackName
      .trim()
      .toLowerCase(),
    raceNumber,
  ].join("|");
}

function summarizeGallopPerformanceWithLiveDate({
  rows,
  liveDate,
  dateFrom,
  dateTo,
  tracks,
  raceRunners,
  lockedSignals,
  minDropPercent,
  maxDropPercent,
  maxOdds,
  countryCode,
}: {
  rows: GallopHistoryRow[];
  liveDate: string;
  dateFrom?: string;
  dateTo?: string;
  tracks: GallopTrack[];
  raceRunners: RaceRunners;
  lockedSignals: GallopLockedSignals;
  minDropPercent: number;
  maxDropPercent?: number;
  maxOdds: number;
  countryCode?: string;
}): GallopPerformanceStats {
  const inRange = (
    raceDate: string,
  ) => {
    if (
      dateFrom &&
      raceDate < dateFrom
    ) {
      return false;
    }

    if (
      dateTo &&
      raceDate > dateTo
    ) {
      return false;
    }

    return true;
  };

  const historyRows =
    rows.filter(
      (row) => {
        if (
          !inRange(
            row.raceDate,
          )
        ) {
          return false;
        }

        if (
          countryCode &&
          row.countryCode
            .toUpperCase() !==
            countryCode
              .toUpperCase()
        ) {
          return false;
        }

        if (
          maxDropPercent !==
            undefined &&
          (
            row
              .oddsDropToLockPercent ===
              null ||
            row
              .oddsDropToLockPercent >=
              maxDropPercent
          )
        ) {
          return false;
        }

        return true;
      },
    );

  const historyByRace =
    new Map<
      string,
      GallopHistoryRow
    >();

  for (
    const row of historyRows
  ) {
    historyByRace.set(
      performanceRaceKey(
        row.raceDate,
        row.trackName,
        row.raceNumber,
      ),
      row,
    );
  }

  const liveRaceKeys =
    new Set<string>();

  const liveBets: {
    won: boolean;
    winOdds: number | null;
  }[] = [];

  /*
   * Lägg till färdiga LIVE-lopp för
   * det datum som visas.
   *
   * Finns samma lopp redan i historiken
   * ersätts historikraden av liveversionen
   * så loppet aldrig dubbelräknas.
   */
  if (
    inRange(
      liveDate,
    )
  ) {
    for (
      const track of tracks
    ) {
      if (
        countryCode &&
        track.countryCode
          .toUpperCase() !==
          countryCode
            .toUpperCase()
      ) {
        continue;
      }

      for (
        const race of
        track.races
      ) {
        const runners =
          raceRunners[
            raceKey(
              track.id,
              race.raceNumber,
            )
          ] ?? [];

        if (!runners.length) {
          continue;
        }

        const activeRunners =
          runners.filter(
            (runner) =>
              !runner.scratched,
          );

        const expectedResults =
          Math.min(
            3,
            activeRunners.length,
          );

        const resultCount =
          activeRunners.filter(
            (runner) =>
              runner.finishPosition !==
                null &&
              runner.finishPosition >=
                1 &&
              runner.finishPosition <=
                3,
          ).length;

        const isFinished =
          expectedResults > 0 &&
          resultCount >=
            expectedResults;

        if (!isFinished) {
          continue;
        }

        const signal =
          lockedSignals[
            lockedSignalKey(
              liveDate,
              track.id,
              race.raceNumber,
            )
          ];

        if (!signal) {
          continue;
        }

        const lockOdds =
          decimalOdds(
            signal.lockOddsRaw,
          );

        /*
         * Samma filter som
         * historikkorten använder nu.
         */
        const qualifiesNow =
          signal.samples >= 2 &&
          signal.dropPercent >=
            minDropPercent &&
          (
            maxDropPercent ===
              undefined ||
            signal.dropPercent <
              maxDropPercent
          ) &&
          lockOdds !== null &&
          lockOdds <=
            maxOdds;

        if (!qualifiesNow) {
          continue;
        }

        const lockedRunner =
          runners.find(
            (runner) =>
              runner.number ===
              signal.runnerNumber,
          );

        if (
          !lockedRunner ||
          lockedRunner.scratched
        ) {
          continue;
        }

        const winningRunner =
          activeRunners.find(
            (runner) =>
              runner.finishPosition ===
              1,
          ) ?? null;

        if (!winningRunner) {
          continue;
        }

        const key =
          performanceRaceKey(
            liveDate,
            track.name,
            race.raceNumber,
          );

        const historyMatch =
          historyByRace.get(
            key,
          );

        const won =
          winningRunner.number ===
          signal.runnerNumber;

        /*
         * Officiellt odds från historiken
         * är förstahandsval.
         *
         * Om loppet ännu inte hunnit
         * arkiveras används ATG:s odds
         * från det färdiga loppet.
         */
        const winOdds =
          won
            ? (
                historyMatch
                  ?.officialWinOddsDecimal ??
                decimalOdds(
                  lockedRunner
                    .oddsRaw,
                )
              )
            : null;

        liveRaceKeys.add(
          key,
        );

        liveBets.push({
          won,
          winOdds,
        });
      }
    }
  }

  const historyWithoutLive =
    historyRows.filter(
      (row) =>
        !liveRaceKeys.has(
          performanceRaceKey(
            row.raceDate,
            row.trackName,
            row.raceNumber,
          ),
        ),
    );

  const historical =
    summarizeGallopPerformance(
      historyWithoutLive,
    );

  const liveWins =
    liveBets.filter(
      (bet) =>
        bet.won,
    ).length;

  const bets =
    historical.bets +
    liveBets.length;

  const wins =
    historical.wins +
    liveWins;

  if (!bets) {
    return {
      bets: 0,
      wins: 0,
      hitPercent: null,
      roiPercent: null,
      netSek: 0,
    };
  }

  const hitPercent =
    (
      wins /
      bets
    ) *
    100;

  const liveOddsComplete =
    liveBets.every(
      (bet) =>
        !bet.won ||
        (
          bet.winOdds !==
            null &&
          bet.winOdds >
            0
        ),
    );

  if (
    historical.netSek ===
      null ||
    !liveOddsComplete
  ) {
    return {
      bets,
      wins,
      hitPercent,
      roiPercent: null,
      netSek: null,
    };
  }

  const historicalStake =
    historical.bets *
    100;

  const historicalReturn =
    historicalStake +
    historical.netSek;

  const liveReturn =
    liveBets.reduce(
      (sum, bet) =>
        sum +
        (
          bet.won
            ? 100 *
              (
                bet.winOdds ??
                0
              )
            : 0
        ),
      0,
    );

  const stakeSek =
    bets * 100;

  const returnSek =
    historicalReturn +
    liveReturn;

  const netSek =
    returnSek -
    stakeSek;

  return {
    bets,
    wins,
    hitPercent,
    netSek,
    roiPercent:
      (
        netSek /
        stakeSek
      ) *
      100,
  };
}

function formatSignedPercent(
  value: number | null,
): string {
  if (value === null) {
    return "–";
  }

  const rounded =
    Math.round(value);

  return `${
    rounded > 0 ? "+" : ""
  }${rounded} %`;
}

function formatSignedSek(
  value: number | null,
): string {
  if (value === null) {
    return "–";
  }

  const rounded =
    Math.round(value);

  return `${
    rounded > 0 ? "+" : ""
  }${rounded.toLocaleString(
    "sv-SE",
  )} kr`;
}

function performanceTone(
  value: number | null,
): string {
  if (value === null) {
    return "";
  }

  if (value > 0) {
    return "is-positive";
  }

  if (value < 0) {
    return "is-negative";
  }

  return "is-neutral";
}

function GallopPerformanceCard({
  label,
  stats,
  loading,
  error,
  className,
}: {
  label: string;
  stats: GallopPerformanceStats;
  loading: boolean;
  error: boolean;
  className: string;
}) {
  return (
    <div
      className={
        `gallop-performance-card ${className}`
      }
    >
      <span>
        {label}
      </span>

      <strong
        className={
          performanceTone(
            stats.roiPercent,
          )
        }
      >
        {loading
          ? "Hämtar…"
          : error
            ? "ROI –"
            : `ROI ${formatSignedPercent(
                stats.roiPercent,
              )}`}
      </strong>

      <div className="gallop-performance-meta">
        <small>
          {loading
            ? "100 kr vinnare"
            : error
              ? "Statistik saknas"
              : `${formatSignedSek(
                  stats.netSek,
                )} · ${stats.bets} spel`}
        </small>

        <small>
          {!loading &&
          !error
            ? `${stats.wins} vinnare · ${
                stats.hitPercent === null
                  ? "–"
                  : `${Math.round(
                      stats.hitPercent,
                    )} %`
              }`
            : "Mest sänkta"}
        </small>
      </div>
    </div>
  );
}

type Props = {
  date: string;
};

export function GallopTodayPanel({
  date,
}: Props) {
  const [
    tracks,
    setTracks,
  ] = useState<
    GallopTrack[]
  >([]);

  const [
    selectedTrackId,
    setSelectedTrackId,
  ] = useState<
    number | null
  >(null);

  const [
    selectedTimelineRaceKey,
    setSelectedTimelineRaceKey,
  ] = useState<
    string | null
  >(null);

  const [
    raceRunners,
    setRaceRunners,
  ] = useState<
    RaceRunners
  >({});

  const [
    oddsMemory,
    setOddsMemory,
  ] = useState<
    OddsMemoryByRunner
  >({});

  const oddsMemoryRef =
    useRef<OddsMemoryByRunner>(
      {},
    );

  const [
    expandedRaceKeys,
    setExpandedRaceKeys,
  ] = useState<
    Record<string, boolean>
  >({});

  const [
    lockedSignals,
    setLockedSignals,
  ] = useState<
    GallopLockedSignals
  >({});

  const [
    loadingCalendar,
    setLoadingCalendar,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    updatedAt,
    setUpdatedAt,
  ] = useState<
    number | null
  >(null);

  const [
    minDropPercent,
    setMinDropPercent,
  ] = useState(
    () => {
      try {
        const raw =
          window.localStorage
            .getItem(
              SETTINGS_KEY,
            );

        if (!raw) {
          return 10;
        }

        const parsed =
          JSON.parse(
            raw,
          ) as {
            minDropPercent?: number;
          };

        return (
          Number.isFinite(
            parsed
              .minDropPercent,
          )
            ? parsed
                .minDropPercent!
            : 10
        );
      } catch {
        return 10;
      }
    },
  );

  const [
    maxOdds,
    setMaxOdds,
  ] = useState(
    () => {
      try {
        const raw =
          window.localStorage
            .getItem(
              SETTINGS_KEY,
            );

        if (!raw) {
          return 20;
        }

        const parsed =
          JSON.parse(
            raw,
          ) as {
            maxOdds?: number;
          };

        return (
          Number.isFinite(
            parsed.maxOdds,
          )
            ? parsed.maxOdds!
            : 20
        );
      } catch {
        return 20;
      }
    },
  );

  const [
    performanceRows,
    setPerformanceRows,
  ] = useState<
    GallopHistoryRow[]
  >([]);

  const [
    timelineResultRows,
    setTimelineResultRows,
  ] = useState<
    GallopHistoryRow[]
  >([]);

  const [
    performanceLoading,
    setPerformanceLoading,
  ] = useState(true);

  const [
    performanceError,
    setPerformanceError,
  ] = useState(false);

  const [
    t90SwedenRows,
    setT90SwedenRows,
  ] = useState<
    GallopHistoryRow[]
  >([]);

  const [
    t90SwedenLoading,
    setT90SwedenLoading,
  ] = useState(true);

  const [
    t90SwedenError,
    setT90SwedenError,
  ] = useState(false);

  const [
    showRuleDetails,
    setShowRuleDetails,
  ] = useState(false);

  useEffect(
    () => {
      let cancelled =
        false;

      const timer =
        window.setTimeout(
          () => {
            async function loadPerformance() {
              setPerformanceLoading(
                true,
              );

              setPerformanceError(
                false,
              );

              try {
                const options =
                  await loadGallopHistoryOptions();

                const historyStart =
                  options.minDate &&
                  options.minDate <= date
                    ? options.minDate
                    : date;

                const rows =
                  await loadGallopHistoryRows(
                    {
                      dateFrom:
                        historyStart,

                      dateTo:
                        date,

                      selection:
                        "S1",

                      countryCode:
                        "",

                      trackName:
                        "",

                      surface:
                        "",

                      distanceMeters:
                        null,

                      minStarters:
                        null,

                      maxStarters:
                        null,

                      minHandicapRating:
                        null,

                      maxHandicapRating:
                        null,

                      handicapRank:
                        "",

                      minCarriedWeightKg:
                        null,

                      maxCarriedWeightKg:
                        null,

                      weightRank:
                        "",

                      minDropPercent,

                      maxDropPercent:
                        null,

                      minLockOdds:
                        null,

                      maxLockOdds:
                        maxOdds,

                      limit:
                        10000,
                    },
                  );

                if (cancelled) {
                  return;
                }

                setPerformanceRows(
                  rows,
                );
              } catch (
                statsError
              ) {
                if (cancelled) {
                  return;
                }

                console.error(
                  "Kunde inte läsa Galopp-resultatstatistik",
                  statsError,
                );

                setPerformanceRows(
                  [],
                );

                setPerformanceError(
                  true,
                );
              } finally {
                if (
                  !cancelled
                ) {
                  setPerformanceLoading(
                    false,
                  );
                }
              }
            }

            void loadPerformance();
          },
          300,
        );

      return () => {
        cancelled = true;

        window.clearTimeout(
          timer,
        );
      };
    },
    [
      date,
      minDropPercent,
      maxOdds,
    ],
  );


  /*
   * Resultatrader till desktop-tidslinjen.
   *
   * Hämtas separat utan spel-filter så
   * varje lopps S1-häst kan visa placering,
   * även när loppet inte blev ett spel.
   */
  useEffect(
    () => {
      let cancelled =
        false;

      setTimelineResultRows(
        [],
      );

      async function loadTimelineResults() {
        try {
          const rows =
            await loadGallopHistoryRows(
              {
                dateFrom:
                  date,

                dateTo:
                  date,

                selection:
                  "S1",

                countryCode:
                  "",

                trackName:
                  "",

                surface:
                  "",

                distanceMeters:
                  null,

                minStarters:
                  null,

                maxStarters:
                  null,

                minHandicapRating:
                  null,

                maxHandicapRating:
                  null,

                handicapRank:
                  "",

                minCarriedWeightKg:
                  null,

                maxCarriedWeightKg:
                  null,

                weightRank:
                  "",

                minDropPercent:
                  null,

                maxDropPercent:
                  null,

                minLockOdds:
                  null,

                maxLockOdds:
                  null,

                limit:
                  1000,
              },
            );

          if (
            !cancelled
          ) {
            setTimelineResultRows(
              rows,
            );
          }
        } catch (
          timelineError
        ) {
          console.warn(
            "Kunde inte läsa resultat till galopptidslinjen",
            timelineError,
          );
        }
      }

      void loadTimelineResults();

      const timer =
        window.setInterval(
          () => {
            void loadTimelineResults();
          },
          60_000,
        );

      return () => {
        cancelled = true;

        window.clearInterval(
          timer,
        );
      };
    },
    [date],
  );


  useEffect(
    () => {
      let cancelled =
        false;

      if (
        date <
        T90_SWEDEN_START_DATE
      ) {
        setT90SwedenRows([]);
        setT90SwedenLoading(false);
        setT90SwedenError(false);

        return () => {
          cancelled = true;
        };
      }

      const timer =
        window.setTimeout(
          () => {
            async function loadT90Sweden() {
              setT90SwedenLoading(
                true,
              );

              setT90SwedenError(
                false,
              );

              try {
                const rows =
                  await loadGallopHistoryRows(
                    {
                      dateFrom:
                        T90_SWEDEN_START_DATE,

                      dateTo:
                        date,

                      selection:
                        "S1",

                      countryCode:
                        "SE",

                      trackName:
                        "",

                      surface:
                        "",

                      distanceMeters:
                        null,

                      minStarters:
                        null,

                      maxStarters:
                        null,

                      minHandicapRating:
                        null,

                      maxHandicapRating:
                        null,

                      handicapRank:
                        "",

                      minCarriedWeightKg:
                        null,

                      maxCarriedWeightKg:
                        null,

                      weightRank:
                        "",

                      minDropPercent:
                        T90_SWEDEN_MIN_DROP_PERCENT,

                      /*
                       * RPC-filtret är inkluderande.
                       * Vi hämtar därför upp till 40
                       * och gör <40 exakt härunder.
                       */
                      maxDropPercent:
                        T90_SWEDEN_MAX_DROP_PERCENT,

                      minLockOdds:
                        null,

                      maxLockOdds:
                        null,

                      limit:
                        10000,
                    },
                  );

                if (cancelled) {
                  return;
                }

                setT90SwedenRows(
                  rows.filter(
                    (row) =>
                      row.raceDate >=
                        T90_SWEDEN_START_DATE &&
                      row.countryCode ===
                        "SE" &&
                      row
                        .oddsDropToLockPercent !==
                        null &&
                      row
                        .oddsDropToLockPercent >=
                        T90_SWEDEN_MIN_DROP_PERCENT &&
                      row
                        .oddsDropToLockPercent <
                        T90_SWEDEN_MAX_DROP_PERCENT,
                  ),
                );
              } catch (
                challengeError
              ) {
                if (cancelled) {
                  return;
                }

                console.error(
                  "Kunde inte läsa T90 Sverige 25-40",
                  challengeError,
                );

                setT90SwedenRows([]);
                setT90SwedenError(true);
              } finally {
                if (!cancelled) {
                  setT90SwedenLoading(
                    false,
                  );
                }
              }
            }

            void loadT90Sweden();
          },
          350,
        );

      return () => {
        cancelled = true;

        window.clearTimeout(
          timer,
        );
      };
    },
    [date],
  );

  useEffect(
    () => {
      try {
        window.localStorage
          .setItem(
            SETTINGS_KEY,
            JSON.stringify({
              minDropPercent,
              maxOdds,
            }),
          );
      } catch (storageError) {
        console.warn(
          "Kunde inte spara Gallop-inställningar lokalt",
          storageError,
        );
      }
    },
    [
      minDropPercent,
      maxOdds,
    ],
  );


  useEffect(
    () => {
      oddsMemoryRef.current =
        oddsMemory;
    },
    [oddsMemory],
  );

  useEffect(
    () => {
      let cancelled =
        false;

      async function load() {
        setLoadingCalendar(
          true,
        );

        setError("");

        setRaceRunners({});
        setOddsMemory({});

        try {
          const response =
            await fetch(
              `${API}/calendar/day/${date}`,
              {
                cache:
                  "no-store",
              },
            );

          if (!response.ok) {
            throw new Error(
              `ATG svarade ${response.status}`,
            );
          }

          const data:
            unknown =
            await response
              .json();

          const parsed =
            parseGallopTracks(
              data,
            );

          if (cancelled) {
            return;
          }

          setTracks(
            parsed,
          );

          setSelectedTrackId(
            (current) =>
              parsed.some(
                (track) =>
                  track.id ===
                  current,
              )
                ? current
                : (
                    parsed[0]
                      ?.id ??
                    null
                  ),
          );
        } catch (
          loadError
        ) {
          if (cancelled) {
            return;
          }

          setTracks([]);

          setSelectedTrackId(
            null,
          );

          setError(
            loadError instanceof
              Error
              ? loadError
                  .message
              : "Kunde inte hämta galoppkalendern.",
          );
        } finally {
          if (
            !cancelled
          ) {
            setLoadingCalendar(
              false,
            );
          }
        }
      }

      void load();

      return () => {
        cancelled = true;
      };
    },
    [date],
  );

  const selectedTrack =
    useMemo(
      () =>
        tracks.find(
          (track) =>
            track.id ===
            selectedTrackId,
        ) ??
        null,
      [
        tracks,
        selectedTrackId,
      ],
    );


  const timelineRaces =
    useMemo<
      GallopTimelineRace[]
    >(
      () =>
        tracks
          .flatMap(
            (track) =>
              track.races.map(
                (race) => {
                  const parsedStartMs =
                    race.startTime
                      ? Date.parse(
                          race.startTime,
                        )
                      : Number.NaN;

                  return {
                    key:
                      raceKey(
                        track.id,
                        race.raceNumber,
                      ),

                    track,
                    race,

                    startMs:
                      Number.isFinite(
                        parsedStartMs,
                      )
                        ? parsedStartMs
                        : null,
                  };
                },
              ),
          )
          .sort(
            (a, b) => {
              const aStart =
                a.startMs ??
                Number.POSITIVE_INFINITY;

              const bStart =
                b.startMs ??
                Number.POSITIVE_INFINITY;

              return (
                aStart -
                  bStart ||
                a.track.name
                  .localeCompare(
                    b.track.name,
                    "sv",
                  ) ||
                a.race
                  .raceNumber -
                  b.race
                    .raceNumber
              );
            },
          ),
      [tracks],
    );


  const timelineResultByRace =
    useMemo(
      () => {
        const byRace =
          new Map<
            string,
            GallopHistoryRow
          >();

        for (
          const row of
          timelineResultRows
        ) {
          byRace.set(
            performanceRaceKey(
              row.raceDate,
              row.trackName,
              row.raceNumber,
            ),
            row,
          );
        }

        return byRace;
      },
      [
        timelineResultRows,
      ],
    );


  const nextTimelineRace =
    useMemo(
      () => {
        const now =
          Date.now();

        return (
          timelineRaces.find(
            (item) =>
              item.startMs !==
                null &&
              item.startMs >
                now,
          ) ??
          null
        );
      },
      [
        timelineRaces,
        updatedAt,
      ],
    );


  const selectedTimelineRace =
    useMemo(
      () =>
        timelineRaces.find(
          (item) =>
            item.key ===
            selectedTimelineRaceKey,
        ) ??
        nextTimelineRace ??
        timelineRaces[
          timelineRaces.length -
            1
        ] ??
        null,
      [
        timelineRaces,
        selectedTimelineRaceKey,
        nextTimelineRace,
      ],
    );


  useEffect(
    () => {
      if (
        !selectedTimelineRace
      ) {
        return;
      }

      setSelectedTrackId(
        (current) =>
          current ===
          selectedTimelineRace
            .track.id
            ? current
            : selectedTimelineRace
                .track.id,
      );
    },
    [selectedTimelineRace],
  );

  useEffect(
    () => {
      if (
        !selectedTrack
      ) {
        return;
      }

      const track = selectedTrack;

      let cancelled =
        false;

      async function refresh() {
        setRefreshing(
          true,
        );

        try {
          const results =
            await Promise.all(
              track
                .races
                .map(
                  async (
                    race,
                  ) => {
                    const gameId =
                      `vinnare_${date}_${track.id}_${race.raceNumber}`;

                    const historyParams =
                      new URLSearchParams({
                        date,
                        trackId:
                          String(
                            track.id,
                          ),
                        raceNumber:
                          String(
                            race.raceNumber,
                          ),
                      });

                    try {
                      const [
                        raceResponse,
                        historyResponse,
                      ] =
                        await Promise.all([
                          fetch(
                            `${API}/games/${gameId}`,
                            {
                              cache:
                                "no-store",
                            },
                          ),

                          fetch(
                            `${PLACE_HISTORY_API}?${historyParams.toString()}`,
                            {
                              cache:
                                "no-store",
                            },
                          ).catch(
                            () => null,
                          ),
                        ]);

                      const raceData:
                        unknown =
                        raceResponse.ok
                          ? await raceResponse
                              .json()
                          : null;

                      const historyData =
                        historyResponse?.ok
                          ? await historyResponse
                              .json()
                              .catch(
                                () => null,
                              ) as
                                ServerOddsHistoryResponse | null
                          : null;

                      const startMs =
                        race.startTime
                          ? new Date(
                              race.startTime,
                            ).getTime()
                          : Number.NaN;

                      const historyStartMs =
                        Number.isFinite(
                          startMs,
                        )
                          ? startMs -
                            60 *
                              60_000
                          : null;

                      const serverWinPoints =
                        historyData?.ok &&
                        Array.isArray(
                          historyData.points,
                        )
                          ? historyData.points
                              .filter(
                                (
                                  point,
                                ) => {
                                  if (
                                    point.market !==
                                      "WIN" ||
                                    !Number.isFinite(
                                      point.oddsDecimal,
                                    ) ||
                                    point.oddsDecimal <=
                                      0
                                  ) {
                                    return false;
                                  }

                                  const pointMs =
                                    Date.parse(
                                      point.pointTs,
                                    );

                                  if (
                                    !Number.isFinite(
                                      pointMs,
                                    )
                                  ) {
                                    return false;
                                  }

                                  if (
                                    historyStartMs !==
                                      null
                                  ) {
                                    return (
                                      pointMs >=
                                        historyStartMs &&
                                      pointMs <
                                        startMs
                                    );
                                  }

                                  return true;
                                },
                              )
                              .sort(
                                (
                                  a,
                                  b,
                                ) =>
                                  Date.parse(
                                    a.pointTs,
                                  ) -
                                  Date.parse(
                                    b.pointTs,
                                  ),
                              )
                          : [];

                      return {
                        race,

                        runners:
                          raceData
                            ? parseRunners(
                                raceData,
                              )
                            : [],

                        serverWinPoints,
                      };
                    } catch {
                      return {
                        race,
                        runners:
                          [] as GallopRunner[],
                        serverWinPoints:
                          [] as ServerOddsPoint[],
                      };
                    }
                  },
                ),
            );

          if (cancelled) {
            return;
          }

          setRaceRunners(
            (current) => {
              const next = {
                ...current,
              };

              for (
                const result of
                results
              ) {
                next[
                  raceKey(
                    track.id,
                    result
                      .race
                      .raceNumber,
                  )
                ] =
                  result.runners;
              }

              return next;
            },
          );

          setOddsMemory(
            (current) => {
              const next = {
                ...current,
              };

              const collectionNowMs =
                Date.now();

              for (
                const result of
                results
              ) {
                const resultStartMs =
                  result.race.startTime
                    ? new Date(
                        result.race.startTime,
                      ).getTime()
                    : Number.NaN;

                const collectionStartMs =
                  Number.isFinite(
                    resultStartMs,
                  )
                    ? resultStartMs -
                      60 * 60_000
                    : null;

                const collectionNotStarted =
                  collectionStartMs !==
                    null &&
                  collectionNowMs <
                    collectionStartMs;

                for (
                  const runner of
                  result.runners
                ) {
                  if (
                    runner.scratched ||
                    runner.oddsRaw ===
                      null ||
                    runner.oddsRaw <=
                      0
                  ) {
                    continue;
                  }

                  const key =
                    runnerKey(
                      date,
                      track.id,
                      result
                        .race
                        .raceNumber,
                      runner.number,
                    );

                  if (
                    collectionNotStarted
                  ) {
                    /*
                     * V1 mäter bara sista
                     * 60 minuterna.
                     * Äldre lokal browserdata
                     * får inte bli startodds.
                     */
                    delete next[key];
                    continue;
                  }

                  const previous =
                    next[key];

                  const runnerLockMs =
                    Number.isFinite(
                      resultStartMs,
                    )
                      ? resultStartMs -
                        (
                          isGallopT1ShadowRace({
                            date,
                            countryCode:
                              track.countryCode,
                            sport:
                              "GALLOP",
                          })
                            ? GALLOP_T1_LOCK_TARGET_SECONDS
                            : 90
                        ) *
                          1_000
                      : null;

                  const runnerLockPassed =
                    runnerLockMs !==
                      null &&
                    collectionNowMs >=
                      runnerLockMs;

                  const serverPoints =
                    result
                      .serverWinPoints
                      .filter(
                        (point) => {
                          if (
                            point.runnerNumber !==
                            runner.number
                          ) {
                            return false;
                          }

                          if (
                            !runnerLockPassed ||
                            runnerLockMs ===
                              null
                          ) {
                            return true;
                          }

                          const pointMs =
                            Date.parse(
                              point.pointTs,
                            );

                          return (
                            Number.isFinite(
                              pointMs,
                            ) &&
                            pointMs <=
                              runnerLockMs +
                                GALLOP_T1_CAPTURE_TOLERANCE_SECONDS *
                                  1_000
                          );
                        },
                      );

                  const firstServerPoint =
                    serverPoints[0] ??
                    null;

                  const lastServerPoint =
                    serverPoints[
                      serverPoints.length -
                        1
                    ] ??
                    null;

                  if (
                    firstServerPoint &&
                    lastServerPoint
                  ) {
                    next[key] = {
                      firstOddsRaw:
                        Math.round(
                          firstServerPoint
                            .oddsDecimal *
                            100,
                        ),

                      /*
                       * Samma centrala oddsström ska styra
                       * både livekandidaten och det slutliga
                       * T-90-låset.
                       *
                       * Annars kan användaren se en häst
                       * precis före T-90 och få en annan
                       * registrerad som låst.
                       */
                      currentOddsRaw:
                        Math.round(
                          lastServerPoint
                            .oddsDecimal *
                            100,
                        ),

                      samples:
                        Math.max(
                          serverPoints.length,
                          previous
                            ?.samples ??
                            0,
                        ),
                    };

                    continue;
                  }

                  next[key] = {
                    firstOddsRaw:
                      previous
                        ?.firstOddsRaw ??
                      runner.oddsRaw,

                    currentOddsRaw:
                      runner.oddsRaw,

                    samples:
                      (
                        previous
                          ?.samples ??
                        0
                      ) + 1,
                  };
                }
              }

              return next;
            },
          );

          const lockNowMs =
            Date.now();

          setLockedSignals(
            (current) => {
              let changed =
                false;

              const next = {
                ...current,
              };

              for (
                const result of
                results
              ) {
                if (
                  !result.race
                    .startTime
                ) {
                  continue;
                }

                const startMs =
                  new Date(
                    result.race
                      .startTime,
                  ).getTime();

                if (
                  !Number.isFinite(
                    startMs,
                  )
                ) {
                  continue;
                }

                const lockMs =
                  startMs -
                  90_000;

                if (
                  lockNowMs <
                  lockMs
                ) {
                  continue;
                }

                const signalKey =
                  lockedSignalKey(
                    date,
                    track.id,
                    result.race
                      .raceNumber,
                  );

                const windowStartMs =
                  startMs -
                  60 *
                    60_000;

                const rows =
                  result.runners
                    .filter(
                      (runner) =>
                        !runner
                          .scratched,
                    )
                    .map(
                      (runner) => {
                        const points =
                          result
                            .serverWinPoints
                            .filter(
                              (
                                point,
                              ) => {
                                if (
                                  point.runnerNumber !==
                                    runner.number ||
                                  point.market !==
                                    "WIN"
                                ) {
                                  return false;
                                }

                                const pointMs =
                                  Date.parse(
                                    point.pointTs,
                                  );

                                return (
                                  Number.isFinite(
                                    pointMs,
                                  ) &&
                                  pointMs >=
                                    windowStartMs &&
                                  pointMs <=
                                    lockMs
                                );
                              },
                            )
                            .sort(
                              (
                                a,
                                b,
                              ) =>
                                Date.parse(
                                  a.pointTs,
                                ) -
                                Date.parse(
                                  b.pointTs,
                                ),
                            );

                        if (
                          points.length
                        ) {
                          const first =
                            points[0];

                          const last =
                            points[
                              points.length -
                                1
                            ];

                          const firstRaw =
                            Math.round(
                              first
                                .oddsDecimal *
                                100,
                            );

                          const lockRaw =
                            Math.round(
                              last
                                .oddsDecimal *
                                100,
                            );

                          if (
                            firstRaw <=
                              0 ||
                            lockRaw <=
                              0
                          ) {
                            return null;
                          }

                          return {
                            runner,

                            firstOddsRaw:
                              firstRaw,

                            lockOddsRaw:
                              lockRaw,

                            samples:
                              points.length,

                            dropPercent:
                              (
                                (
                                  firstRaw -
                                  lockRaw
                                ) /
                                firstRaw
                              ) *
                              100,
                          };
                        }

                        return null;
                      },
                    )
                    .filter(
                      (
                        row,
                      ): row is {
                        runner: GallopRunner;
                        firstOddsRaw: number;
                        lockOddsRaw: number;
                        samples: number;
                        dropPercent: number;
                      } =>
                        row !==
                        null,
                    )
                    .sort(
                      (
                        a,
                        b,
                      ) =>
                        b.dropPercent -
                          a.dropPercent ||
                        a.lockOddsRaw -
                          b.lockOddsRaw ||
                        a.runner.number -
                          b.runner.number,
                    );

                const winner =
                  rows[0];

                if (!winner) {
                  continue;
                }

                const lockOdds =
                  decimalOdds(
                    winner
                      .lockOddsRaw,
                  );

                next[
                  signalKey
                ] = {
                  runnerNumber:
                    winner
                      .runner
                      .number,

                  runnerName:
                    winner
                      .runner
                      .name,

                  firstOddsRaw:
                    winner
                      .firstOddsRaw,

                  lockOddsRaw:
                    winner
                      .lockOddsRaw,

                  dropPercent:
                    winner
                      .dropPercent,

                  samples:
                    winner.samples,

                  lockedAtMs:
                    lockMs,

                  minDropPercent,
                  maxOdds,

                  qualifies:
                    winner.samples >=
                      2 &&
                    winner
                      .dropPercent >=
                      minDropPercent &&
                    lockOdds !==
                      null &&
                    lockOdds <=
                      maxOdds,
                };

                changed =
                  true;
              }

              return changed
                ? next
                : current;
            },
          );

          setUpdatedAt(
            Date.now(),
          );
        } finally {
          if (
            !cancelled
          ) {
            setRefreshing(
              false,
            );
          }
        }
      }

      void refresh();

      const timer =
        window.setInterval(
          () => {
            void refresh();
          },
          60_000,
        );

      return () => {
        cancelled = true;

        window.clearInterval(
          timer,
        );
      };
    },
    [
      date,
      selectedTrack,
    ],
  );

  const totalRaces =
    useMemo(
      () =>
        tracks.reduce(
          (
            sum,
            track,
          ) =>
            sum +
            track.races
              .length,
          0,
        ),
      [tracks],
    );

  const countries =
    useMemo(
      () =>
        new Set(
          tracks.map(
            (track) =>
              track.countryCode,
          ),
        ).size,
      [tracks],
    );

  const todayPerformance =
    useMemo(
      () =>
        summarizeGallopPerformanceWithLiveDate({
          rows:
            performanceRows,

          liveDate:
            date,

          dateFrom:
            date,

          dateTo:
            date,

          tracks,
          raceRunners,
          lockedSignals,
          minDropPercent,
          maxOdds,
        }),
      [
        performanceRows,
        date,
        tracks,
        raceRunners,
        lockedSignals,
        minDropPercent,
        maxOdds,
      ],
    );

  const sevenDayPerformance =
    useMemo(
      () =>
        summarizeGallopPerformanceWithLiveDate({
          rows:
            performanceRows,

          liveDate:
            date,

          dateFrom:
            shiftIsoDate(
              date,
              -6,
            ),

          dateTo:
            date,

          tracks,
          raceRunners,
          lockedSignals,
          minDropPercent,
          maxOdds,
        }),
      [
        performanceRows,
        date,
        tracks,
        raceRunners,
        lockedSignals,
        minDropPercent,
        maxOdds,
      ],
    );

  const allTimePerformance =
    useMemo(
      () =>
        summarizeGallopPerformanceWithLiveDate({
          rows:
            performanceRows,

          liveDate:
            date,

          tracks,
          raceRunners,
          lockedSignals,
          minDropPercent,
          maxOdds,
        }),
      [
        performanceRows,
        date,
        tracks,
        raceRunners,
        lockedSignals,
        minDropPercent,
        maxOdds,
      ],
    );


  const t90SwedenSevenDayFrom =
    shiftIsoDate(
      date,
      -6,
    ) <
    T90_SWEDEN_START_DATE
      ? T90_SWEDEN_START_DATE
      : shiftIsoDate(
          date,
          -6,
        );

  const t90SwedenTodayPerformance =
    useMemo(
      () =>
        summarizeGallopPerformanceWithLiveDate({
          rows:
            t90SwedenRows,

          liveDate:
            date,

          dateFrom:
            date <
            T90_SWEDEN_START_DATE
              ? T90_SWEDEN_START_DATE
              : date,

          dateTo:
            date,

          tracks,
          raceRunners,
          lockedSignals,

          minDropPercent:
            T90_SWEDEN_MIN_DROP_PERCENT,

          maxDropPercent:
            T90_SWEDEN_MAX_DROP_PERCENT,

          maxOdds:
            Number.POSITIVE_INFINITY,

          countryCode:
            "SE",
        }),
      [
        t90SwedenRows,
        date,
        tracks,
        raceRunners,
        lockedSignals,
      ],
    );

  const t90SwedenSevenDayPerformance =
    useMemo(
      () =>
        summarizeGallopPerformanceWithLiveDate({
          rows:
            t90SwedenRows,

          liveDate:
            date,

          dateFrom:
            t90SwedenSevenDayFrom,

          dateTo:
            date,

          tracks,
          raceRunners,
          lockedSignals,

          minDropPercent:
            T90_SWEDEN_MIN_DROP_PERCENT,

          maxDropPercent:
            T90_SWEDEN_MAX_DROP_PERCENT,

          maxOdds:
            Number.POSITIVE_INFINITY,

          countryCode:
            "SE",
        }),
      [
        t90SwedenRows,
        date,
        t90SwedenSevenDayFrom,
        tracks,
        raceRunners,
        lockedSignals,
      ],
    );

  const t90SwedenAllTimePerformance =
    useMemo(
      () =>
        summarizeGallopPerformanceWithLiveDate({
          rows:
            t90SwedenRows,

          liveDate:
            date,

          dateFrom:
            T90_SWEDEN_START_DATE,

          dateTo:
            date,

          tracks,
          raceRunners,
          lockedSignals,

          minDropPercent:
            T90_SWEDEN_MIN_DROP_PERCENT,

          maxDropPercent:
            T90_SWEDEN_MAX_DROP_PERCENT,

          maxOdds:
            Number.POSITIVE_INFINITY,

          countryCode:
            "SE",
        }),
      [
        t90SwedenRows,
        date,
        tracks,
        raceRunners,
        lockedSignals,
      ],
    );

  return (
    <section className="gallop-live-shell">
      <div className="gallop-live-hero">
        <div className="gallop-live-intro">
          <div className="gallop-live-kicker-row">
            <p className="gallop-live-kicker">
              GALOPP · LIVE V1
            </p>

            <button
              type="button"
              className="gallop-rule-trigger"
              aria-expanded={
                showRuleDetails
              }
              onClick={() =>
                setShowRuleDetails(
                  (current) =>
                    !current,
                )
              }
            >
              ⓘ Regel
            </button>
          </div>

          <h2>
            🏇 Galopp idag
          </h2>

          <p>
            Dagens galoppbanor från ATG.
            Följ Mest sänkta från första
            odds till låst signal.
          </p>
        </div>

        <div className="gallop-live-counts">
          <div>
            <span>
              Banor
            </span>

            <strong>
              {tracks.length}
            </strong>
          </div>

          <div>
            <span>
              Lopp
            </span>

            <strong>
              {totalRaces}
            </strong>
          </div>

          <div>
            <span>
              Länder
            </span>

            <strong>
              {countries}
            </strong>
          </div>
        </div>
      </div>

      <section className="gallop-performance-section">
        <div className="gallop-performance-heading">
          <span>
            RESULTAT · MEST SÄNKTA
          </span>

          <small>
            100 kr vinnare per kvalificerad signal
          </small>
        </div>

        <div className="gallop-performance-grid">
          <GallopPerformanceCard
            label="Idag"
            stats={
              todayPerformance
            }
            loading={
              performanceLoading
            }
            error={
              performanceError
            }
            className="gallop-stat-today"
          />

          <GallopPerformanceCard
            label="7 dagar"
            stats={
              sevenDayPerformance
            }
            loading={
              performanceLoading
            }
            error={
              performanceError
            }
            className="gallop-stat-week"
          />

          <GallopPerformanceCard
            label="Från start"
            stats={
              allTimePerformance
            }
            loading={
              performanceLoading
            }
            error={
              performanceError
            }
            className="gallop-stat-all"
          />
        </div>
      </section>


      <section className="gallop-performance-section">
        <div className="gallop-performance-heading">
          <span>
            🎯 T90 SVERIGE 25–40
          </span>

          <small>
            Fryst regel · 100 kr vinnare · prospektivt från 18 aug
          </small>
        </div>

        <div className="gallop-performance-grid">
          <GallopPerformanceCard
            label="Idag"
            stats={
              t90SwedenTodayPerformance
            }
            loading={
              t90SwedenLoading
            }
            error={
              t90SwedenError
            }
            className="gallop-stat-today"
          />

          <GallopPerformanceCard
            label="7 dagar"
            stats={
              t90SwedenSevenDayPerformance
            }
            loading={
              t90SwedenLoading
            }
            error={
              t90SwedenError
            }
            className="gallop-stat-week"
          />

          <GallopPerformanceCard
            label="Från 18 aug"
            stats={
              t90SwedenAllTimePerformance
            }
            loading={
              t90SwedenLoading
            }
            error={
              t90SwedenError
            }
            className="gallop-stat-all"
          />
        </div>
      </section>

      {showRuleDetails ? (
        <div className="gallop-rule-drawer">
          <div className="gallop-rule-drawer-copy">
            <small>
              GALOPP V1
            </small>

            <strong>
              Mest sänkta häst
            </strong>

            <p>
              Oddsinsamling under loppets
              sista 60 minuter. Mest sänkta
              häst låses vid T−90.
              Resultaten ovan räknas med
              100 kr vinnare.
            </p>
          </div>

          <label>
            Minsta sänkning

            <div>
              <input
                type="number"
                min="0"
                step="1"
                value={
                  minDropPercent
                }
                onChange={(
                  event,
                ) =>
                  setMinDropPercent(
                    Math.max(
                      0,
                      Number(
                        event
                          .target
                          .value,
                      ) || 0,
                    ),
                  )
                }
              />

              <span>
                %
              </span>
            </div>
          </label>

          <label>
            Maxodds

            <input
              type="number"
              min="1"
              step="0.5"
              value={
                maxOdds
              }
              onChange={(
                event,
              ) =>
                setMaxOdds(
                  Math.max(
                    1,
                    Number(
                      event
                        .target
                        .value,
                    ) || 1,
                  ),
                )
              }
            />
          </label>

          <button
            type="button"
            className="gallop-rule-close"
            onClick={() =>
              setShowRuleDetails(
                false,
              )
            }
          >
            Stäng
          </button>
        </div>
      ) : null}

      {loadingCalendar ? (
        <div className="gallop-live-message">
          Hämtar dagens
          galoppbanor…
        </div>
      ) : null}

      {error ? (
        <div className="gallop-live-error">
          {error}
        </div>
      ) : null}

      {!loadingCalendar &&
      !error &&
      !tracks.length ? (
        <div className="gallop-live-message">
          Inga galoppbanor hittades
          för valt datum.
        </div>
      ) : null}

      {tracks.length ? (
        <>
          <section
            className="gallop-desktop-timeline"
            aria-label="Dagens galopplopp i tidsordning"
          >
            <div className="gallop-timeline-head">
              <div>
                <small>
                  DAGENS LOPP
                </small>

                <strong>
                  Alla banor i tidsordning
                </strong>
              </div>

              <span>
                {
                  timelineRaces
                    .length
                }{" "}
                lopp · klicka för data
              </span>
            </div>

            <div className="gallop-timeline-rail">
              {timelineRaces.map(
                (item) => {
                  const isSelected =
                    selectedTimelineRace
                      ?.key ===
                    item.key;

                  const isNext =
                    nextTimelineRace
                      ?.key ===
                    item.key;

                  const isPast =
                    item.startMs !==
                      null &&
                    item.startMs <=
                      Date.now();

                  const historyResult =
                    timelineResultByRace.get(
                      performanceRaceKey(
                        date,
                        item.track.name,
                        item.race
                          .raceNumber,
                      ),
                    ) ??
                    null;

                  /*
                   * Live-fallback:
                   * vald bana kan få ATG-resultatet
                   * innan historikraden hunnit sparas.
                   */
                  const timelineRunners =
                    raceRunners[
                      item.key
                    ] ?? [];

                  const timelineSignal =
                    lockedSignals[
                      lockedSignalKey(
                        date,
                        item.track.id,
                        item.race
                          .raceNumber,
                      )
                    ] ??
                    null;

                  const liveResultRunner =
                    timelineSignal
                      ? (
                          timelineRunners.find(
                            (runner) =>
                              runner.number ===
                              timelineSignal
                                .runnerNumber,
                          ) ??
                          null
                        )
                      : null;

                  const activeRunnerCount =
                    timelineRunners.filter(
                      (runner) =>
                        !runner.scratched,
                    ).length;

                  const liveTop3Count =
                    timelineRunners.filter(
                      (runner) =>
                        typeof runner
                          .finishPosition ===
                          "number" &&
                        runner
                          .finishPosition >=
                          1 &&
                        runner
                          .finishPosition <=
                          3,
                    ).length;

                  const expectedTopResults =
                    Math.min(
                      3,
                      activeRunnerCount,
                    );

                  const liveFinished =
                    expectedTopResults >
                      0 &&
                    liveTop3Count >=
                      expectedTopResults;

                  const historyFinished =
                    Boolean(
                      historyResult &&
                      (
                        historyResult
                          .finishPositionOfficial !==
                          null ||
                        historyResult
                          .scratchedAfterLock ||
                        historyResult
                          .betVoid ||
                        historyResult
                          .didNotFinish ||
                        historyResult
                          .disqualified
                      ),
                    );

                  const isFinished =
                    historyFinished ||
                    liveFinished;

                  /*
                   * Tidslinjen ska visa hur DEN LÅSTA
                   * mest sänkta hästen presterade.
                   *
                   * Live-resultatet för lockedSignal
                   * är därför förstahandskälla.
                   * Historikraden får endast användas
                   * om den avser samma häst.
                   */
                  const historyMatchesSignal =
                    Boolean(
                      historyResult &&
                      timelineSignal &&
                      historyResult
                        .runnerNumber ===
                        timelineSignal
                          .runnerNumber,
                    );

                  const resultPosition =
                    liveResultRunner
                      ?.finishPosition ??
                    (
                      historyMatchesSignal
                        ? historyResult
                            ?.finishPositionOfficial
                        : null
                    ) ??
                    (
                      !timelineSignal
                        ? historyResult
                            ?.finishPositionOfficial
                        : null
                    ) ??
                    null;

                  const resultIsScratched =
                    Boolean(
                      liveResultRunner
                        ?.scratched ||
                      (
                        historyMatchesSignal &&
                        (
                          historyResult
                            ?.scratchedAfterLock ||
                          historyResult
                            ?.betVoid
                        )
                      )
                    );

                  const timelineResultRunnerName =
                    timelineSignal
                      ?.runnerName ??
                    (
                      !timelineSignal
                        ? historyResult
                            ?.horseName
                        : null
                    ) ??
                    null;

                  const hasResultHorse =
                    Boolean(
                      historyResult ||
                      timelineSignal,
                    );

                  const resultLabel =
                    !isFinished ||
                    !hasResultHorse
                      ? null
                      : resultIsScratched
                        ? "STR"
                        : resultPosition !==
                            null
                          ? `${resultPosition}:a`
                          : "OPL";

                  const resultClass =
                    resultIsScratched
                      ? "is-scratched"
                      : resultPosition ===
                          1
                        ? "is-place-1"
                        : resultPosition ===
                            2
                          ? "is-place-2"
                          : resultPosition ===
                              3
                            ? "is-place-3"
                            : "is-other";

                  return (
                    <button
                      key={
                        item.key
                      }
                      type="button"
                      aria-pressed={
                        isSelected
                      }
                      className={[
                        "gallop-timeline-race",
                        isSelected
                          ? "is-selected"
                          : "",
                        isNext
                          ? "is-next"
                          : "",
                        isPast
                          ? "is-past"
                          : "",
                        isFinished
                          ? "is-finished"
                          : "",
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(" ")}
                      onClick={() => {
                        setSelectedTimelineRaceKey(
                          item.key,
                        );

                        setSelectedTrackId(
                          item.track
                            .id,
                        );
                      }}
                    >
                      <span>
                        <time>
                          {formatTime(
                            item.race
                              .startTime,
                          )}
                        </time>

                        {isFinished ? (
                          <em className="is-finished">
                            AVSLUTAD
                          </em>
                        ) : isNext ? (
                          <em>
                            NÄSTA
                          </em>
                        ) : null}
                      </span>

                      <strong>
                        {flag(
                          item.track
                            .countryCode,
                        )}{" "}
                        {
                          item.track
                            .name
                        }
                      </strong>

                      <small>
                        Lopp{" "}
                        {
                          item.race
                            .raceNumber
                        }
                      </small>

                      {resultLabel ? (
                        <div
                          className={[
                            "gallop-timeline-result",
                            resultClass,
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(" ")}
                          aria-label={
                            timelineResultRunnerName
                              ? `${timelineResultRunnerName}: ${resultLabel}`
                              : resultLabel
                          }
                          title={
                            timelineResultRunnerName
                              ? `${timelineResultRunnerName}: ${resultLabel}`
                              : resultLabel
                          }
                        >
                          {resultLabel}
                        </div>
                      ) : null}
                    </button>
                  );
                },
              )}
            </div>
          </section>

          <div className="gallop-track-grid">
            {tracks.map(
              (track) => {
                const firstStart =
                  track.races
                    .map(
                      (race) =>
                        race
                          .startTime,
                    )
                    .filter(
                      (
                        value,
                      ): value is string =>
                        Boolean(
                          value,
                        ),
                    )
                    .sort()[0] ??
                  null;

                return (
                  <button
                    key={
                      track.id
                    }
                    type="button"
                    className={
                      selectedTrackId ===
                      track.id
                        ? "gallop-track-card is-active"
                        : "gallop-track-card"
                    }
                    onClick={() => {
                      const preferredRace =
                        preferredRaceForTrack(
                          track,
                        );

                      setSelectedTrackId(
                        track.id,
                      );

                      setSelectedTimelineRaceKey(
                        preferredRace
                          ? raceKey(
                              track.id,
                              preferredRace
                                .raceNumber,
                            )
                          : null,
                      );
                    }}
                  >
                    <span className="gallop-track-country">
                      {flag(
                        track
                          .countryCode,
                      )}{" "}
                      {
                        track
                          .countryCode
                      }
                    </span>

                    <strong>
                      {track.name}
                    </strong>

                    <span>
                      {
                        track
                          .races
                          .length
                      }{" "}
                      lopp
                    </span>

                    <small>
                      Första start{" "}
                      {formatTime(
                        firstStart,
                      )}
                    </small>
                  </button>
                );
              },
            )}
          </div>

          {selectedTrack ? (
            <div className="gallop-selected-track">
              <div className="gallop-selected-head">
                <div>
                  <small>
                    VALD BANA
                  </small>

                  <h3>
                    {flag(
                      selectedTrack
                        .countryCode,
                    )}{" "}
                    {
                      selectedTrack
                        .name
                    }
                  </h3>

                  <span>
                    {
                      selectedTrack
                        .races
                        .length
                    }{" "}
                    lopp
                  </span>
                </div>

                <div className="gallop-live-state">
                  <strong>
                    {refreshing
                      ? "● HÄMTAR"
                      : "● LIVE"}
                  </strong>

                  <span>
                    60 s
                    uppdatering
                  </span>

                  <small>
                    Senast{" "}
                    {updatedAt
                      ? new Date(
                          updatedAt,
                        )
                          .toLocaleTimeString(
                            "sv-SE",
                            {
                              hour:
                                "2-digit",
                              minute:
                                "2-digit",
                              second:
                                "2-digit",
                            },
                          )
                      : "–"}
                  </small>
                </div>
              </div>

              <div className="gallop-race-grid">
                {selectedTrack
                  .races
                  .map(
                    (race) => {
                      const timelineKey =
                        raceKey(
                          selectedTrack.id,
                          race.raceNumber,
                        );

                      const isTimelineSelected =
                        selectedTimelineRace
                          ?.key ===
                        timelineKey;

                      const runners =
                        raceRunners[
                          timelineKey
                        ] ??
                        [];

                      const candidates =
                        runners
                          .filter(
                            (runner) =>
                              !runner.scratched,
                          )
                          .map(
                            (
                              runner,
                            ) => {
                              const memory =
                                oddsMemory[
                                  runnerKey(
                                    date,
                                    selectedTrack.id,
                                    race.raceNumber,
                                    runner.number,
                                  )
                                ];

                              if (
                                !memory
                              ) {
                                return {
                                  runner,
                                  memory:
                                    null,
                                  drop:
                                    null,
                                };
                              }

                              const drop =
                                memory
                                  .firstOddsRaw >
                                0
                                  ? (
                                      (
                                        memory
                                          .firstOddsRaw -
                                        memory
                                          .currentOddsRaw
                                      ) /
                                      memory
                                        .firstOddsRaw
                                    ) *
                                    100
                                  : null;

                              return {
                                runner,
                                memory,
                                drop,
                              };
                            },
                          )
                          .filter(
                            (
                              item,
                            ) =>
                              item.drop !==
                              null,
                          )
                          .sort(
                            (
                              a,
                              b,
                            ) =>
                              (
                                b.drop ??
                                -999
                              ) -
                              (
                                a.drop ??
                                -999
                              ),
                          );

                      const liveBest =
                        candidates[0] ??
                        null;

                      const signalKey =
                        lockedSignalKey(
                          date,
                          selectedTrack.id,
                          race.raceNumber,
                        );

                      const lockedSignal =
                        lockedSignals[
                          signalKey
                        ] ??
                        null;

                      const startMs =
                        race.startTime
                          ? new Date(
                              race.startTime,
                            ).getTime()
                          : Number.NaN;

                      const lockTimeMs =
                        Number.isFinite(
                          startMs,
                        )
                          ? startMs -
                            90_000
                          : null;

                      const lockPassed =
                        lockTimeMs !==
                          null &&
                        Date.now() >=
                          lockTimeMs;

                      const lockedRunner =
                        lockedSignal
                          ? runners.find(
                              (runner) =>
                                runner.number ===
                                lockedSignal
                                  .runnerNumber,
                            ) ??
                            {
                              number:
                                lockedSignal
                                  .runnerNumber,
                              name:
                                lockedSignal
                                  .runnerName,
                              scratched:
                                false,
                              oddsRaw:
                                lockedSignal
                                  .lockOddsRaw,
                              finishPosition:
                                null,
                            }
                          : null;

                      const best =
                        lockedSignal &&
                        lockedRunner
                          ? {
                              runner:
                                lockedRunner,

                              memory: {
                                firstOddsRaw:
                                  lockedSignal
                                    .firstOddsRaw,

                                currentOddsRaw:
                                  lockedSignal
                                    .lockOddsRaw,

                                samples:
                                  lockedSignal
                                    .samples,
                              },

                              drop:
                                lockedSignal
                                  .dropPercent,
                            }
                          : lockPassed
                            ? null
                            : liveBest;

                      const signalIsLocked =
                        Boolean(
                          lockedSignal,
                        );

                      const allRunnerRows =
                        runners
                          .filter(
                            (runner) =>
                              !runner.scratched,
                          )
                          .map(
                            (runner) => {
                              const memory =
                                oddsMemory[
                                  runnerKey(
                                    date,
                                    selectedTrack.id,
                                    race.raceNumber,
                                    runner.number,
                                  )
                                ];

                              const drop =
                                memory &&
                                memory.firstOddsRaw >
                                  0
                                  ? (
                                      (
                                        memory.firstOddsRaw -
                                        memory.currentOddsRaw
                                      ) /
                                      memory.firstOddsRaw
                                    ) *
                                    100
                                  : null;

                              return {
                                runner,
                                memory,
                                drop,
                              };
                            },
                          )
                          .sort(
                            (a, b) => {
                              const aDrop =
                                a.drop ??
                                Number.NEGATIVE_INFINITY;

                              const bDrop =
                                b.drop ??
                                Number.NEGATIVE_INFINITY;

                              if (
                                bDrop !==
                                aDrop
                              ) {
                                return (
                                  bDrop -
                                  aDrop
                                );
                              }

                              return (
                                a.runner.number -
                                b.runner.number
                              );
                            },
                          );

                      const resultTop3 =
                        runners
                          .filter(
                            (runner) =>
                              typeof runner.finishPosition ===
                                "number" &&
                              runner.finishPosition >=
                                1 &&
                              runner.finishPosition <=
                                3,
                          )
                          .sort(
                            (a, b) =>
                              (
                                a.finishPosition ??
                                99
                              ) -
                              (
                                b.finishPosition ??
                                99
                              ),
                          );

                      const activeRunnerCount =
                        runners.filter(
                          (runner) =>
                            !runner.scratched,
                        ).length;

                      const expectedTopResults =
                        Math.min(
                          3,
                          activeRunnerCount,
                        );

                      const isFinished =
                        expectedTopResults >
                          0 &&
                        resultTop3.length >=
                          expectedTopResults;

                      const raceUiNow =
                        Date.now();

                      const collectionStartMs =
                        Number.isFinite(
                          startMs,
                        )
                          ? startMs -
                            60 *
                              60_000
                          : null;

                      const collectionStarted =
                        signalIsLocked ||
                        collectionStartMs ===
                          null ||
                        raceUiNow >=
                          collectionStartMs;

                      const collectionStartLabel =
                        collectionStartMs !==
                          null
                          ? new Date(
                              collectionStartMs,
                            ).toLocaleTimeString(
                              "sv-SE",
                              {
                                hour:
                                  "2-digit",
                                minute:
                                  "2-digit",
                              },
                            )
                          : "";

                      const isOngoing =
                        !isFinished &&
                        Number.isFinite(
                          startMs,
                        ) &&
                        startMs <=
                          raceUiNow;

                      const nextFutureRace =
                        selectedTrack.races
                          .filter(
                            (item) => {
                              if (
                                !item.startTime
                              ) {
                                return false;
                              }

                              const itemStartMs =
                                new Date(
                                  item.startTime,
                                ).getTime();

                              return (
                                Number.isFinite(
                                  itemStartMs,
                                ) &&
                                itemStartMs >
                                  raceUiNow
                              );
                            },
                          )
                          .sort(
                            (a, b) =>
                              new Date(
                                a.startTime!,
                              ).getTime() -
                              new Date(
                                b.startTime!,
                              ).getTime(),
                          )[0] ??
                        null;

                      const isNext =
                        !isFinished &&
                        !isOngoing &&
                        nextFutureRace
                          ?.raceNumber ===
                          race.raceNumber;

                      const raceUiState =
                        isFinished
                          ? "finished"
                          : isOngoing
                            ? "ongoing"
                            : isNext
                              ? "next"
                              : "upcoming";

                      const raceUiOrder =
                        isOngoing
                          ? 0
                          : isNext
                            ? 1
                            : isFinished
                              ? 3
                              : 2;

                      const raceUiStart =
                        Number.isFinite(
                          startMs,
                        )
                          ? new Date(
                              startMs,
                            ).toLocaleTimeString(
                              "sv-SE",
                              {
                                hour:
                                  "2-digit",
                                minute:
                                  "2-digit",
                              },
                            )
                          : "";

                      const minutesToStart =
                        isNext &&
                        Number.isFinite(
                          startMs,
                        )
                          ? Math.max(
                              0,
                              Math.ceil(
                                (
                                  startMs -
                                  raceUiNow
                                ) /
                                  60_000,
                              ),
                            )
                          : null;

                      const raceUiUrgent =
                        isNext &&
                        minutesToStart !== null &&
                        minutesToStart <= 3;

                      const raceUiStatus =
                        isFinished
                          ? "✓ KÖRT · RESULTAT KLART"
                          : isOngoing
                            ? "● PÅGÅR · VÄNTAR RESULTAT"
                            : isNext
                              ? `▶ NÄSTA LOPP`
                              : `KOMMANDE${raceUiStart ? ` · ${raceUiStart}` : ""}`;

                      const didHitBet =
                        Boolean(
                          isFinished &&
                            signalIsLocked &&
                            lockedSignal?.qualifies === true &&
                            best?.runner
                              .finishPosition ===
                              1,
                        );

                      const isRunnerListExpanded =
                        expandedRaceKeys[
                          signalKey
                        ] ??
                        (
                          isNext ||
                          isOngoing ||
                          isTimelineSelected
                        );

                      const currentOdds =
                        best?.memory
                          ? decimalOdds(
                              best
                                .memory
                                .currentOddsRaw,
                            )
                          : null;

                      const qualifies =
                        lockedSignal
                          ? lockedSignal
                              .qualifies
                          : collectionStarted &&
                            Boolean(
                              best &&
                                best.memory &&
                                best
                                  .memory
                                  .samples >=
                                  2 &&
                                (
                                  best.drop ??
                                  0
                                ) >=
                                  minDropPercent &&
                                currentOdds !==
                                  null &&
                                currentOdds <=
                                  maxOdds,
                            );


                      const t90SwedenEligible =
                        date >=
                          T90_SWEDEN_START_DATE &&
                        selectedTrack
                          .countryCode ===
                          "SE";

                      const t90SwedenLiveCandidate =
                        t90SwedenEligible &&
                        !signalIsLocked &&
                        collectionStarted &&
                        Boolean(
                          best &&
                            best.memory &&
                            best.memory.samples >=
                              2 &&
                            (
                              best.drop ??
                              Number.NEGATIVE_INFINITY
                            ) >=
                              T90_SWEDEN_MIN_DROP_PERCENT &&
                            (
                              best.drop ??
                              Number.POSITIVE_INFINITY
                            ) <
                              T90_SWEDEN_MAX_DROP_PERCENT,
                        );

                      const t90SwedenBet =
                        t90SwedenEligible &&
                        signalIsLocked &&
                        Boolean(
                          lockedSignal &&
                            lockedSignal.samples >=
                              2 &&
                            lockedSignal
                              .dropPercent >=
                              T90_SWEDEN_MIN_DROP_PERCENT &&
                            lockedSignal
                              .dropPercent <
                              T90_SWEDEN_MAX_DROP_PERCENT,
                        );

                      const t1ShadowEligible =
                        isGallopT1ShadowRace({
                          date,
                          countryCode:
                            selectedTrack
                              .countryCode,
                          sport:
                            "GALLOP",
                        });

                      const t1ShadowPreviewStarted =
                        t1ShadowEligible &&
                        Number.isFinite(
                          startMs,
                        ) &&
                        raceUiNow >=
                          startMs -
                            GALLOP_T1_PREVIEW_TARGET_SECONDS *
                              1_000;

                      const t1ShadowLocked =
                        t1ShadowEligible &&
                        Number.isFinite(
                          startMs,
                        ) &&
                        raceUiNow >=
                          startMs -
                            GALLOP_T1_LOCK_TARGET_SECONDS *
                              1_000;

                      const t1ShadowQualifies =
                        Boolean(
                          liveBest &&
                            liveBest.memory &&
                            liveBest.memory
                              .samples >=
                              2 &&
                            (
                              liveBest.drop ??
                              Number.NEGATIVE_INFINITY
                            ) >=
                              GALLOP_T1_MIN_DROP_PERCENT &&
                            (
                              liveBest.drop ??
                              Number.POSITIVE_INFINITY
                            ) <
                              GALLOP_T1_MAX_DROP_PERCENT,
                        );

                      const collecting =
                        collectionStarted &&
                        Boolean(
                          best
                            ?.memory &&
                            best
                              .memory
                              .samples <
                              2,
                        );

                      return (
                        <article
                          key={
                            race.raceNumber
                          }
                          className={[
                            "gallop-race-card",
                            isTimelineSelected
                              ? "is-timeline-selected"
                              : "",
                            qualifies
                              ? "has-signal"
                              : "",
                            `is-${raceUiState}`,
                            didHitBet
                              ? "is-bet-hit"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            order:
                              raceUiOrder,
                          }}
                        >
                          <div className="gallop-race-card-head">
                            <strong>
                              Lopp{" "}
                              {
                                race
                                  .raceNumber
                              }
                            </strong>

                            <span>
                              {formatTime(
                                race
                                  .startTime,
                              )}
                            </span>
                          </div>

                          <div className="gallop-race-status-row">
                            <div
                              className={`gallop-race-state is-${raceUiState}`}
                            >
                              {isNext ? (
                                <>
                                  <span>
                                    ▶ NÄSTA LOPP · START{" "}
                                  </span>
                                  <strong
                                    className={[
                                      "gallop-start-countdown",
                                      raceUiUrgent
                                        ? "is-urgent"
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    {raceUiStart}
                                    {minutesToStart !== null
                                      ? ` · ${minutesToStart} MIN KVAR`
                                      : ""}
                                  </strong>
                                </>
                              ) : (
                                raceUiStatus
                              )}
                            </div>

                            {didHitBet ? (
                              <div className="gallop-win-badge">
                                💰 SPELET SATT
                              </div>
                            ) : null}
                          </div>

                          {resultTop3.length ? (
                            <div className="gallop-result-box">
                              <span>RESULTAT · 1–2–3</span>

                              {resultTop3.map(
                                (runner) => (
                                  <strong
                                    key={`result-${runner.number}`}
                                  >
                                    {runner.finishPosition}.{" "}
                                    {runner.number}.{" "}
                                    {runner.name}
                                  </strong>
                                ),
                              )}

                              {best?.runner.finishPosition ? (
                                <small>
                                  Mest sänkta häst slutade{" "}
                                  {best.runner.finishPosition}:a
                                </small>
                              ) : null}
                            </div>
                          ) : null}

                          {!collectionStarted &&
                          !signalIsLocked ? (
                            <div className="gallop-collection-wait">
                              <strong>
                                ⏳ ODDSINSAMLING STARTAR{" "}
                                {collectionStartLabel}
                              </strong>

                              <span>
                                Mest sänkta häst utses
                                först när sista
                                60 minuterna börjar.
                              </span>
                            </div>
                          ) : best ? (
                            <>
                              <div
                                className={
                                  signalIsLocked
                                    ? "gallop-rule-status is-candidate is-locked"
                                    : lockPassed
                                      ? "gallop-rule-status is-lock-missing"
                                      : "gallop-rule-status is-candidate"
                                }
                              >
                                {signalIsLocked
                                  ? "🔒 MEST SÄNKTA HÄST · LÅST T−90"
                                  : lockPassed
                                    ? "⚠ T−90 PASSERAD · LÅS SAKNAS"
                                    : "↓ MEST SÄNKTA HÄST · LIVE"}
                              </div>

                              <strong className="gallop-candidate">
                                {
                                  best
                                    .runner
                                    .number
                                }
                                .{" "}
                                {
                                  best
                                    .runner
                                    .name
                                }
                              </strong>

                              <div className="gallop-race-metrics">
                                <div>
                                  <span>
                                    Sänkning
                                  </span>

                                  <strong>
                                    ↓{" "}
                                    {formatDrop(
                                      best.drop,
                                    )}
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    Startodds
                                  </span>

                                  <strong>
                                    {formatOdds(
                                      best
                                        .memory
                                        ?.firstOddsRaw ??
                                        null,
                                    )}
                                  </strong>
                                </div>

                                <div>
                                  <span>
                                    {signalIsLocked
                                      ? "Låsodds"
                                      : "Nu"}
                                  </span>

                                  <strong>
                                    {formatOdds(
                                      best
                                        .memory
                                        ?.currentOddsRaw ??
                                        best
                                          .runner
                                          .oddsRaw,
                                    )}
                                  </strong>
                                </div>
                              </div>

                              <div
                                className={
                                  qualifies
                                    ? "gallop-rule-status is-signal"
                                    : "gallop-rule-status"
                                }
                              >
                                {qualifies
                                  ? "✓ REGEL UPPFYLLD"
                                  : collecting
                                    ? "SAMLAR DATA"
                                    : "UNDER REGELGRÄNS"}
                              </div>


                              {t90SwedenBet ? (
                                <div className="gallop-rule-status is-signal">
                                  🎯 T90 SVERIGE 25–40 · SPEL 100 KR VINNARE
                                </div>
                              ) : t90SwedenLiveCandidate ? (
                                <div className="gallop-rule-status is-candidate">
                                  🎯 T90 SVERIGE 25–40 · LIVEKANDIDAT
                                </div>
                              ) : null}

                              {t1ShadowPreviewStarted &&
                              liveBest &&
                              liveBest.memory ? (
                                <div
                                  className={
                                    t1ShadowLocked &&
                                    t1ShadowQualifies
                                      ? "gallop-rule-status is-signal"
                                      : "gallop-rule-status is-candidate"
                                  }
                                  title={
                                    GALLOP_T1_SHADOW_RULE_VERSION
                                  }
                                >
                                  {t1ShadowLocked
                                    ? t1ShadowQualifies
                                      ? "🧪 T1 SKUGGMODELL · LÅST SPEL"
                                      : "🧪 T1 SKUGGMODELL · LÅST · INGET SPEL"
                                    : "⏳ T−2 FÖRVARNING · T1-SKUGGKANDIDAT"}
                                  {" · "}
                                  {
                                    liveBest
                                      .runner
                                      .number
                                  }
                                  .{" "}
                                  {
                                    liveBest
                                      .runner
                                      .name
                                  }
                                  {" · "}
                                  {(
                                    liveBest.drop ??
                                    0
                                  )
                                    .toFixed(1)
                                    .replace(
                                      ".",
                                      ",",
                                    )}
                                  {" % · "}
                                  {formatOdds(
                                    liveBest
                                      .memory
                                      .currentOddsRaw,
                                  )}
                                </div>
                              ) : null}

                              <small className="gallop-samples">
                                {
                                  best
                                    .memory
                                    ?.samples ??
                                  0
                                }{" "}
                                mätningar
                                {signalIsLocked
                                  ? " · fryst vid T−90"
                                  : ""}
                              </small>
                            </>
                          ) : (
                            <p className="gallop-no-data">
                              {lockPassed
                                ? "🔒 T−90 passerad · väntar på centralt lås."
                                : "Startlistan eller vinnaroddsen är ännu inte tillgängliga."}
                            </p>
                          )}

                          {allRunnerRows.length ? (
                            <div
                              className={[
                                "gallop-all-runners",
                                !isRunnerListExpanded
                                  ? "is-collapsed-mobile"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <div className="gallop-all-runners-title">
                                <div>
                                  <strong>
                                    ALLA HÄSTAR
                                  </strong>

                                  <span>
                                    {collectionStarted
                                      ? "Rankade efter oddssänkning"
                                      : `Oddsanalys startar ${collectionStartLabel}`}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  className="gallop-runners-toggle"
                                  onClick={() =>
                                    setExpandedRaceKeys(
                                      (current) => ({
                                        ...current,

                                        [signalKey]:
                                          !(
                                            current[
                                              signalKey
                                            ] ??
                                            (
                                              isNext ||
                                              isOngoing
                                            )
                                          ),
                                      }),
                                    )
                                  }
                                >
                                  {isRunnerListExpanded
                                    ? "DÖLJ"
                                    : `VISA ${allRunnerRows.length} HÄSTAR`}
                                </button>
                              </div>

                              <div className="gallop-runner-table-head">
                                <span>
                                  {collectionStarted
                                    ? "Rank"
                                    : "–"}
                                </span>
                                <span>Häst</span>
                                <span>↓ %</span>
                                <span>Start</span>
                                <span>Nu</span>
                              </div>

                              {allRunnerRows.map(
                                (
                                  row,
                                  index,
                                ) => (
                                  <div
                                    key={`all-${race.raceNumber}-${row.runner.number}`}
                                    className={
                                      index === 0
                                        ? "gallop-runner-row is-leader"
                                        : "gallop-runner-row"
                                    }
                                  >
                                    <span className="gallop-drop-rank">
                                      {collectionStarted
                                        ? index + 1
                                        : "–"}
                                    </span>

                                    <strong>
                                      {row.runner.number}.{" "}
                                      {row.runner.name}

                                      {row.runner.finishPosition ? (
                                        <small className="gallop-finish-badge">
                                          {" "}
                                          · Mål{" "}
                                          {row.runner.finishPosition}:a
                                        </small>
                                      ) : null}
                                    </strong>

                                    <span
                                      className={
                                        row.drop !== null &&
                                        row.drop > 0
                                          ? "is-dropping"
                                          : ""
                                      }
                                    >
                                      {row.drop !== null
                                        ? `${row.drop
                                            .toFixed(1)
                                            .replace(".", ",")} %`
                                        : "–"}
                                    </span>

                                    <span>
                                      {formatOdds(
                                        row.memory
                                          ?.firstOddsRaw ??
                                          null,
                                      )}
                                    </span>

                                    <span>
                                      {formatOdds(
                                        row.memory
                                          ?.currentOddsRaw ??
                                          row.runner
                                            .oddsRaw,
                                      )}
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    },
                  )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <p className="gallop-v1-note">
        V1 följer en enda urvalsregel:
        MEST SÄNKTA HÄST. Befintlig
        serverhistorik används när den
        finns och liveoddsen fortsätter
        uppdateras varje minut.
      </p>
    </section>
  );
}
