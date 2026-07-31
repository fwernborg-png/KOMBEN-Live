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
  ResearchGroupSummary,
  ResearchHistoryFilters,
  ResearchHistoryOptions,
  ResearchHistoryRow,
  ResearchLaneGroup,
  ResearchSelection,
  SimulatedMarketSummary,
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

    raceCategories: [],
    raceClassCodes: [],

    drivers: [],
    startLanes: [],
  };

type NumericFilterKey =
  | "distanceMeters"
  | "startLane"
  | "earningsMin"
  | "earningsMax"
  | "minStarters"
  | "maxStarters"
  | "minStrength"
  | "maxStrength"
  | "minDropPercent"
  | "maxDropPercent"
  | "minStartOdds"
  | "maxStartOdds"
  | "minLockOdds"
  | "maxLockOdds";

type GroupSort =
  | "BETS"
  | "WIN_RATE"
  | "PLACE_RATE"
  | "WINNER_ROI"
  | "PLACE_ROI"
  | "COMBINED_ROI";

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
    driverName: "",

    startLane: null,
    laneGroup: "ALL",

    raceCategory: "",
    raceClassCode: "",

    earningsMin: null,
    earningsMax: null,

    minStarters: null,
    maxStarters: null,

    minStrength: null,
    maxStrength: null,

    minDropPercent: null,
    maxDropPercent: null,

    minStartOdds: null,
    maxStartOdds: null,

    minLockOdds: null,
    maxLockOdds: null,

    completeOnly: false,
    limit: 5000,
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

  if (value === "DRIVER") {
    return "Kusk";
  }

  if (value === "START_LANE") {
    return "Startspår";
  }

  if (value === "RACE_CLASS") {
    return "Loppklass";
  }

  if (value === "LOCK_ODDS") {
    return "Låsoddsintervall";
  }

  return "Startmetod";
}

