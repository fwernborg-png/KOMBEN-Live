import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  computeResearchHistorySummary,
  RESEARCH_STAKE_SEK,
} from "./analytics";

import {
  loadGallopHistoryOptions,
  loadGallopHistoryRows,
  type GallopHistoryFilters,
  type GallopHistoryOptions,
  type GallopHistoryRow,
  type GallopSelection,
} from "./gallopRepository";

import "./researchHistory.css";

const EMPTY_OPTIONS:
  GallopHistoryOptions = {
    minDate: null,
    maxDate: null,

    raceCount: 0,

    countries: [],
    tracks: [],
    surfaces: [],
    distances: [],
  };

function dateOffset(
  value: string,
  days: number,
): string {
  const date =
    new Date(
      `${value}T12:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  date.setDate(
    date.getDate() + days,
  );

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1,
    ).padStart(2, "0"),

    String(
      date.getDate(),
    ).padStart(2, "0"),
  ].join("-");
}

function buildFilters(
  options:
    GallopHistoryOptions,
): GallopHistoryFilters {
  const dateTo =
    options.maxDate ??
    new Date()
      .toISOString()
      .slice(0, 10);

  const desiredFrom =
    dateOffset(
      dateTo,
      -89,
    );

  const dateFrom =
    options.minDate &&
    options.minDate >
      desiredFrom
      ? options.minDate
      : desiredFrom;

  return {
    dateFrom,
    dateTo,

    selection: "S1",

    countryCode: "",
    trackName: "",
    surface: "",

    distanceMeters: null,

    minStarters: null,
    maxStarters: null,

    minHandicapRating: null,
    maxHandicapRating: null,

    handicapRank: "",

    minCarriedWeightKg: null,
    maxCarriedWeightKg: null,

    weightRank: "",

    minDropPercent: null,
    maxDropPercent: null,

    minLockOdds: null,
    maxLockOdds: null,

    limit: 5000,
  };
}

function parseNumber(
  value: string,
): number | null {
  const normalized =
    value
      .trim()
      .replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed =
    Number(normalized);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
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
  return value === null
    ? "–"
    : `${formatNumber(
        value,
        1,
      )} %`;
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

function resultText(
  row: GallopHistoryRow,
): string {
  if (row.betVoid) {
    return "VOID";
  }

  if (row.winnerOfficial) {
    return "VINNARE";
  }

  if (
    row.placedOfficial ===
    true
  ) {
    return "PLATS";
  }

  return "MISS";
}

function resultClass(
  row: GallopHistoryRow,
): string {
  if (row.betVoid) {
    return "is-void";
  }

  if (row.winnerOfficial) {
    return "is-win";
  }

  if (
    row.placedOfficial ===
    true
  ) {
    return "is-place";
  }

  return "is-miss";
}

function countryLabel(
  code: string,
): string {
  const labels:
    Record<string, string> = {
      SE: "🇸🇪 Sverige",
      NO: "🇳🇴 Norge",
      DK: "🇩🇰 Danmark",
      FR: "🇫🇷 Frankrike",
      GB: "🇬🇧 Storbritannien",
      IE: "🇮🇪 Irland",
      ZA: "🇿🇦 Sydafrika",
      AU: "🇦🇺 Australien",
      NZ: "🇳🇿 Nya Zeeland",
      US: "🇺🇸 USA",
      CA: "🇨🇦 Kanada",
      HK: "🇭🇰 Hongkong",
      AE: "🇦🇪 Förenade Arabemiraten",
      DE: "🇩🇪 Tyskland",
    };

  return (
    labels[code] ??
    code
  );
}

function surfaceLabel(
  surface: string,
): string {
  const normalized =
    surface
      .trim()
      .toLowerCase();

  if (normalized === "turf") {
    return "Turf";
  }

  if (normalized === "dirt") {
    return "Dirt";
  }

  return surface;
}

type CountrySummary = {
  countryCode: string;

  races: number;
  bets: number;

  wins: number;
  places: number;

  averageDropPercent:
    number | null;

  winnerRoiPercent:
    number | null;

  placeRoiPercent:
    number | null;

  combinedRoiPercent:
    number | null;
};

function buildCountrySummaries(
  rows: GallopHistoryRow[],
): CountrySummary[] {
  const grouped =
    new Map<
      string,
      GallopHistoryRow[]
    >();

  for (const row of rows) {
    const existing =
      grouped.get(
        row.countryCode,
      ) ?? [];

    existing.push(row);

    grouped.set(
      row.countryCode,
      existing,
    );
  }

  return [
    ...grouped.entries(),
  ]
    .map(
      ([
        countryCode,
        countryRows,
      ]) => {
        const summary =
          computeResearchHistorySummary(
            countryRows,
          );

        return {
          countryCode,

          races:
            summary.races,

          bets:
            summary.bets,

          wins:
            summary.wins,

          places:
            summary.places,

          averageDropPercent:
            summary.averageDropPercent,

          winnerRoiPercent:
            summary
              .winnerMarket
              .roiPercent,

          placeRoiPercent:
            summary
              .placeMarket
              .roiPercent,

          combinedRoiPercent:
            summary
              .combinedMarket
              .roiPercent,
        };
      },
    )
    .sort(
      (a, b) =>
        b.bets -
          a.bets ||
        a.countryCode.localeCompare(
          b.countryCode,
        ),
    );
}

export function ResearchGallopPanel() {
  const [
    options,
    setOptions,
  ] = useState(
    EMPTY_OPTIONS,
  );

  const [
    filters,
    setFilters,
  ] = useState<
    GallopHistoryFilters
  >(
    buildFilters(
      EMPTY_OPTIONS,
    ),
  );

  const [
    rows,
    setRows,
  ] = useState<
    GallopHistoryRow[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    filtersOpen,
    setFiltersOpen,
  ] = useState(true);

  const [
    advancedFiltersOpen,
    setAdvancedFiltersOpen,
  ] = useState(false);

  const [
    loadedAt,
    setLoadedAt,
  ] = useState<
    string | null
  >(null);

  const summary =
    useMemo(
      () =>
        computeResearchHistorySummary(
          rows,
        ),
      [rows],
    );

  const countrySummaries =
    useMemo(
      () =>
        buildCountrySummaries(
          rows,
        ),
      [rows],
    );

  const availableTracks =
    useMemo(
      () =>
        options.tracks,
      [options.tracks],
    );

  async function load(
    nextFilters:
      GallopHistoryFilters,
  ) {
    setLoading(true);
    setError("");

    try {
      const loadedRows =
        await loadGallopHistoryRows(
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
          : "Okänt fel vid galoppanalys",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const loadedOptions =
          await loadGallopHistoryOptions();

        const initial =
          buildFilters(
            loadedOptions,
          );

        const loadedRows =
          await loadGallopHistoryRows(
            initial,
          );

        if (cancelled) {
          return;
        }

        setOptions(
          loadedOptions,
        );

        setFilters(
          initial,
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
            : "Okänt fel vid galoppanalys",
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

  function updateFilter<
    Key extends keyof GallopHistoryFilters,
  >(
    key: Key,
    value:
      GallopHistoryFilters[Key],
  ) {
    setFilters(
      (current) => ({
        ...current,
        [key]: value,
      }),
    );
  }

  function updateNumber(
    key:
      | "distanceMeters"
      | "minStarters"
      | "maxStarters"
      | "minHandicapRating"
      | "maxHandicapRating"
      | "minCarriedWeightKg"
      | "maxCarriedWeightKg"
      | "minDropPercent"
      | "maxDropPercent"
      | "minLockOdds"
      | "maxLockOdds",
    value: string,
  ) {
    updateFilter(
      key,
      parseNumber(
        value,
      ),
    );
  }

  function reset() {
    const next =
      buildFilters(
        options,
      );

    setFilters(next);

    void load(next);
  }

  const uniqueRaces =
    new Set(
      rows.map(
        (row) =>
          row.raceKey,
      ),
    ).size;

  const handicapRows =
    rows.filter(
      (row) =>
        row.handicapRating !==
        null,
    ).length;

  return (
    <section className="tab-section research-history research-dashboard-light research-gallop-page">
      <div className="research-dashboard-hero research-gallop-hero">
        <div>
          <p className="research-kicker">
            INTERNATIONELLT GALOPPARKIV
          </p>

          <h2 className="research-title">
            🏇 Galopp – Historik & analys
          </h2>

          <p className="research-subtitle">
            Jämför länder, banor, underlag,
            handicap, vikt och oddsrörelser.
            Varje rad motsvarar hästen i valt urval.
          </p>
        </div>

        <div className="research-dashboard-actions">
          <button
            type="button"
            className="research-reset-primary"
            onClick={reset}
            disabled={loading}
          >
            Återställ
          </button>

          <button
            type="button"
            className="research-run-primary"
            onClick={() =>
              void load(filters)
            }
            disabled={loading}
          >
            {loading
              ? "Analyserar…"
              : "Kör galoppanalys"}
          </button>
        </div>
      </div>

      <div className="research-gallop-status">
        <div>
          <span>
            Lopp
          </span>

          <strong>
            {uniqueRaces}
          </strong>
        </div>

        <div>
          <span>
            Urval
          </span>

          <strong>
            {rows.length}
          </strong>
        </div>

        <div>
          <span>
            Snittsänkning
          </span>

          <strong>
            {formatPercent(
              summary.averageDropPercent,
            )}
          </strong>
        </div>

        <div>
          <span>
            Handicap-täckning
          </span>

          <strong>
            {rows.length
              ? `${Math.round(
                  handicapRows /
                    rows.length *
                    100,
                )} %`
              : "–"}
          </strong>
        </div>
      </div>

      <div className="research-gallop-market-grid">
        <article className="research-gallop-market-card">
          <div className="research-gallop-market-card-head">
            <span>
              VINNARE
            </span>

            <small>
              {RESEARCH_STAKE_SEK} kr per spel
            </small>
          </div>

          <div className="research-gallop-market-metrics">
            <div className="research-gallop-market-metric">
              <span>
                Insats
              </span>

              <strong>
                {formatMoney(
                  summary
                    .winnerMarket
                    .stake,
                )}
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                Åter
              </span>

              <strong>
                {formatMoney(
                  summary
                    .winnerMarket
                    .returnAmount,
                )}
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                Netto
              </span>

              <strong
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
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                ROI
              </span>

              <strong
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
              </strong>
            </div>
          </div>

          <div className="research-gallop-market-foot">
            {summary.wins} vinnare av{" "}
            {summary.bets} spel
          </div>
        </article>

        <article className="research-gallop-market-card">
          <div className="research-gallop-market-card-head">
            <span>
              PLATS
            </span>

            <small>
              {RESEARCH_STAKE_SEK} kr per spel
            </small>
          </div>

          <div className="research-gallop-market-metrics">
            <div className="research-gallop-market-metric">
              <span>
                Insats
              </span>

              <strong>
                {formatMoney(
                  summary
                    .placeMarket
                    .stake,
                )}
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                Åter
              </span>

              <strong>
                {formatMoney(
                  summary
                    .placeMarket
                    .returnAmount,
                )}
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                Netto
              </span>

              <strong
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
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                ROI
              </span>

              <strong
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
              </strong>
            </div>
          </div>

          <div className="research-gallop-market-foot">
            {summary.places} platser av{" "}
            {summary.bets} spel
          </div>
        </article>

        <article className="research-gallop-market-card">
          <div className="research-gallop-market-card-head">
            <span>
              VINNARE + PLATS
            </span>

            <small>
              {RESEARCH_STAKE_SEK * 2} kr{" "}
              {filters.selection === "ALL_RUNNERS"
                ? "per häst"
                : "per lopp"}
            </small>
          </div>

          <div className="research-gallop-market-metrics">
            <div className="research-gallop-market-metric">
              <span>
                Insats
              </span>

              <strong>
                {formatMoney(
                  summary
                    .combinedMarket
                    .stake,
                )}
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                Åter
              </span>

              <strong>
                {formatMoney(
                  summary
                    .combinedMarket
                    .returnAmount,
                )}
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                Netto
              </span>

              <strong
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
              </strong>
            </div>

            <div className="research-gallop-market-metric">
              <span>
                ROI
              </span>

              <strong
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
              </strong>
            </div>
          </div>

          <div className="research-gallop-market-foot">
            {summary.bets} urval · två marknader
          </div>
        </article>
      </div>

      <div className="research-gallop-filter-head">
        <button
          type="button"
          onClick={() =>
            setFiltersOpen(
              (current) =>
                !current,
            )
          }
        >
          Filter
          <span>
            {filtersOpen
              ? "⌃"
              : "⌄"}
          </span>
        </button>

        {loadedAt ? (
          <small>
            Senast{" "}
            {new Date(
              loadedAt,
            ).toLocaleTimeString(
              "sv-SE",
              {
                hour: "2-digit",
                minute: "2-digit",
              },
            )}
          </small>
        ) : null}
      </div>

      {filtersOpen ? (
        <div className="research-gallop-filter-grid research-gallop-filter-grid-advanced">
          <label>
            <span>
              Urval
            </span>

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
                    .value as GallopSelection,
                )
              }
            >
              <option value="S1">
                S1 – Mest sänkta
              </option>

              <option value="S2">
                S2 – Näst mest sänkta
              </option>

              <option value="ALL_RUNNERS">
                Alla hästar
              </option>
            </select>
          </label>

          <label>
            <span>
              Land
            </span>

            <select
              value={
                filters.countryCode
              }
              onChange={(
                event,
              ) =>
                updateFilter(
                  "countryCode",
                  event.target.value,
                )
              }
            >
              <option value="">
                Alla länder
              </option>

              {options.countries.map(
                (country) => (
                  <option
                    key={country}
                    value={country}
                  >
                    {countryLabel(
                      country,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>
              Bana
            </span>

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

              {availableTracks.map(
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
            <span>
              Underlag
            </span>

            <select
              value={
                filters.surface
              }
              onChange={(
                event,
              ) =>
                updateFilter(
                  "surface",
                  event.target.value,
                )
              }
            >
              <option value="">
                Alla underlag
              </option>

              {options.surfaces.map(
                (surface) => (
                  <option
                    key={surface}
                    value={surface}
                  >
                    {surfaceLabel(
                      surface,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>
              Från datum
            </span>

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
            <span>
              Till datum
            </span>

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
            <span>
              Distans
            </span>

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
                    {distance} m
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="research-gallop-advanced-toggle-row">
            <button
              type="button"
              className="research-gallop-advanced-toggle"
              onClick={() =>
                setAdvancedFiltersOpen(
                  (current) => !current,
                )
              }
            >
              {advancedFiltersOpen
                ? "Färre filter"
                : "Fler filter"}

              <span>
                {advancedFiltersOpen
                  ? "⌃"
                  : "⌄"}
              </span>
            </button>
          </div>

          {advancedFiltersOpen ? (
            <div className="research-gallop-advanced-filters">
          <label>
            <span>
              Min startande
            </span>

            <input
              type="number"
              inputMode="numeric"
              value={
                filters.minStarters ??
                ""
              }
              placeholder="Alla"
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
            <span>
              Max startande
            </span>

            <input
              type="number"
              inputMode="numeric"
              value={
                filters.maxStarters ??
                ""
              }
              placeholder="Alla"
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
            <span>
              Min handicap
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={
                filters.minHandicapRating ??
                ""
              }
              placeholder="Alla"
              onChange={(
                event,
              ) =>
                updateNumber(
                  "minHandicapRating",
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>
              Max handicap
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={
                filters.maxHandicapRating ??
                ""
              }
              placeholder="Alla"
              onChange={(
                event,
              ) =>
                updateNumber(
                  "maxHandicapRating",
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>
              HCP-rank
            </span>

            <select
              value={
                filters.handicapRank
              }
              onChange={(
                event,
              ) =>
                updateFilter(
                  "handicapRank",
                  event.target.value as GallopHistoryFilters["handicapRank"],
                )
              }
            >
              <option value="">
                Alla
              </option>

              <option value="1">
                1 – högst HCP
              </option>

              <option value="2">
                2
              </option>

              <option value="3">
                3
              </option>

              <option value="4">
                4
              </option>

              <option value="5+">
                5+
              </option>
            </select>
          </label>

          <label>
            <span>
              Min vikt kg
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={
                filters.minCarriedWeightKg ??
                ""
              }
              placeholder="Alla"
              onChange={(
                event,
              ) =>
                updateNumber(
                  "minCarriedWeightKg",
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>
              Max vikt kg
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={
                filters.maxCarriedWeightKg ??
                ""
              }
              placeholder="Alla"
              onChange={(
                event,
              ) =>
                updateNumber(
                  "maxCarriedWeightKg",
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>
              Viktrank
            </span>

            <select
              value={
                filters.weightRank
              }
              onChange={(
                event,
              ) =>
                updateFilter(
                  "weightRank",
                  event.target.value as GallopHistoryFilters["weightRank"],
                )
              }
            >
              <option value="">
                Alla
              </option>

              <option value="1">
                1 – högst vikt
              </option>

              <option value="2">
                2
              </option>

              <option value="3">
                3
              </option>

              <option value="4">
                4
              </option>

              <option value="5+">
                5+
              </option>
            </select>
          </label>

          <label>
            <span>
              Min sänkning %
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={
                filters.minDropPercent ??
                ""
              }
              placeholder="Alla"
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
            <span>
              Max sänkning %
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={
                filters.maxDropPercent ??
                ""
              }
              placeholder="Alla"
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

          <label>
            <span>
              Min LOCK-odds
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={
                filters.minLockOdds ??
                ""
              }
              placeholder="Alla"
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
            <span>
              Max LOCK-odds
            </span>

            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={
                filters.maxLockOdds ??
                ""
              }
              placeholder="Alla"
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
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="research-error">
          {error}
        </div>
      ) : null}

      {!loading &&
      !error &&
      rows.length === 0 ? (
        <div className="research-gallop-empty">
          <strong>
            Ingen galoppdata matchar filtren.
          </strong>

          <span>
            När internationella lopp börjar
            arkiveras dyker de upp här
            automatiskt.
          </span>
        </div>
      ) : null}

      {countrySummaries.length > 0 ? (
        <section className="research-gallop-country-section">
          <div className="research-gallop-section-heading">
            <div>
              <span>
                LANDJÄMFÖRELSE
              </span>

              <strong>
                Samma urval – olika marknader
              </strong>
            </div>

            <small>
              ROI räknas på 100 kr per marknad.
            </small>
          </div>

          <div className="research-gallop-country-table-wrap">
            <table className="research-gallop-country-table">
              <thead>
                <tr>
                  <th>Land</th>
                  <th>Lopp</th>
                  <th>Spel</th>
                  <th>VINNARE</th>
                  <th>PLATS</th>
                  <th>Snittsänkning</th>
                  <th>WIN ROI</th>
                  <th>PLACE ROI</th>
                  <th>Total ROI</th>
                </tr>
              </thead>

              <tbody>
                {countrySummaries.map(
                  (country) => (
                    <tr
                      key={
                        country.countryCode
                      }
                    >
                      <td>
                        <strong>
                          {countryLabel(
                            country.countryCode,
                          )}
                        </strong>
                      </td>

                      <td>
                        {country.races}
                      </td>

                      <td>
                        {country.bets}
                      </td>

                      <td>
                        {country.wins}
                      </td>

                      <td>
                        {country.places}
                      </td>

                      <td>
                        {formatPercent(
                          country.averageDropPercent,
                        )}
                      </td>

                      <td
                        className={
                          roiClass(
                            country.winnerRoiPercent,
                          )
                        }
                      >
                        {formatPercent(
                          country.winnerRoiPercent,
                        )}
                      </td>

                      <td
                        className={
                          roiClass(
                            country.placeRoiPercent,
                          )
                        }
                      >
                        {formatPercent(
                          country.placeRoiPercent,
                        )}
                      </td>

                      <td
                        className={
                          roiClass(
                            country.combinedRoiPercent,
                          )
                        }
                      >
                        <strong>
                          {formatPercent(
                            country.combinedRoiPercent,
                          )}
                        </strong>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <div className="research-gallop-table-wrap">
          <table className="research-gallop-table research-gallop-table-advanced">
            <thead>
              <tr>
                <th>Land</th>
                <th>Datum</th>
                <th>Bana / lopp</th>
                <th>Häst</th>
                <th>Underlag</th>
                <th>Hcp</th>
                <th>Hcp-rank</th>
                <th>Vikt</th>
                <th>Vikt-rank</th>
                <th>Sänkning</th>
                <th>LOCK</th>
                <th>Resultat</th>
                <th>V-odds</th>
                <th>P-odds</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(
                (row) => (
                  <tr
                    key={[
                      row.raceKey,
                      row.gallopSelection,
                      row.runnerNumber,
                    ].join(":")}
                  >
                    <td>
                      {countryLabel(
                        row.countryCode,
                      )}
                    </td>

                    <td>
                      {row.raceDate}
                    </td>

                    <td>
                      <strong>
                        {row.trackName}
                      </strong>

                      <small>
                        Lopp{" "}
                        {row.raceNumber}
                        {row.distanceMeters
                          ? ` · ${row.distanceMeters} m`
                          : ""}
                      </small>
                    </td>

                    <td>
                      <strong>
                        #{row.runnerNumber}{" "}
                        {row.horseName}
                      </strong>

                      {row.riderName ? (
                        <small>
                          {row.riderName}
                        </small>
                      ) : null}
                    </td>

                    <td>
                      {row.surface
                        ? surfaceLabel(
                            row.surface,
                          )
                        : "–"}
                    </td>

                    <td>
                      {formatNumber(
                        row.handicapRating,
                        1,
                      )}
                    </td>

                    <td>
                      {row.handicapRank ??
                        "–"}
                    </td>

                    <td>
                      {row.carriedWeightKg ===
                      null
                        ? "–"
                        : `${formatNumber(
                            row.carriedWeightKg,
                            1,
                          )} kg`}
                    </td>

                    <td>
                      {row.weightRank ??
                        "–"}
                    </td>

                    <td>
                      {formatPercent(
                        row
                          .oddsDropToLockPercent,
                      )}
                    </td>

                    <td>
                      {formatOdds(
                        row.lockOdds,
                      )}
                    </td>

                    <td>
                      <span
                        className={`research-result-chip ${resultClass(
                          row,
                        )}`}
                      >
                        {resultText(
                          row,
                        )}
                      </span>
                    </td>

                    <td>
                      {formatOdds(
                        row
                          .officialWinOddsDecimal,
                      )}
                    </td>

                    <td>
                      {formatOdds(
                        row
                          .officialPlaceOddsDecimal,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
