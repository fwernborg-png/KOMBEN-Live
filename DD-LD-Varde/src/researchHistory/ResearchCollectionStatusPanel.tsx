import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "./researchCollectionStatus.css";

const WORKER_API =
  "https://dd-ld-varde-place-live-worker.fredde-platsmodell-live.workers.dev";

type CollectionStatusCode =
  | "WAITING"
  | "COLLECTING"
  | "LOCKING"
  | "LOCKED"
  | "WAITING_RESULT"
  | "COMPLETE"
  | "MISSING_LOCK"
  | "ERROR";

type CollectionRace = {
  countryCode: string;
  trackId: number;
  trackName: string;
  sport: string | null;
  raceNumber: number;
  plannedStartTime: string;
  collectionStartTime: string;
  lockTargetTime: string;
  status: CollectionStatusCode;
  archiveStatus: string | null;
  archivedOddsPointCount: number;
  missingFields: string[];
};

type CollectionPayload = {
  ok: true;
  date: string;
  generatedAt: string;
  worker: {
    health: "OK" | "RUNNING" | "STALE" | "ERROR" | "UNKNOWN";
    status: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
  summary: {
    countries: number;
    tracks: number;
    races: number;
    collecting: number;
    locked: number;
    complete: number;
    problems: number;
  };
  races: CollectionRace[];
};

const COUNTRY_LABELS: Record<string, string> = {
  SE: "🇸🇪 Sverige",
  NO: "🇳🇴 Norge",
  DK: "🇩🇰 Danmark",
  FR: "🇫🇷 Frankrike",
  DE: "🇩🇪 Tyskland",
  IT: "🇮🇹 Italien",
  GB: "🇬🇧 Storbritannien",
  IE: "🇮🇪 Irland",
  ZA: "🇿🇦 Sydafrika",
  AU: "🇦🇺 Australien",
  NZ: "🇳🇿 Nya Zeeland",
  US: "🇺🇸 USA",
  CA: "🇨🇦 Kanada",
  HK: "🇭🇰 Hongkong",
  AE: "🇦🇪 Förenade Arabemiraten",
};

function countryLabel(code: string) {
  return COUNTRY_LABELS[code] ?? `🌍 ${code}`;
}

function formatClock(value: string | null | undefined) {
  if (!value) {
    return "–";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "–";
  }

  return new Intl.DateTimeFormat(
    "sv-SE",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "sv-SE",
    {
      day: "numeric",
      month: "long",
    },
  ).format(date);
}

function statusInfo(
  race: CollectionRace,
) {
  switch (race.status) {
    case "WAITING":
      return {
        icon: "⚪",
        label:
          `Väntar · insamling ${formatClock(
            race.collectionStartTime,
          )}`,
        tone: "waiting",
      };

    case "COLLECTING":
      return {
        icon: "🟢",
        label:
          `Samlar odds · sedan ${formatClock(
            race.collectionStartTime,
          )}`,
        tone: "collecting",
      };

    case "LOCKING":
      return {
        icon: "🟡",
        label:
          `T−90 låses nu · ${formatClock(
            race.lockTargetTime,
          )}`,
        tone: "locking",
      };

    case "LOCKED":
      return {
        icon: "🔒",
        label:
          race.archivedOddsPointCount > 0
            ? `T−90 låst · ${race.archivedOddsPointCount} arkiverade oddspunkter`
            : "T−90 låst",
        tone: "locked",
      };

    case "WAITING_RESULT":
      return {
        icon: "⏳",
        label:
          race.archivedOddsPointCount > 0
            ? `Låst · väntar resultat · ${race.archivedOddsPointCount} oddspunkter`
            : "Låst · väntar resultat",
        tone: "result",
      };

    case "COMPLETE":
      return {
        icon: "✅",
        label:
          race.archivedOddsPointCount > 0
            ? `Complete · ${race.archivedOddsPointCount} oddspunkter`
            : "Complete",
        tone: "complete",
      };

    case "MISSING_LOCK":
      return {
        icon: "🔴",
        label: "T−90 saknas",
        tone: "error",
      };

    case "ERROR":
    default:
      return {
        icon: "🔴",
        label:
          race.archiveStatus === "INCOMPLETE"
            ? "Ofullständigt arkiv"
            : "Arkivfel",
        tone: "error",
      };
  }
}

function sportLabel(
  sport: string | null,
) {
  return sport?.toUpperCase() === "GALLOP"
    ? "GALOPP"
    : "TRAV";
}

export function ResearchCollectionStatusPanel() {
  const [
    data,
    setData,
  ] = useState<CollectionPayload | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const load = useCallback(
    async () => {
      try {
        const response = await fetch(
          `${WORKER_API}/api/research/status`,
          {
            cache: "no-store",
          },
        );

        const payload =
          await response.json() as
            | CollectionPayload
            | {
                ok: false;
                error?: string;
              };

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            "error" in payload
              ? payload.error ||
                "Kunde inte läsa status"
              : "Kunde inte läsa status",
          );
        }

        setData(payload);
        setError("");
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Kunde inte läsa status",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(
    () => {
      void load();

      const timer =
        window.setInterval(
          () => {
            void load();
          },
          5 * 60_000,
        );

      return () => {
        window.clearInterval(timer);
      };
    },
    [load],
  );

  const countries = useMemo(
    () => {
      const map =
        new Map<
          string,
          Map<string, CollectionRace[]>
        >();

      for (
        const race
        of data?.races ?? []
      ) {
        let tracks =
          map.get(
            race.countryCode,
          );

        if (!tracks) {
          tracks =
            new Map<
              string,
              CollectionRace[]
            >();

          map.set(
            race.countryCode,
            tracks,
          );
        }

        const trackKey =
          `${race.trackId}:${race.trackName}`;

        const races =
          tracks.get(trackKey) ?? [];

        races.push(race);

        tracks.set(
          trackKey,
          races,
        );
      }

      return Array.from(
        map.entries(),
      );
    },
    [data],
  );

  const workerHealthy =
    data?.worker.health === "OK" ||
    data?.worker.health === "RUNNING";

  return (
    <section className="collection-status">
      <header className="collection-status-header">
        <div>
          <p className="collection-status-kicker">
            RESEARCH · LIVE
          </p>

          <h2>
            Insamlingsstatus
          </h2>

          <p>
            Ett ställe för att se att
            internationell trav och galopp
            faktiskt samlas in.
          </p>
        </div>

        <button
          type="button"
          className="collection-refresh"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          disabled={loading}
        >
          {loading
            ? "UPPDATERAR…"
            : "UPPDATERA"}
        </button>
      </header>

      {error ? (
        <div className="collection-error">
          🔴 {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section
            className={
              `collection-system ${
                workerHealthy
                  ? "is-ok"
                  : "is-error"
              }`
            }
          >
            <div>
              <span className="collection-system-dot">
                {workerHealthy
                  ? "●"
                  : "●"}
              </span>

              <div>
                <small>
                  SYSTEM
                </small>

                <strong>
                  {workerHealthy
                    ? "Worker kör"
                    : data.worker.health ===
                        "STALE"
                      ? "Worker verkar sen"
                      : "Worker behöver kontroll"}
                </strong>
              </div>
            </div>

            <div className="collection-system-meta">
              <span>
                Senast
                <strong>
                  {formatClock(
                    data.worker.finishedAt ??
                    data.worker.startedAt,
                  )}
                </strong>
              </span>

              <span>
                Datum
                <strong>
                  {formatDate(
                    data.date,
                  )}
                </strong>
              </span>

              <span>
                Uppdatering
                <strong>
                  var 5:e min
                </strong>
              </span>
            </div>
          </section>

          <section className="collection-summary">
            <article>
              <span>Länder</span>
              <strong>
                {data.summary.countries}
              </strong>
            </article>

            <article>
              <span>Banor</span>
              <strong>
                {data.summary.tracks}
              </strong>
            </article>

            <article>
              <span>Lopp</span>
              <strong>
                {data.summary.races}
              </strong>
            </article>

            <article className="is-live">
              <span>Samlar nu</span>
              <strong>
                {data.summary.collecting}
              </strong>
            </article>

            <article>
              <span>Låsta</span>
              <strong>
                {data.summary.locked}
              </strong>
            </article>

            <article className={
              data.summary.problems > 0
                ? "is-problem"
                : ""
            }>
              <span>Problem</span>
              <strong>
                {data.summary.problems}
              </strong>
            </article>
          </section>

          <div className="collection-countries">
            {countries.map(
              ([
                countryCode,
                tracks,
              ]) => (
                <section
                  className="collection-country"
                  key={countryCode}
                >
                  <header>
                    <h3>
                      {countryLabel(
                        countryCode,
                      )}
                    </h3>

                    <span>
                      {Array.from(
                        tracks.values(),
                      ).reduce(
                        (
                          total,
                          races,
                        ) =>
                          total +
                          races.length,
                        0,
                      )} lopp
                    </span>
                  </header>

                  <div className="collection-track-list">
                    {Array.from(
                      tracks.entries(),
                    ).map(
                      ([
                        trackKey,
                        races,
                      ]) => (
                        <article
                          className="collection-track"
                          key={trackKey}
                        >
                          <div className="collection-track-heading">
                            <strong>
                              {races[0]
                                ?.trackName}
                            </strong>

                            <span>
                              {[
                                ...new Set(
                                  races.map(
                                    (race) =>
                                      sportLabel(
                                        race.sport,
                                      ),
                                  ),
                                ),
                              ].join(" · ")}
                            </span>
                          </div>

                          <div className="collection-race-list">
                            {races
                              .slice()
                              .sort(
                                (a, b) =>
                                  a.raceNumber -
                                  b.raceNumber,
                              )
                              .map(
                                (race) => {
                                  const status =
                                    statusInfo(
                                      race,
                                    );

                                  return (
                                    <div
                                      className={
                                        `collection-race is-${status.tone}`
                                      }
                                      key={
                                        `${race.trackId}:${race.raceNumber}`
                                      }
                                    >
                                      <div className="collection-race-main">
                                        <strong>
                                          Lopp{" "}
                                          {race.raceNumber}
                                        </strong>

                                        <span>
                                          {formatClock(
                                            race.plannedStartTime,
                                          )}
                                        </span>
                                      </div>

                                      <div className="collection-race-status">
                                        <span
                                          aria-hidden="true"
                                        >
                                          {status.icon}
                                        </span>

                                        <strong>
                                          {status.label}
                                        </strong>
                                      </div>

                                      {race.missingFields.length >
                                      0 ? (
                                        <small>
                                          Saknas:{" "}
                                          {race.missingFields.join(
                                            ", ",
                                          )}
                                        </small>
                                      ) : null}
                                    </div>
                                  );
                                },
                              )}
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                </section>
              ),
            )}

            {!loading &&
            countries.length === 0 ? (
              <div className="collection-empty">
                Inga research-lopp hittades
                för dagen.
              </div>
            ) : null}
          </div>
        </>
      ) : loading ? (
        <div className="collection-loading">
          Hämtar insamlingsstatus…
        </div>
      ) : null}
    </section>
  );
}
