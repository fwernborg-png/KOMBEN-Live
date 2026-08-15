import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./gallopToday.css";

const WORKER_API =
  "https://dd-ld-varde-place-live-worker.fredde-platsmodell-live.workers.dev";

const API =
  `${WORKER_API}/atg`;

const PLACE_HISTORY_API =
  `${WORKER_API}/api/place-live/history`;

const SETTINGS_KEY =
  "platsjagaren-gallop-v1-settings";

const LOCKED_SIGNALS_KEY =
  "platsjagaren-gallop-v1-locked-signals";

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
          countryCode:
            normalizeCountry(
              track,
            ),
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
  >(() => {
    try {
      const raw =
        window.localStorage
          .getItem(
            LOCKED_SIGNALS_KEY,
          );

      if (!raw) {
        return {};
      }

      const parsed =
        JSON.parse(raw);

      return (
        parsed &&
        typeof parsed ===
          "object" &&
        !Array.isArray(
          parsed,
        )
      )
        ? parsed as GallopLockedSignals
        : {};
    } catch {
      return {};
    }
  });

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
      try {
        window.localStorage
          .setItem(
            LOCKED_SIGNALS_KEY,
            JSON.stringify(
              lockedSignals,
            ),
          );
      } catch (storageError) {
        console.warn(
          "Kunde inte spara Gallop-låsningar lokalt",
          storageError,
        );
      }
    },
    [lockedSignals],
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

                  const serverPoints =
                    result
                      .serverWinPoints
                      .filter(
                        (point) =>
                          point.runnerNumber ===
                          runner.number,
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

                      currentOddsRaw:
                        runner.oddsRaw ??
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

                /*
                 * Har loppet redan låsts
                 * får signalen ALDRIG
                 * skrivas över.
                 */
                if (
                  next[
                    signalKey
                  ]
                ) {
                  continue;
                }

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

                        /*
                         * Fallback endast
                         * från data som redan
                         * fanns i browsern
                         * före denna hämtning.
                         *
                         * Det gör att vi inte
                         * råkar använda ett
                         * nytt post-T90-odds.
                         */
                        const local =
                          oddsMemoryRef
                            .current[
                              runnerKey(
                                date,
                                track.id,
                                result
                                  .race
                                  .raceNumber,
                                runner.number,
                              )
                            ];

                        if (
                          !local ||
                          local.samples <
                            1 ||
                          local
                            .firstOddsRaw <=
                            0 ||
                          local
                            .currentOddsRaw <=
                            0
                        ) {
                          return null;
                        }

                        return {
                          runner,

                          firstOddsRaw:
                            local
                              .firstOddsRaw,

                          lockOddsRaw:
                            local
                              .currentOddsRaw,

                          samples:
                            local.samples,

                          dropPercent:
                            (
                              (
                                local
                                  .firstOddsRaw -
                                local
                                  .currentOddsRaw
                              ) /
                              local
                                .firstOddsRaw
                            ) *
                            100,
                        };
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
                        a.dropPercent,
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

  return (
    <section className="gallop-live-shell">
      <div className="gallop-live-hero">
        <div>
          <p className="gallop-live-kicker">
            GALOPP · LIVE V1
          </p>

          <h2>
            🏇 Galopp idag
          </h2>

          <p>
            Dagens galoppbanor från ATG.
            Välj en bana så börjar
            Platsjägaren följa
            vinnaroddsen varje minut.
          </p>
        </div>

        <div className="gallop-live-summary">
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

      <div className="gallop-rule-card">
        <div>
          <small>
            TESTREGEL
          </small>

          <strong>
            ↘ GALOPP V1 · MEST SÄNKTA HÄST
          </strong>

          <p>
            I varje lopp visas alltid hästen
            med störst procentuell
            oddssänkning. Serverhistorik
            används när den finns.
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
                    ) ||
                      0,
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
                  ) ||
                    1,
                ),
              )
            }
          />
        </label>
      </div>

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
                    onClick={() =>
                      setSelectedTrackId(
                        track.id,
                      )
                    }
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
                      const runners =
                        raceRunners[
                          raceKey(
                            selectedTrack.id,
                            race.raceNumber,
                          )
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

                      const raceUiStatus =
                        isFinished
                          ? "✓ KÖRT · RESULTAT KLART"
                          : isOngoing
                            ? "● PÅGÅR · VÄNTAR RESULTAT"
                            : isNext
                              ? `▶ NÄSTA LOPP · ${raceUiStart}${minutesToStart !== null ? ` · ${minutesToStart} MIN` : ""}`
                              : `KOMMANDE${raceUiStart ? ` · ${raceUiStart}` : ""}`;

                      const isRunnerListExpanded =
                        expandedRaceKeys[
                          signalKey
                        ] ??
                        (
                          isNext ||
                          isOngoing
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
                            qualifies
                              ? "has-signal"
                              : "",
                            `is-${raceUiState}`,
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

                          <div
                            className={`gallop-race-state is-${raceUiState}`}
                          >
                            {raceUiStatus}
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
                              Startlistan eller
                              vinnaroddsen är
                              ännu inte
                              tillgängliga.
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
