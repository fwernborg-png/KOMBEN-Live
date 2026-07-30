import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  computeResearchHistorySummary,
  groupResearchHistoryRows,
  RESEARCH_STAKE_SEK,
} from "./analytics";

import {
  loadResearchHistoryOptions,
  loadResearchHistoryRows,
} from "./repository";

import type {
  ResearchGrouping,
  ResearchHistoryFilters,
  ResearchHistoryOptions,
  ResearchHistoryRow,
  ResearchSelection,
} from "./types";

import "./researchHistory.css";

const DEFAULT_OPTIONS:
  ResearchHistoryOptions = {
    minDate: null,
    maxDate: null,

    raceCount: 0,

    tracks: [],
    distances: [],
    startMethods: [],
  };

function isoDateOffset(
  dateValue: string,
  days: number,
): string {
  const parsed =
    new Date(
      `${dateValue}T12:00:00`,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return dateValue;
  }

  parsed.setDate(
    parsed.getDate() +
    days,
  );

  return [
    parsed.getFullYear(),

    String(
      parsed.getMonth() + 1,
    ).padStart(2, "0"),

    String(
      parsed.getDate(),
    ).padStart(2, "0"),
  ].join("-");
}

function buildInitialFilters(
  options: ResearchHistoryOptions,
): ResearchHistoryFilters {
  const dateTo =
    options.maxDate ??
    new Date()
      .toISOString()
      .slice(0, 10);

  const desiredFrom =
    isoDateOffset(
      dateTo,
      -89,
    );

  const dateFrom =
    options.minDate &&
    options.minDate > desiredFrom
      ? options.minDate
      : desiredFrom;

  return {
    dateFrom,
    dateTo,

    selection:
      "MOST_SHORTENED",

    startMethod: "",
    distanceMeters: null,
    trackName: "",

    minStrength: null,
    minDropPercent: null,

    completeOnly: true,
    limit: 2000,
  };
}

function selectionLabel(
  value: ResearchSelection,
): string {
  if (value === "SMOOTHEST") {
    return "Jämnaste hästen";
  }

  if (value === "FAVORITE") {
    return "Favoriten vid LOCK";
  }

  return "Mest sänkta hästen";
}

function groupingLabel(
  value: ResearchGrouping,
): string {
  if (value === "DISTANCE") {
    return "Distans";
  }

  if (value === "TRACK") {
    return "Bana";
  }

  if (value === "STRENGTH") {
    return "Styrka";
  }

  return "Startmetod";
}

function formatNumber(
  value: number | null,
  decimals = 1,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "–";
  }

  return value.toLocaleString(
    "sv-SE",
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals,
    },
  );
}

function formatOdds(
  value: number | null,
): string {
  return formatNumber(
    value,
    2,
  );
}

function formatPercent(
  value: number | null,
): string {
  if (value === null) {
    return "–";
  }

  return `${formatNumber(value, 1)} %`;
}

function formatMoney(
  value: number,
): string {
  return `${value.toLocaleString(
    "sv-SE",
    {
      maximumFractionDigits: 0,
    },
  )} kr`;
}

function roiClass(
  value: number | null,
): string {
  if (value === null) {
    return "is-neutral";
  }

  return value >= 0
    ? "is-positive"
    : "is-negative";
}

function resultLabel(
  row: ResearchHistoryRow,
): string {
  if (row.betVoid) {
    return "VOID";
  }

  if (row.winnerOfficial) {
    return "VINNARE";
  }

  if (row.placedOfficial === true) {
    return "PLATS";
  }

  return "MISS";
}

function resultClass(
  row: ResearchHistoryRow,
): string {
  if (row.betVoid) {
    return "is-void";
  }

  if (row.winnerOfficial) {
    return "is-win";
  }

  if (row.placedOfficial === true) {
    return "is-place";
  }

  return "is-miss";
}