function laneGroupLabel(
  value: ResearchLaneGroup,
): string {
  if (value === "AUTO_INNER_1_5") {
    return "Autostart spår 1–5";
  }

  if (value === "AUTO_FRONT_1_8") {
    return "Autostart framspår 1–8";
  }

  if (value === "AUTO_BACK_9_12") {
    return "Autostart bakspår 9–12";
  }

  if (value === "AUTO_THIRD_13_15") {
    return "Autostart spår 13–15";
  }

  if (value === "VOLT_BASE") {
    return "Voltstart grundvolt";
  }

  if (value === "VOLT_HANDICAP") {
    return "Voltstart tillägg";
  }

  return "Alla spår";
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

function formatEarnings(
  value: number | null,
): string {
  if (value === null) {
    return "–";
  }

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

function sampleClass(
  bets: number,
): string {
  if (bets >= 50) {
    return "is-good";
  }

  if (bets >= 20) {
    return "is-medium";
  }

  return "is-small";
}

function sampleLabel(
  bets: number,
): string {
  if (bets >= 50) {
    return "Bra underlag";
  }

  if (bets >= 20) {
    return "Begränsat underlag";
  }

  return "För litet underlag";
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

function nullableSortValue(
  value: number | null,
): number {
  return value === null
    ? Number.NEGATIVE_INFINITY
    : value;
}

function groupSortValue(
  group: ResearchGroupSummary,
  sort: GroupSort,
): number {
  if (sort === "WIN_RATE") {
    return group.winRatePercent;
  }

  if (sort === "PLACE_RATE") {
    return group.placeRatePercent;
  }

  if (sort === "WINNER_ROI") {
    return nullableSortValue(
      group.winnerRoiPercent,
    );
  }

  if (sort === "PLACE_ROI") {
    return nullableSortValue(
      group.placeRoiPercent,
    );
  }

  if (sort === "COMBINED_ROI") {
    return nullableSortValue(
      group.combinedRoiPercent,
    );
  }

  return group.bets;
}

function validateFilters(
  filters: ResearchHistoryFilters,
): string | null {
  const pairs: Array<{
    label: string;
    minimum: number | null;
    maximum: number | null;
  }> = [
    {
      label: "startodds",
      minimum: filters.minStartOdds,
      maximum: filters.maxStartOdds,
    },
    {
      label: "låsodds",
      minimum: filters.minLockOdds,
      maximum: filters.maxLockOdds,
    },
    {
      label: "oddssänkning",
      minimum: filters.minDropPercent,
      maximum: filters.maxDropPercent,
    },
    {
      label: "styrka",
      minimum: filters.minStrength,
      maximum: filters.maxStrength,
    },
    {
      label: "antal startande",
      minimum: filters.minStarters,
      maximum: filters.maxStarters,
    },
    {
      label: "inkomstgräns",
      minimum: filters.earningsMin,
      maximum: filters.earningsMax,
    },
  ];

  for (const pair of pairs) {
    if (
      pair.minimum !== null &&
      pair.maximum !== null &&
      pair.minimum > pair.maximum
    ) {
      return (
        `Lägsta värdet för ${pair.label} ` +
        "kan inte vara högre än det högsta."
      );
    }
  }

  if (
    filters.dateFrom &&
    filters.dateTo &&
    filters.dateFrom >
      filters.dateTo
  ) {
    return (
      "Från-datum kan inte vara senare " +
      "än till-datum."
    );
  }

  return null;
}

function activeQuestion(
  filters: ResearchHistoryFilters,
): string {
  const parts: string[] = [
    selectionLabel(
      filters.selection,
    ),
  ];

  if (filters.startMethod) {
    parts.push(
      filters.startMethod === "AUTO"
        ? "autostart"
        : filters.startMethod === "VOLT"
          ? "voltstart"
          : filters.startMethod,
    );
  }

  if (filters.distanceMeters) {
    parts.push(
      `${filters.distanceMeters} meter`,
    );
  }

  if (
    filters.laneGroup !== "ALL"
  ) {
    parts.push(
      laneGroupLabel(
        filters.laneGroup,
      ),
    );
  } else if (
    filters.startLane !== null
  ) {
    parts.push(
      `spår ${filters.startLane}`,
    );
  }

  if (
    filters.minLockOdds !== null ||
    filters.maxLockOdds !== null
  ) {
    parts.push(
      `låsodds ${
        filters.minLockOdds ??
        "lägst"
      }–${
        filters.maxLockOdds ??
        "högst"
      }`,
    );
  }

  if (filters.trackName) {
    parts.push(
      filters.trackName,
    );
  }

  if (filters.driverName) {
    parts.push(
      filters.driverName,
    );
  }

  if (filters.raceClassCode) {
    parts.push(
      filters.raceClassCode,
    );
  } else if (
    filters.raceCategory
  ) {
    parts.push(
      filters.raceCategory,
    );
  }

  return parts.join(" · ");
}

function MarketCard(
  {
    title,
    subtitle,
    market,
    combined = false,
  }: {
    title: string;
    subtitle: string;
    market: SimulatedMarketSummary;
    combined?: boolean;
  },
) {
  return (
    <article
      className={
        combined
          ? "is-combined"
          : ""
      }
    >
      <div>
        <span>{title}</span>
        <strong>{subtitle}</strong>
      </div>

      <dl>
        <div>
          <dt>Insats</dt>
          <dd>
            {formatMoney(
              market.stake,
            )}
          </dd>
        </div>

        <div>
          <dt>Åter</dt>
          <dd>
            {formatMoney(
              market.returnAmount,
            )}
          </dd>
        </div>

        <div>
          <dt>Netto</dt>
          <dd
            className={
              market.net >= 0
                ? "is-positive"
                : "is-negative"
            }
          >
            {formatMoney(
              market.net,
            )}
          </dd>
        </div>

        <div>
          <dt>ROI</dt>
          <dd
            className={
              roiClass(
                market.roiPercent,
              )
            }
          >
            {formatPercent(
              market.roiPercent,
            )}
          </dd>
        </div>
      </dl>

      {market.payoutMissing > 0 ? (
        <small className="research-warning-text">
          Utbetalningsodds saknas för{" "}
          {market.payoutMissing} träffar.
        </small>
      ) : null}
    </article>
  );
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
    groupSort,
    setGroupSort,
  ] = useState<
    GroupSort
  >("BETS");

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

  const [
    filtersOpen,
    setFiltersOpen,
  ] = useState(true);

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

  const sortedGroups =
    useMemo(
      () =>
        [...groups].sort(
          (a, b) =>
            groupSortValue(
              b,
              groupSort,
            ) -
              groupSortValue(
                a,
                groupSort,
              ) ||
            b.bets -
              a.bets ||
            a.label.localeCompare(
              b.label,
              "sv",
            ),
        ),
      [
        groups,
        groupSort,
      ],
    );

  function updateFilter<
    Key extends keyof ResearchHistoryFilters,
  >(
    key: Key,
    value: ResearchHistoryFilters[Key],
  ) {
    setFilters(
      (current) => ({
        ...current,
        [key]: value,
      }),
    );
  }

  function updateNumber(
    key: NumericFilterKey,
    rawValue: string,
  ) {
    const normalized =
      rawValue
        .trim()
        .replace(",", ".");

    if (!normalized) {
      updateFilter(
        key,
        null,
      );

      return;
    }

    const value =
      Number(normalized);

    updateFilter(
      key,
      Number.isFinite(value)
        ? value
        : null,
    );
  }

  async function runAnalysis(
    nextFilters =
      filters,
  ) {
    const validationError =
      validateFilters(
        nextFilters,
      );

    if (validationError) {
      setError(
        validationError,
      );

      return;
    }

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

      setFiltersOpen(false);
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

  function applyLockOddsPreset(
    minimum: number | null,
    maximum: number | null,
  ) {
    setFilters(
      (current) => ({
        ...current,
        minLockOdds: minimum,
        maxLockOdds: maximum,
      }),
    );
  }

  const question =
    activeQuestion(
      filters,
    );

  const activeFilterLabels: string[] = [
    `Strategi: ${selectionLabel(filters.selection)}`,
    `Datum: ${filters.dateFrom || "–"} – ${filters.dateTo || "–"}`,
    `Startmetod: ${filters.startMethod || "Alla"}`,
  ];

  if (filters.distanceMeters !== null) {
    activeFilterLabels.push(
      `Distans: ${filters.distanceMeters} m`,
    );
  }

  if (filters.trackName) {
    activeFilterLabels.push(
      `Bana: ${filters.trackName}`,
    );
  }

  if (filters.driverName) {
    activeFilterLabels.push(
      `Kusk: ${filters.driverName}`,
    );
  }

  if (filters.startLane !== null) {
    activeFilterLabels.push(
      `Spår: ${filters.startLane}`,
    );
  } else if (filters.laneGroup !== "ALL") {
    activeFilterLabels.push(
      `Spår: ${laneGroupLabel(filters.laneGroup)}`,
    );
  }

  if (
    filters.minLockOdds !== null ||
    filters.maxLockOdds !== null
  ) {
    activeFilterLabels.push(
      `Låsodds: ${filters.minLockOdds ?? "lägst"}–${filters.maxLockOdds ?? "högst"}`,
    );
  }

  if (
    filters.minDropPercent !== null ||
    filters.maxDropPercent !== null
  ) {
    activeFilterLabels.push(
      `Sänkning: ${filters.minDropPercent ?? "lägst"}–${filters.maxDropPercent ?? "högst"} %`,
    );
  }

  if (filters.raceClassCode) {
    activeFilterLabels.push(
      `Loppklass: ${filters.raceClassCode}`,
    );
  }

  const completedRows =
    rows.filter(
      (row) =>
        row.betVoid ||
        row.finishPositionOfficial !== null,
    ).length;

  const dataQualityPercent =
    rows.length > 0
      ? Math.round(
          completedRows /
          rows.length *
          100,
        )
      : 0;

  const qualityStars =
    rows.length >= 100 &&
    dataQualityPercent >= 95
      ? 5
      : rows.length >= 50
        ? 4
        : rows.length >= 20
          ? 3
          : rows.length >= 10
            ? 2
            : 1;

  return (
    <section className="tab-section research-history research-dashboard-light">
      <div className="research-dashboard-hero">
        <div>
          <p className="research-kicker">
            PLATSJÄGAREN
          </p>

          <h2 className="research-title">
            Historik & analys
          </h2>

          <p className="research-subtitle">
            Analysera tidigare lopp och filtrera fram
            mönster, träffprocent, netto och ROI.
          </p>
        </div>

        <div className="research-dashboard-actions">
          <button
            type="button"
            className="research-reset-primary"
            onClick={resetFilters}
            disabled={loading}
          >
            Återställ filter
          </button>

          <button
            type="button"
            className="research-run-primary"
            onClick={() => void runAnalysis()}
            disabled={loading}
          >
            {loading
              ? "Analyserar…"
              : "Kör analys"}
          </button>
        </div>
      </div>

      <div className="research-filter-summary-bar">
        <button
          type="button"
          className="research-filter-toggle"
          onClick={() =>
            setFiltersOpen(
              (current) => !current,
            )
          }
          aria-expanded={filtersOpen}
        >
          <span className="research-filter-symbol">
            ◇
          </span>

          <strong>
            Filter ({activeFilterLabels.length} aktiva)
          </strong>
        </button>

        <div className="research-active-filter-chips">
          {activeFilterLabels.map(
            (label) => (
              <span key={label}>
                {label}
              </span>
            ),
          )}
        </div>

        <button
          type="button"
          className="research-filter-toggle-secondary"
          onClick={() =>
            setFiltersOpen(
              (current) => !current,
            )
          }
        >
          {filtersOpen
            ? "Dölj filter"
            : "Visa / ändra filter"}

          <span aria-hidden="true">
            {filtersOpen ? "⌃" : "⌄"}
          </span>
        </button>
      </div>

      <div className="panel-header-row research-history-header research-old-header">
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
            Arkiverade lopp
            <strong>
              {options.raceCount}
            </strong>
          </span>

          <span>
            Visade lopp
            <strong>
              {rows.length}
            </strong>
          </span>

          <span>
            Senast
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
        <span>Aktuell undersökning</span>
        <strong>{question}</strong>
      </div>

      <div
        className={`research-filter-collapse ${
          filtersOpen
            ? "is-open"
            : "is-closed"
        }`}
      >
        <div className="research-filter-panel research-filter-panel-v2">
        <fieldset className="research-filter-section">
          <legend>
            1. Strategi och period
          </legend>

          <div className="research-filter-grid">
            <label>
              <span>Strategi</span>

              <select
                value={
                  filters.selection
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "selection",
                    event.target
                      .value as ResearchSelection,
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
                  updateFilter(
                    "dateFrom",
                    event.target.value,
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
                  updateFilter(
                    "dateTo",
                    event.target.value,
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
                  updateFilter(
                    "startMethod",
                    event.target.value,
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

                <option value="UNKNOWN">
                  Okänd startmetod
                </option>
              </select>
            </label>

            <label>
              <span>Distans</span>

              <select
                value={
                  filters.distanceMeters ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "distanceMeters",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Alla distanser
                </option>

                {options.distances.map(
                  (distance) => (
                    <option
                      key={distance}
                      value={distance}
                    >
                      {distance} meter
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="research-filter-section">
          <legend>
            2. Odds och marknadsrörelse
          </legend>

          <div className="research-preset-area">
            <span>
              Snabbval för låsodds
            </span>

            <div className="research-preset-row">
              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    null,
                    null,
                  )
                }
              >
                Alla
              </button>

              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    null,
                    2.99,
                  )
                }
              >
                Under 3
              </button>

              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    3,
                    5,
                  )
                }
              >
                3–5
              </button>

              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    5,
                    10,
                  )
                }
              >
                5–10
              </button>

              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    10,
                    15,
                  )
                }
              >
                10–15
              </button>

              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    15,
                    25,
                  )
                }
              >
                15–25
              </button>

              <button
                type="button"
                onClick={() =>
                  applyLockOddsPreset(
                    25,
                    null,
                  )
                }
              >
                25+
              </button>
            </div>
          </div>

          <div className="research-filter-grid">
            <label>
              <span>Startodds från</span>

              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                placeholder="Alla"
                value={
                  filters.minStartOdds ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "minStartOdds",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Startodds till</span>

              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                placeholder="Alla"
                value={
                  filters.maxStartOdds ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "maxStartOdds",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Låsodds från</span>

              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                placeholder="Alla"
                value={
                  filters.minLockOdds ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "minLockOdds",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Låsodds till</span>

              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                placeholder="Alla"
                value={
                  filters.maxLockOdds ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "maxLockOdds",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Sänkning från %</span>

              <input
                type="number"
                inputMode="decimal"
                step="1"
                placeholder="Alla"
                value={
                  filters.minDropPercent ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "minDropPercent",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Sänkning till %</span>

              <input
                type="number"
                inputMode="decimal"
                step="1"
                placeholder="Alla"
                value={
                  filters.maxDropPercent ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "maxDropPercent",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="research-filter-section">
          <legend>
            3. Startspår
          </legend>

          <div className="research-filter-grid">
            <label>
              <span>Exakt startspår</span>

              <select
                value={
                  filters.startLane ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "startLane",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Alla spår
                </option>

                {options.startLanes.map(
                  (lane) => (
                    <option
                      key={lane}
                      value={lane}
                    >
                      Spår {lane}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Spårgrupp</span>

              <select
                value={
                  filters.laneGroup
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "laneGroup",
                    event.target
                      .value as ResearchLaneGroup,
                  )
                }
              >
                <option value="ALL">
                  Alla spår
                </option>

                <option value="AUTO_INNER_1_5">
                  Auto: spår 1–5
                </option>

                <option value="AUTO_FRONT_1_8">
                  Auto: framspår 1–8
                </option>

                <option value="AUTO_BACK_9_12">
                  Auto: bakspår 9–12
                </option>

                <option value="AUTO_THIRD_13_15">
                  Auto: spår 13–15
                </option>

                <option value="VOLT_BASE">
                  Volt: grundvolt
                </option>

                <option value="VOLT_HANDICAP">
                  Volt: tillägg
                </option>
              </select>
            </label>
          </div>

          <p className="research-filter-help">
            Exempel: Mest sänkta hästen, låsodds
            10–15 och autostart framspår 1–8.
          </p>
        </fieldset>

        <fieldset className="research-filter-section">
          <legend>
            4. Bana och kusk
          </legend>

          <div className="research-filter-grid">
            <label>
              <span>Bana</span>

              <select
                value={
                  filters.trackName
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "trackName",
                    event.target.value,
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
              <span>Kusk</span>

              <input
                type="text"
                list="research-driver-options"
                placeholder="Alla kuskar"
                value={
                  filters.driverName
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "driverName",
                    event.target.value,
                  )
                }
              />

              <datalist id="research-driver-options">
                {options.drivers.map(
                  (driver) => (
                    <option
                      key={driver}
                      value={driver}
                    />
                  ),
                )}
              </datalist>
            </label>
          </div>
        </fieldset>

        <fieldset className="research-filter-section">
          <legend>
            5. Loppklass och inkomstgräns
          </legend>

          <div className="research-filter-grid">
            <label>
              <span>Loppkategori</span>

              <select
                value={
                  filters.raceCategory
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "raceCategory",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Alla kategorier
                </option>

                {options.raceCategories.map(
                  (category) => (
                    <option
                      key={category}
                      value={category}
                    >
                      {category}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Loppklass</span>

              <select
                value={
                  filters.raceClassCode
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "raceClassCode",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Alla klasser
                </option>

                {options.raceClassCodes.map(
                  (raceClass) => (
                    <option
                      key={raceClass}
                      value={raceClass}
                    >
                      {raceClass}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Inkomstgräns från</span>

              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="10000"
                placeholder="Alla"
                value={
                  filters.earningsMin ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "earningsMin",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Inkomstgräns till</span>

              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="10000"
                placeholder="Alla"
                value={
                  filters.earningsMax ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "earningsMax",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="research-filter-section">
          <legend>
            6. Startfält och styrka
          </legend>

          <div className="research-filter-grid">
            <label>
              <span>Minst startande</span>

              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                step="1"
                placeholder="Alla"
                value={
                  filters.minStarters ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "minStarters",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Högst startande</span>

              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                step="1"
                placeholder="Alla"
                value={
                  filters.maxStarters ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "maxStarters",
                    event.target.value,
                  )
                }
              />
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
                  updateNumber(
                    "minStrength",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Alla
                </option>

                {[0, 1, 2, 3, 4, 5, 6].map(
                  (strength) => (
                    <option
                      key={strength}
                      value={strength}
                    >
                      Minst {strength}/6
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Högsta styrka</span>

              <select
                value={
                  filters.maxStrength ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  updateNumber(
                    "maxStrength",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Alla
                </option>

                {[0, 1, 2, 3, 4, 5, 6].map(
                  (strength) => (
                    <option
                      key={strength}
                      value={strength}
                    >
                      Högst {strength}/6
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="research-filter-section">
          <legend>
            7. Datakvalitet
          </legend>

          <div className="research-filter-grid">
            <label className="research-checkbox">
              <input
                type="checkbox"
                checked={
                  filters.completeOnly
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "completeOnly",
                    event.target.checked,
                  )
                }
              />

              <span>
                Endast helt komplett LOCK-data
              </span>
            </label>

            <label>
              <span>Max antal rader</span>

              <select
                value={
                  filters.limit
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "limit",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              >
                <option value={500}>
                  500
                </option>

                <option value={2000}>
                  2 000
                </option>

                <option value={5000}>
                  5 000
                </option>

                <option value={10000}>
                  10 000
                </option>
              </select>
            </label>
          </div>
        </fieldset>

        <div className="research-filter-actions research-filter-actions-v2">
          <button
            type="button"
            className="research-primary-button"
            disabled={loading}
            onClick={() =>
              void runAnalysis()
            }
          >
            {loading
              ? "Analyserar…"
              : "Kör analys"}
          </button>

          <button
            type="button"
            className="research-secondary-button"
            disabled={loading}
            onClick={
              resetFilters
            }
          >
            Nollställ filter
          </button>
        </div>
      </div>

        </div>

      {/* research-filter-collapse-end */}

      {error ? (
        <div className="research-error">
          <strong>
            Analysen kunde inte köras
          </strong>

          <small>{error}</small>
        </div>
      ) : null}

      <div
        className={
          `research-sample-box ${
            sampleClass(
              summary.bets,
            )
          }`
        }
      >
        <div>
          <span>UNDERLAG</span>

          <strong>
            {sampleLabel(
              summary.bets,
            )}
          </strong>
        </div>

        <p>
          Resultatet bygger på{" "}
          <strong>
            {summary.bets} spel
          </strong>
          . Färre än 20 spel ska inte användas
          för slutsatser. Minst 50 ger ett mer
          användbart första underlag.
        </p>
      </div>

      <div className="research-dashboard-section-heading">
        <div>
          <span>Sammanfattning av resultat</span>

          <small>
            Resultatet bygger på de valda filtren.
          </small>
        </div>

        <div className="research-data-quality-inline">
          <span>Datakvalitet</span>

          <strong>
            {"★".repeat(qualityStars)}
            {"☆".repeat(5 - qualityStars)}
          </strong>

          <small>
            {rows.length} lopp · {dataQualityPercent} % kompletta
          </small>
        </div>
      </div>

      <div className="research-summary-grid">
        <article>
          <span>Lopp</span>
          <strong>
            {summary.races}
          </strong>
          <small>
            VOID: {summary.voids}
          </small>
        </article>

        <article>
          <span>Vinster</span>
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
          <span>Platser</span>
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
            odds vid LOCK
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
            start till LOCK
          </small>
        </article>

        <article>
          <span>Snitt styrka</span>
          <strong>
            {formatNumber(
              summary.averageStrength,
              1,
            )}
          </strong>
          <small>
            av 6 faktorer
          </small>
        </article>
      </div>

      <div className="research-market-grid">
        <MarketCard
          title="VINNARE"
          subtitle={`${RESEARCH_STAKE_SEK} kr per spel`}
          market={
            summary.winnerMarket
          }
        />

        <MarketCard
          title="PLATS"
          subtitle={`${RESEARCH_STAKE_SEK} kr per spel`}
          market={
            summary.placeMarket
          }
        />

        <MarketCard
          title="VINNARE + PLATS"
          subtitle={`${RESEARCH_STAKE_SEK * 2} kr per lopp`}
          market={
            summary.combinedMarket
          }
          combined
        />
      </div>

      <div className="research-breakdown-panel">
        <div className="research-section-heading research-section-heading-v2">
          <div>
            <span>JÄMFÖRELSE</span>

            <h3>
              Resultat uppdelat per{" "}
              {groupingLabel(
                grouping,
              ).toLowerCase()}
            </h3>
          </div>

          <div className="research-group-controls">
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

                <option value="DRIVER">
                  Kusk
                </option>

                <option value="START_LANE">
                  Startspår
                </option>

                <option value="RACE_CLASS">
                  Loppklass
                </option>

                <option value="LOCK_ODDS">
                  Låsoddsintervall
                </option>

                <option value="STRENGTH">
                  Styrka
                </option>
              </select>
            </label>

            <label>
              <span>Sortera efter</span>

              <select
                value={groupSort}
                onChange={(
                  event,
                ) =>
                  setGroupSort(
                    event.target
                      .value as GroupSort,
                  )
                }
              >
                <option value="BETS">
                  Antal spel
                </option>

                <option value="WIN_RATE">
                  Vinstprocent
                </option>

                <option value="PLACE_RATE">
                  Platsprocent
                </option>

                <option value="WINNER_ROI">
                  Vinnare-ROI
                </option>

                <option value="PLACE_ROI">
                  Plats-ROI
                </option>

                <option value="COMBINED_ROI">
                  Kombinerad ROI
                </option>
              </select>
            </label>
          </div>
        </div>

        <div className="research-table-scroll">
          <table className="research-table research-group-table">
            <thead>
              <tr>
                <th>
                  {groupingLabel(
                    grouping,
                  )}
                </th>

                <th>Underlag</th>
                <th>Spel</th>
                <th>Vinster</th>
                <th>Vinst %</th>
                <th>Platser</th>
                <th>Plats %</th>
                <th>Snittodds</th>
                <th>Sänkning</th>
                <th>Vinnare ROI</th>
                <th>Plats ROI</th>
                <th>V+P ROI</th>
              </tr>
            </thead>

            <tbody>
              {sortedGroups.map(
                (group) => (
                  <tr key={group.key}>
                    <td>
                      <strong>
                        {group.label}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={
                          `research-sample-badge ${
                            sampleClass(
                              group.bets,
                            )
                          }`
                        }
                      >
                        {sampleLabel(
                          group.bets,
                        )}
                      </span>
                    </td>

                    <td>{group.bets}</td>
                    <td>{group.wins}</td>

                    <td>
                      {formatPercent(
                        group.winRatePercent,
                      )}
                    </td>

                    <td>{group.places}</td>

                    <td>
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
                      className={
                        roiClass(
                          group.winnerRoiPercent,
                        )
                      }
                    >
                      {formatPercent(
                        group.winnerRoiPercent,
                      )}
                    </td>

                    <td
                      className={
                        roiClass(
                          group.placeRoiPercent,
                        )
                      }
                    >
                      {formatPercent(
                        group.placeRoiPercent,
                      )}
                    </td>

                    <td
                      className={
                        roiClass(
                          group.combinedRoiPercent,
                        )
                      }
                    >
                      {formatPercent(
                        group.combinedRoiPercent,
                      )}
                    </td>
                  </tr>
                ),
              )}

              {!sortedGroups.length ? (
                <tr>
                  <td colSpan={12}>
                    Inga lopp matchar de valda filtren.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="research-detail-panel">
        <div className="research-section-heading">
          <div>
            <span>LOPP FÖR LOPP</span>

            <h3>
              Matchande hästar
            </h3>
          </div>

          <small>
            {rows.length} valda hästar
          </small>
        </div>

        <div className="research-table-scroll">
          <table className="research-table research-detail-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Lopp</th>
                <th>Häst</th>
                <th>Kusk</th>
                <th>Start</th>
                <th>Klass</th>
                <th>Inkomstgräns</th>
                <th>Startodds</th>
                <th>Låsodds</th>
                <th>Sänkning</th>
                <th>Styrka</th>
                <th>Resultat</th>
                <th>Vinnarodds</th>
                <th>Platsodds</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(
                (row) => (
                  <tr
                    key={
                      `${row.raceKey}-${row.runnerNumber}`
                    }
                  >
                    <td>{row.raceDate}</td>

                    <td>
                      <strong>
                        {row.trackName} L{row.raceNumber}
                      </strong>

                      <small>
                        {row.startMethod ?? "–"} ·{" "}
                        {row.distanceMeters ?? "–"} m
                      </small>
                    </td>

                    <td>
                      <strong>
                        {row.runnerNumber}. {row.horseName}
                      </strong>

                      <small>
                        {row.isFavoriteAtLock
                          ? "Favorit vid LOCK"
                          : "Ej favorit vid LOCK"}
                      </small>
                    </td>

                    <td>
                      {row.driverName ?? "–"}
                    </td>

                    <td>
                      <strong>
                        Spår {row.startLane ?? "–"}
                      </strong>

                      <small>
                        {row.distanceHandicapMeters &&
                        row.distanceHandicapMeters > 0
                          ? `Tillägg ${row.distanceHandicapMeters} m`
                          : "Grunddistans"}
                      </small>
                    </td>

                    <td>
                      <strong>
                        {row.raceClassCode ??
                          row.raceCategory ??
                          "–"}
                      </strong>

                      <small>
                        {row.raceName ?? ""}
                      </small>
                    </td>

                    <td>
                      {row.earningsMin !== null ||
                      row.earningsMax !== null
                        ? `${
                            formatEarnings(
                              row.earningsMin,
                            )
                          } – ${
                            formatEarnings(
                              row.earningsMax,
                            )
                          }`
                        : "–"}
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
                      {row.strengthTotal === null
                        ? "–"
                        : `${row.strengthTotal}/6`}
                    </td>

                    <td>
                      <span
                        className={
                          `research-result-chip ${
                            resultClass(
                              row,
                            )
                          }`
                        }
                      >
                        {resultLabel(
                          row,
                        )}
                      </span>

                      <small>
                        Placering{" "}
                        {row.finishPositionOfficial ??
                          "–"}
                      </small>
                    </td>

                    <td>
                      {formatOdds(
                        row.officialWinOddsDecimal,
                      )}
                    </td>

                    <td>
                      {formatOdds(
                        row.officialPlaceOddsDecimal,
                      )}
                    </td>
                  </tr>
                ),
              )}

              {!rows.length ? (
                <tr>
                  <td colSpan={14}>
                    Inga lopp matchar de valda filtren.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