export function ResearchHistoryPanel() {
  const [
    options,
    setOptions,
  ] = useState(
    DEFAULT_OPTIONS,
  );

  const [
    filters,
    setFilters,
  ] = useState<
    ResearchHistoryFilters
  >(
    buildInitialFilters(
      DEFAULT_OPTIONS,
    ),
  );

  const [
    rows,
    setRows,
  ] = useState<
    ResearchHistoryRow[]
  >([]);

  const [
    grouping,
    setGrouping,
  ] = useState<
    ResearchGrouping
  >("START_METHOD");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    loadedAt,
    setLoadedAt,
  ] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const loadedOptions =
          await loadResearchHistoryOptions();

        const initialFilters =
          buildInitialFilters(
            loadedOptions,
          );

        const loadedRows =
          await loadResearchHistoryRows(
            initialFilters,
          );

        if (cancelled) {
          return;
        }

        setOptions(
          loadedOptions,
        );

        setFilters(
          initialFilters,
        );

        setRows(
          loadedRows,
        );

        setLoadedAt(
          new Date()
            .toISOString(),
        );
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Okänt analysfel",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary =
    useMemo(
      () =>
        computeResearchHistorySummary(
          rows,
        ),
      [rows],
    );

  const groups =
    useMemo(
      () =>
        groupResearchHistoryRows(
          rows,
          grouping,
        ),
      [
        rows,
        grouping,
      ],
    );

  async function runAnalysis(
    nextFilters =
      filters,
  ) {
    setLoading(true);
    setError("");

    try {
      const loadedRows =
        await loadResearchHistoryRows(
          nextFilters,
        );

      setRows(
        loadedRows,
      );

      setLoadedAt(
        new Date()
          .toISOString(),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Okänt analysfel",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    const initial =
      buildInitialFilters(
        options,
      );

    setFilters(
      initial,
    );

    void runAnalysis(
      initial,
    );
  }

  const strategyText =
    selectionLabel(
      filters.selection,
    );

  return (
    <section className="tab-section research-history">
      <div className="panel-header-row research-history-header">
        <div>
          <p className="research-kicker">
            FORSKNINGSARKIV
          </p>

          <h2 className="research-title">
            Historik & analys
          </h2>

          <p className="research-subtitle">
            En vald häst per lopp. Simulerad insats{" "}
            {RESEARCH_STAKE_SEK} kr per marknad.
          </p>
        </div>

        <div className="research-health">
          <span>
            Arkiverade lopp{" "}
            <strong>
              {options.raceCount}
            </strong>
          </span>

          <span>
            Visade lopp{" "}
            <strong>
              {rows.length}
            </strong>
          </span>

          <span>
            Senast{" "}
            <strong>
              {loadedAt
                ? new Date(
                    loadedAt,
                  ).toLocaleTimeString(
                    "sv-SE",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  )
                : "–"}
            </strong>
          </span>
        </div>
      </div>

      <div className="research-question">
        Hur går{" "}
        <strong>
          {strategyText.toLowerCase()}
        </strong>

        {filters.startMethod
          ? ` i ${filters.startMethod === "AUTO" ? "autostart" : "voltstart"}`
          : ""}

        {filters.distanceMeters
          ? ` över ${filters.distanceMeters} meter`
          : ""}

        {filters.trackName
          ? ` på ${filters.trackName}`
          : ""}

        ?
      </div>

      <div className="research-filter-panel">
        <label>
          <span>Strategi</span>

          <select
            value={
              filters.selection
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  selection:
                    event.target
                      .value as ResearchSelection,
                }),
              )
            }
          >
            <option value="MOST_SHORTENED">
              Mest sänkta
            </option>

            <option value="SMOOTHEST">
              Jämnaste
            </option>

            <option value="FAVORITE">
              Favoriten
            </option>
          </select>
        </label>

        <label>
          <span>Från datum</span>

          <input
            type="date"
            value={
              filters.dateFrom
            }
            min={
              options.minDate ??
              undefined
            }
            max={
              filters.dateTo ||
              options.maxDate ||
              undefined
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  dateFrom:
                    event.target.value,
                }),
              )
            }
          />
        </label>

        <label>
          <span>Till datum</span>

          <input
            type="date"
            value={
              filters.dateTo
            }
            min={
              filters.dateFrom ||
              options.minDate ||
              undefined
            }
            max={
              options.maxDate ??
              undefined
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  dateTo:
                    event.target.value,
                }),
              )
            }
          />
        </label>

        <label>
          <span>Startmetod</span>

          <select
            value={
              filters.startMethod
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  startMethod:
                    event.target.value,
                }),
              )
            }
          >
            <option value="">
              Alla
            </option>

            <option value="AUTO">
              Autostart
            </option>

            <option value="VOLT">
              Voltstart
            </option>
          </select>
        </label>

        <label>
          <span>Distans</span>

          <select
            value={
              filters
                .distanceMeters ??
              ""
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  distanceMeters:
                    event.target.value
                      ? Number(
                          event.target
                            .value,
                        )
                      : null,
                }),
              )
            }
          >
            <option value="">
              Alla
            </option>

            {options.distances.map(
              (distance) => (
                <option
                  key={
                    distance
                  }
                  value={
                    distance
                  }
                >
                  {distance} meter
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Bana</span>

          <select
            value={
              filters.trackName
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  trackName:
                    event.target.value,
                }),
              )
            }
          >
            <option value="">
              Alla banor
            </option>

            {options.tracks.map(
              (track) => (
                <option
                  key={track}
                  value={track}
                >
                  {track}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Minsta styrka</span>

          <select
            value={
              filters.minStrength ??
              ""
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  minStrength:
                    event.target.value
                      ? Number(
                          event.target
                            .value,
                        )
                      : null,
                }),
              )
            }
          >
            <option value="">
              Alla
            </option>

            {[1, 2, 3, 4, 5, 6].map(
              (strength) => (
                <option
                  key={
                    strength
                  }
                  value={
                    strength
                  }
                >
                  Minst {strength}/6
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Minsta sänkning</span>

          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="1"
            placeholder="Alla"
            value={
              filters
                .minDropPercent ??
              ""
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  minDropPercent:
                    event.target.value
                      ? Number(
                          event.target
                            .value,
                        )
                      : null,
                }),
              )
            }
          />
        </label>

        <label className="research-checkbox">
          <input
            type="checkbox"
            checked={
              filters.completeOnly
            }
            onChange={(
              event,
            ) =>
              setFilters(
                (current) => ({
                  ...current,

                  completeOnly:
                    event.target
                      .checked,
                }),
              )
            }
          />

          <span>
            Endast komplett data
          </span>
        </label>

        <div className="research-filter-actions">
          <button
            type="button"
            className="research-primary-button"
            disabled={loading}
            onClick={() =>
              void runAnalysis()
            }
          >
            {loading
              ? "Analyserar..."
              : "Analysera"}
          </button>

          <button
            type="button"
            className="research-secondary-button"
            disabled={loading}
            onClick={
              resetFilters
            }
          >
            Återställ
          </button>
        </div>
      </div>

      {error ? (
        <div className="research-error">
          <strong>
            Analysen kunde inte laddas
          </strong>

          <span>{error}</span>

          <small>
            Supabase-migrationen måste vara körd innan fliken kan läsa forskningsarkivet.
          </small>
        </div>
      ) : null}

      <div className="research-summary-grid">
        <article>
          <span>Lopp</span>

          <strong>
            {summary.races}
          </strong>

          <small>
            {summary.bets} spel · {summary.voids} VOID
          </small>
        </article>

        <article>
          <span>Vinnare</span>

          <strong>
            {summary.wins}
          </strong>

          <small>
            {formatPercent(
              summary.winRatePercent,
            )}
          </small>
        </article>

        <article>
          <span>Plats</span>

          <strong>
            {summary.places}
          </strong>

          <small>
            {formatPercent(
              summary.placeRatePercent,
            )}
          </small>
        </article>

        <article>
          <span>Snitt låsodds</span>

          <strong>
            {formatOdds(
              summary.averageLockOdds,
            )}
          </strong>

          <small>
            Vinnarodds vid LOCK
          </small>
        </article>

        <article>
          <span>Snitt sänkning</span>

          <strong>
            {formatPercent(
              summary.averageDropPercent,
            )}
          </strong>

          <small>
            Start till LOCK
          </small>
        </article>

        <article>
          <span>Snittstyrka</span>

          <strong>
            {formatNumber(
              summary.averageStrength,
              2,
            )}
          </strong>

          <small>
            Av 6 indikatorer
          </small>
        </article>
      </div>

      <div className="research-market-grid">
        <article>
          <div>
            <span>
              VINNARE
            </span>

            <strong>
              100 kr per lopp
            </strong>
          </div>

          <dl>
            <div>
              <dt>Insats</dt>
              <dd>
                {formatMoney(
                  summary
                    .winnerMarket
                    .stake,
                )}
              </dd>
            </div>

            <div>
              <dt>Åter</dt>
              <dd>
                {formatMoney(
                  summary
                    .winnerMarket
                    .returnAmount,
                )}
              </dd>
            </div>

            <div>
              <dt>Netto</dt>
              <dd
                className={roiClass(
                  summary
                    .winnerMarket
                    .net,
                )}
              >
                {formatMoney(
                  summary
                    .winnerMarket
                    .net,
                )}
              </dd>
            </div>

            <div>
              <dt>ROI</dt>
              <dd
                className={roiClass(
                  summary
                    .winnerMarket
                    .roiPercent,
                )}
              >
                {formatPercent(
                  summary
                    .winnerMarket
                    .roiPercent,
                )}
              </dd>
            </div>
          </dl>
        </article>

        <article>
          <div>
            <span>
              PLATS
            </span>

            <strong>
              100 kr per lopp
            </strong>
          </div>

          <dl>
            <div>
              <dt>Insats</dt>
              <dd>
                {formatMoney(
                  summary
                    .placeMarket
                    .stake,
                )}
              </dd>
            </div>

            <div>
              <dt>Åter</dt>
              <dd>
                {formatMoney(
                  summary
                    .placeMarket
                    .returnAmount,
                )}
              </dd>
            </div>

            <div>
              <dt>Netto</dt>
              <dd
                className={roiClass(
                  summary
                    .placeMarket
                    .net,
                )}
              >
                {formatMoney(
                  summary
                    .placeMarket
                    .net,
                )}
              </dd>
            </div>

            <div>
              <dt>ROI</dt>
              <dd
                className={roiClass(
                  summary
                    .placeMarket
                    .roiPercent,
                )}
              >
                {formatPercent(
                  summary
                    .placeMarket
                    .roiPercent,
                )}
              </dd>
            </div>
          </dl>

          {summary
            .placeMarket
            .payoutMissing > 0 ? (
              <small className="research-warning-text">
                {
                  summary
                    .placeMarket
                    .payoutMissing
                } träffar saknar platsodds
              </small>
            ) : null}
        </article>

        <article className="is-combined">
          <div>
            <span>
              VINNARE + PLATS
            </span>

            <strong>
              200 kr per lopp
            </strong>
          </div>

          <dl>
            <div>
              <dt>Insats</dt>
              <dd>
                {formatMoney(
                  summary
                    .combinedMarket
                    .stake,
                )}
              </dd>
            </div>

            <div>
              <dt>Åter</dt>
              <dd>
                {formatMoney(
                  summary
                    .combinedMarket
                    .returnAmount,
                )}
              </dd>
            </div>

            <div>
              <dt>Netto</dt>
              <dd
                className={roiClass(
                  summary
                    .combinedMarket
                    .net,
                )}
              >
                {formatMoney(
                  summary
                    .combinedMarket
                    .net,
                )}
              </dd>
            </div>

            <div>
              <dt>ROI</dt>
              <dd
                className={roiClass(
                  summary
                    .combinedMarket
                    .roiPercent,
                )}
              >
                {formatPercent(
                  summary
                    .combinedMarket
                    .roiPercent,
                )}
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <section className="research-breakdown-panel">
        <div className="research-section-heading">
          <div>
            <span>JÄMFÖRELSE</span>

            <h3>
              Resultat per{" "}
              {groupingLabel(
                grouping,
              ).toLowerCase()}
            </h3>
          </div>

          <label>
            <span>Gruppera efter</span>

            <select
              value={grouping}
              onChange={(
                event,
              ) =>
                setGrouping(
                  event.target
                    .value as ResearchGrouping,
                )
              }
            >
              <option value="START_METHOD">
                Startmetod
              </option>

              <option value="DISTANCE">
                Distans
              </option>

              <option value="TRACK">
                Bana
              </option>

              <option value="STRENGTH">
                Styrka
              </option>
            </select>
          </label>
        </div>

        <div className="research-table-scroll">
          <table className="research-table">
            <thead>
              <tr>
                <th>
                  Grupp
                </th>

                <th>
                  Spel
                </th>

                <th>
                  Vinst
                </th>

                <th>
                  Plats
                </th>

                <th>
                  Snittodds
                </th>

                <th>
                  Snittras
                </th>

                <th>
                  ROI V
                </th>

                <th>
                  ROI P
                </th>

                <th>
                  ROI V+P
                </th>
              </tr>
            </thead>

            <tbody>
              {groups.map(
                (group) => (
                  <tr key={group.key}>
                    <td>
                      <strong>
                        {group.label}
                      </strong>
                    </td>

                    <td>
                      {group.bets}
                    </td>

                    <td>
                      {group.wins}
                      {" · "}
                      {formatPercent(
                        group.winRatePercent,
                      )}
                    </td>

                    <td>
                      {group.places}
                      {" · "}
                      {formatPercent(
                        group.placeRatePercent,
                      )}
                    </td>

                    <td>
                      {formatOdds(
                        group.averageLockOdds,
                      )}
                    </td>

                    <td>
                      {formatPercent(
                        group.averageDropPercent,
                      )}
                    </td>

                    <td
                      className={roiClass(
                        group.winnerRoiPercent,
                      )}
                    >
                      {formatPercent(
                        group.winnerRoiPercent,
                      )}
                    </td>

                    <td
                      className={roiClass(
                        group.placeRoiPercent,
                      )}
                    >
                      {formatPercent(
                        group.placeRoiPercent,
                      )}
                    </td>

                    <td
                      className={roiClass(
                        group.combinedRoiPercent,
                      )}
                    >
                      {formatPercent(
                        group.combinedRoiPercent,
                      )}
                    </td>
                  </tr>
                ),
              )}

              {!groups.length ? (
                <tr>
                  <td colSpan={9}>
                    Ingen historik matchar filtreringen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="research-detail-panel">
        <div className="research-section-heading">
          <div>
            <span>UNDERLAG</span>

            <h3>
              Lopp i urvalet
            </h3>
          </div>

          <small>
            Senaste 250 visas i tabellen
          </small>
        </div>

        <div className="research-table-scroll">
          <table className="research-table research-detail-table">
            <thead>
              <tr>
                <th>
                  Datum
                </th>

                <th>
                  Lopp
                </th>

                <th>
                  Häst
                </th>

                <th>
                  Start
                </th>

                <th>
                  Distans
                </th>

                <th>
                  Styrka
                </th>

                <th>
                  Startodds
                </th>

                <th>
                  Låsodds
                </th>

                <th>
                  Sänkning
                </th>

                <th>
                  Placering
                </th>

                <th>
                  Utfall
                </th>
              </tr>
            </thead>

            <tbody>
              {rows
                .slice(0, 250)
                .map(
                  (row) => (
                    <tr key={row.raceKey}>
                      <td>
                        {row.raceDate}
                      </td>

                      <td>
                        <strong>
                          {row.trackName}
                        </strong>

                        <small>
                          Lopp {row.raceNumber}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {row.runnerNumber}.{" "}
                          {row.horseName}
                        </strong>

                        <small>
                          Spår{" "}
                          {row.startLane ??
                            "–"}
                        </small>
                      </td>

                      <td>
                        {row.startMethod ??
                          "–"}
                      </td>

                      <td>
                        {row.distanceMeters
                          ? `${row.distanceMeters} m`
                          : "–"}
                      </td>

                      <td>
                        {row.strengthTotal ??
                          "–"}
                        /6
                      </td>

                      <td>
                        {formatOdds(
                          row.startOdds,
                        )}
                      </td>

                      <td>
                        {formatOdds(
                          row.lockOdds,
                        )}
                      </td>

                      <td>
                        {formatPercent(
                          row.oddsDropToLockPercent,
                        )}
                      </td>

                      <td>
                        {row.finishPositionOfficial ??
                          "–"}
                      </td>

                      <td>
                        <span
                          className={`research-result-chip ${resultClass(
                            row,
                          )}`}
                        >
                          {resultLabel(
                            row,
                          )}
                        </span>
                      </td>
                    </tr>
                  ),
                )}

              {!rows.length ? (
                <tr>
                  <td colSpan={11}>
                    Ingen historik matchar filtreringen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
