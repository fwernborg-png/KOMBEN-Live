import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BIG_B_MONSTER_RULE_CONFIG_V1,
  SMALLKARAMELL_RULE_CONFIG_V1,
  WIN_PLACE_RULE_CONFIG_V1,
} from "./config";

import {
  computeWinPlaceStats,
  type WinPlaceBetRecord,
  type WinPlaceMarket,
  type WinPlaceStats,
} from "./journal";

import {
  loadWinPlaceBetsByRange,
} from "./repository";

type Props = {
  date: string;
  mode: "journal" | "stats";
};

type PeriodMode = "DAY" | "TEST_PERIOD";

const TEST_START_DATE = "2026-08-03";
const TEST_END_DATE = "2026-08-16";
const REFRESH_INTERVAL_MS = 60_000;

const SNIGEL_KOMMER_RULE_VERSION =
  "SNIGEL_KOMMER_V1.0";

const JUPITER_RULE_VERSION =
  "JUPITER_V1.0";

const GRODAN_RULE_VERSION =
  "GRODAN_V1.0";

const ENSAMVARGEN_RULE_VERSION =
  "ENSAMVARGEN_V1.0";

function kronor(oren: number) {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(oren / 100);
}

function decimal(
  value: number | null,
  digits = 1,
) {
  return value === null
    ? "-"
    : value.toFixed(digits).replace(".", ",");
}

function formatUpdatedAt(value: Date | null) {
  if (!value) return "Inte hämtad";

  return value.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function resultLabel(
  bet: WinPlaceBetRecord | null,
) {
  if (!bet) return "Saknas";

  if (bet.resultOutcome === "PENDING") {
    return "Väntar på resultat";
  }

  if (bet.resultOutcome === "VOID") {
    return "Void";
  }

  if (
    bet.resultOutcome === "HIT" &&
    bet.resultStatus === "SAKNAR_ODDS"
  ) {
    return "Träff – väntar på odds";
  }

  return bet.resultOutcome === "HIT"
    ? "Träff"
    : "Miss";
}

function resultClass(
  bet: WinPlaceBetRecord | null,
) {
  if (!bet || bet.resultOutcome === "PENDING") {
    return "is-pending";
  }

  if (bet.resultOutcome === "VOID") {
    return "is-void";
  }

  return bet.resultOutcome === "HIT"
    ? "is-hit"
    : "is-miss";
}

function strategyInformation(
  ruleVersion: string,
) {
  if (
    ruleVersion ===
    SNIGEL_KOMMER_RULE_VERSION
  ) {
    return {
      title: "🐌 Snigel kommer",
      description:
        "Jämnaste · 9–10 startande vid lås · oddset steg · vinnare",
      className: "is-snigel",
    };
  }

  if (
    ruleVersion ===
    JUPITER_RULE_VERSION
  ) {
    return {
      title: "🪐 Jupiter",
      description:
        "Jämnaste · låsodds 3,00–3,99 · oddset har inte stigit · plats",
      className: "is-jupiter",
    };
  }

  if (
    ruleVersion ===
    GRODAN_RULE_VERSION
  ) {
    return {
      title: "🐸 Grodan",
      description:
        "Jämnaste · G grön · låsodds 4,00–9,99 · plats",
      className: "is-jupiter",
    };
  }

  if (
    ruleVersion ===
    ENSAMVARGEN_RULE_VERSION
  ) {
    return {
      title: "🐺 Ensamvargen",
      description:
        "Exakt en häst sänks 5,00–9,99 % · låsodds minst 6,00 · vinnare",
      className: "is-snigel",
    };
  }

  if (
    ruleVersion ===
    BIG_B_MONSTER_RULE_CONFIG_V1.ruleVersion
  ) {
    return {
      title: "👹 Big B Monster",
      description:
        "Mest sänkta · max 8 startande · styrka högst 3/6 · vinnare + plats",
      className: "is-most-shortened",
    };
  }

  if (
    ruleVersion ===
    SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion
  ) {
    return {
      title: "🦞 Kräfta i buren",
      description:
        "S2 · näst mest sänkt · vinnarodds högst 7,00",
      className: "is-smallkaramell",
    };
  }

  return {
    title: "Mest sänkta",
    description:
      "Minst 30 % sänkning · vinnarodds högst 6,00",
    className: "is-most-shortened",
  };
}

function SummaryCard(args: {
  label: string;
  value: string;
  tone?: "normal" | "positive" | "negative" | "warning";
}) {
  const {
    label,
    value,
    tone = "normal",
  } = args;

  return (
    <div className={`signal-summary-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatsBlock(args: {
  title: string;
  market?: WinPlaceMarket;
  stats: WinPlaceStats;
}) {
  const {
    title,
    market,
    stats,
  } = args;

  return (
    <section
      className={`strategy-stats-block ${
        market === "WIN"
          ? "is-win"
          : market === "PLACE"
            ? "is-place"
            : "is-total"
      }`}
    >
      <div className="strategy-stats-heading">
        <strong>{title}</strong>
        <span>
          {stats.hits} träffar av {stats.settled} fastställda
        </span>
      </div>

      <div className="strategy-stats-grid">
        <SummaryCard
          label="Spelrader"
          value={String(stats.count)}
        />

        <SummaryCard
          label="Väntande"
          value={String(stats.pending)}
          tone={stats.pending ? "warning" : "normal"}
        />

        <SummaryCard
          label="Låst insats"
          value={`${kronor(stats.lockedStakeOren)} kr`}
        />

        <SummaryCard
          label="Fastställd insats"
          value={`${kronor(stats.totalStakeOren)} kr`}
        />

        <SummaryCard
          label="Återbetalning"
          value={`${kronor(stats.totalReturnOren)} kr`}
        />

        <SummaryCard
          label="Netto"
          value={`${
            stats.totalNetOren >= 0 ? "+" : ""
          }${kronor(stats.totalNetOren)} kr`}
          tone={
            stats.totalNetOren > 0
              ? "positive"
              : stats.totalNetOren < 0
                ? "negative"
                : "normal"
          }
        />

        <SummaryCard
          label="ROI"
          value={`${decimal(stats.roiPct)} %`}
          tone={
            stats.roiPct > 0
              ? "positive"
              : stats.roiPct < 0
                ? "negative"
                : "normal"
          }
        />

        <SummaryCard
          label="Träffprocent"
          value={`${decimal(stats.hitRate)} %`}
        />
      </div>
    </section>
  );
}

export function WinPlaceJournalPanel({
  date,
  mode,
}: Props) {
  const [periodMode, setPeriodMode] =
    useState<PeriodMode>("DAY");

  const [bets, setBets] =
    useState<WinPlaceBetRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdatedAt, setLastUpdatedAt] =
    useState<Date | null>(null);

  const dateRange = useMemo(() => {
    if (periodMode === "TEST_PERIOD") {
      return {
        from: TEST_START_DATE,
        to: TEST_END_DATE,
        label: "3–16 augusti 2026",
      };
    }

    return {
      from: date,
      to: date,
      label: date,
    };
  }, [date, periodMode]);

  const loadBets = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const rows =
          await loadWinPlaceBetsByRange(
            dateRange.from,
            dateRange.to,
            "LIVE",
          );

        setBets(rows);
        setError("");
        setLastUpdatedAt(new Date());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Kunde inte läsa speljournalen.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange.from, dateRange.to],
  );

  useEffect(() => {
    void loadBets();

    const interval = window.setInterval(() => {
      void loadBets(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadBets]);

  const strategyDefinitions = useMemo(
    () => [
      {
        ruleVersion:
          SNIGEL_KOMMER_RULE_VERSION,
        title: "🐌 Snigel kommer",
        description:
          "Jämnaste · 9–10 startande vid lås · oddset steg · endast vinnare",
        className: "is-snigel",
        winOnly: true,
        placeOnly: false,
      },
      {
        ruleVersion:
          JUPITER_RULE_VERSION,
        title: "🪐 Jupiter",
        description:
          "Jämnaste · låsodds 3,00–3,99 · oddset har inte stigit · endast plats",
        className: "is-jupiter",
        winOnly: false,
        placeOnly: true,
      },
      {
        ruleVersion:
          GRODAN_RULE_VERSION,
        title: "🐸 Grodan",
        description:
          "Jämnaste · G grön · låsodds 4,00–9,99 · endast plats",
        className: "is-jupiter",
        winOnly: false,
        placeOnly: true,
      },
      {
        ruleVersion:
          ENSAMVARGEN_RULE_VERSION,
        title: "🐺 Ensamvargen",
        description:
          "Exakt en häst sänks 5,00–9,99 % · låsodds minst 6,00 · endast vinnare",
        className: "is-snigel",
        winOnly: true,
        placeOnly: false,
      },
      {
        ruleVersion:
          BIG_B_MONSTER_RULE_CONFIG_V1.ruleVersion,
        title: "👹 Big B Monster",
        description:
          "Mest sänkta · max 8 startande · styrka högst 3/6 · vinnare + plats",
        className: "is-most-shortened",
        winOnly: false,
        placeOnly: false,
      },
      {
        ruleVersion:
          SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion,
        title: "🦞 Kräfta i buren",
        description:
          "S2 · näst mest sänkt · vinnarodds högst 7,00",
        className: "is-smallkaramell",
        winOnly: false,
        placeOnly: false,
      },
      {
        ruleVersion:
          WIN_PLACE_RULE_CONFIG_V1.ruleVersion,
        title: "Mest sänkta",
        description:
          "Minst 30 % sänkning · vinnarodds högst 6,00",
        className: "is-most-shortened",
        winOnly: false,
        placeOnly: false,
      },
    ],
    [],
  );

  const strategyGroups = useMemo(
    () =>
      strategyDefinitions.map((definition) => {
        const strategyBets = bets.filter(
          (bet) =>
            bet.ruleVersion ===
            definition.ruleVersion,
        );

        return {
          ...definition,
          bets: strategyBets,
          winStats: computeWinPlaceStats(
            strategyBets,
            "WIN",
          ),
          placeStats: computeWinPlaceStats(
            strategyBets,
            "PLACE",
          ),
          combinedStats:
            computeWinPlaceStats(strategyBets),
        };
      }),
    [bets, strategyDefinitions],
  );

  const combinedStats = useMemo(
    () => computeWinPlaceStats(bets),
    [bets],
  );

  const raceGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        win: WinPlaceBetRecord | null;
        place: WinPlaceBetRecord | null;
      }
    >();

    for (const bet of bets) {
      const key = [
        bet.raceId,
        bet.ruleVersion,
        bet.signalPhase,
      ].join(":");

      const group = groups.get(key) ?? {
        win: null,
        place: null,
      };

      if (bet.market === "WIN") {
        group.win = bet;
      }

      if (bet.market === "PLACE") {
        group.place = bet;
      }

      groups.set(key, group);
    }

    return [...groups.values()].sort(
      (a, b) => {
        const firstA = a.win ?? a.place;
        const firstB = b.win ?? b.place;

        if (!firstA || !firstB) {
          return 0;
        }

        const dateCompare =
          firstB.date.localeCompare(firstA.date);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        const trackCompare =
          firstA.trackName.localeCompare(
            firstB.trackName,
            "sv",
          );

        return trackCompare !== 0
          ? trackCompare
          : firstA.raceNumber -
              firstB.raceNumber;
      },
    );
  }, [bets]);

  return (
    <section className="signal-journal-shell">
      <div className="signal-journal-toolbar">
        <div>
          <p className="signal-journal-kicker">
            T−90 · SPELSIGNALER
          </p>

          <h2>
            {mode === "stats"
              ? "Strategistatistik"
              : "Automatiska spel"}
          </h2>

          <span className="signal-journal-period">
            Period: {dateRange.label}
          </span>
        </div>

        <div className="signal-journal-actions">
          <div
            className="period-switch"
            role="group"
            aria-label="Välj period"
          >
            <button
              type="button"
              className={
                periodMode === "DAY"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setPeriodMode("DAY")
              }
            >
              Valt datum
            </button>

            <button
              type="button"
              className={
                periodMode === "TEST_PERIOD"
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setPeriodMode("TEST_PERIOD")
              }
            >
              Hela testperioden
            </button>
          </div>

          <button
            type="button"
            className="journal-refresh-button"
            onClick={() => void loadBets(true)}
            disabled={refreshing}
          >
            {refreshing
              ? "Uppdaterar..."
              : "Uppdatera nu"}
          </button>

          <small>
            Senast uppdaterad{" "}
            {formatUpdatedAt(lastUpdatedAt)}
          </small>
        </div>
      </div>

      {error ? (
        <div className="signal-journal-error">
          {error}
        </div>
      ) : null}

      <div className="signal-overall-summary">
        <SummaryCard
          label="Signaler"
          value={String(raceGroups.length)}
        />

        <SummaryCard
          label="Spelrader"
          value={String(combinedStats.count)}
        />

        <SummaryCard
          label="Väntande"
          value={String(combinedStats.pending)}
          tone={
            combinedStats.pending
              ? "warning"
              : "normal"
          }
        />

        <SummaryCard
          label="Låst insats"
          value={`${kronor(
            combinedStats.lockedStakeOren,
          )} kr`}
        />

        <SummaryCard
          label="Fastställd insats"
          value={`${kronor(
            combinedStats.totalStakeOren,
          )} kr`}
        />

        <SummaryCard
          label="Återbetalning"
          value={`${kronor(
            combinedStats.totalReturnOren,
          )} kr`}
        />

        <SummaryCard
          label="Netto"
          value={`${
            combinedStats.totalNetOren >= 0
              ? "+"
              : ""
          }${kronor(
            combinedStats.totalNetOren,
          )} kr`}
          tone={
            combinedStats.totalNetOren > 0
              ? "positive"
              : combinedStats.totalNetOren < 0
                ? "negative"
                : "normal"
          }
        />

        <SummaryCard
          label="ROI"
          value={`${decimal(
            combinedStats.roiPct,
          )} %`}
        />
      </div>

      <div className="test-period-note">
        <strong>Testperiod 3–16 augusti:</strong>
        <span>
          Kräfta i buren och den ordinarie
          mest-sänkta-regeln redovisas separat.
          Snigel kommer och Jupiter följs
          framåt från 10 augusti och
          redovisas separat.
        </span>
      </div>

      {loading ? (
        <div className="signal-journal-loading">
          Läser speljournal...
        </div>
      ) : null}

      {!loading && mode === "stats" ? (
        <div className="strategy-statistics-list">
          {strategyGroups.map((strategy) => (
            <article
              key={strategy.ruleVersion}
              className={`strategy-statistics-card ${strategy.className}`}
            >
              <div className="strategy-statistics-title">
                <div>
                  <h3>{strategy.title}</h3>
                  <span>
                    {strategy.description}
                  </span>
                </div>

                <div className="strategy-meta">
                  <strong>
                    {
                      strategy.combinedStats
                        .count
                    }{" "}
                    spelrader
                  </strong>
                  <span>
                    {strategy.ruleVersion}
                  </span>
                </div>
              </div>

              <div
                className={`strategy-market-columns${
                  strategy.winOnly ||
                  strategy.placeOnly
                    ? " is-single-market"
                    : ""
                }`}
              >
                {!strategy.placeOnly ? (
                  <StatsBlock
                    title="VINNARE"
                    market="WIN"
                    stats={strategy.winStats}
                  />
                ) : null}

                {!strategy.winOnly ? (
                  <>
                    <StatsBlock
                      title="PLATS"
                      market="PLACE"
                      stats={strategy.placeStats}
                    />

                    {!strategy.placeOnly ? (
                      <StatsBlock
                        title="TOTALT"
                        stats={
                          strategy.combinedStats
                        }
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && mode === "journal" ? (
        <div className="signal-journal-list">
          {!raceGroups.length ? (
            <div className="signal-journal-empty">
              Inga automatiska T−90-spel hittades
              för vald period.
            </div>
          ) : null}

          {raceGroups.map(({ win, place }) => {
            const base = win ?? place;

            if (!base) {
              return null;
            }

            const strategy =
              strategyInformation(
                base.ruleVersion,
              );

            const rows = [win, place].filter(
              (
                bet,
              ): bet is WinPlaceBetRecord =>
                bet !== null,
            );

            const allReturnsKnown =
              rows.every(
                (bet) =>
                  bet.returnOren !== null,
              );

            const lockedStake = rows.reduce(
              (sum, bet) =>
                sum + bet.stakeOren,
              0,
            );

            const totalReturn =
              allReturnsKnown
                ? rows.reduce(
                    (sum, bet) =>
                      sum +
                      (bet.returnOren ?? 0),
                    0,
                  )
                : null;

            const totalNet =
              totalReturn === null
                ? null
                : totalReturn -
                  lockedStake;

            return (
              <article
                key={`${base.raceId}:${base.ruleVersion}`}
                className={`signal-journal-row ${strategy.className}`}
              >
                <div className="signal-journal-race">
                  <div className="signal-journal-row-top">
                    <strong>
                      {base.date} ·{" "}
                      {base.trackName} · Lopp{" "}
                      {base.raceNumber}
                    </strong>

                    <span className="strategy-chip">
                      {strategy.title}
                    </span>
                  </div>

                  <span className="strategy-description">
                    {strategy.description}
                  </span>

                  <strong className="signal-horse-name">
                    Häst {base.horseNumber}.{" "}
                    {base.horseName}
                  </strong>

                  <span>
                    {decimal(
                      base.startOdds,
                      2,
                    )}{" "}
                    →{" "}
                    {decimal(
                      base.lockedWinOdds,
                      2,
                    )}{" "}
                    · Sänkning{" "}
                    {decimal(
                      base.oddsDropPercent,
                    )}{" "}
                    % · Styrka{" "}
                    {base.strength}/6
                  </span>

                  <span>
                    Låst{" "}
                    {decimal(
                      base.secondsBeforeStart,
                      0,
                    )}{" "}
                    sekunder före start
                  </span>
                </div>

                <div className="signal-result-column">
                  <div
                    className={`market-result ${resultClass(
                      win,
                    )}`}
                  >
                    <span>VINNARE</span>
                    <strong>
                      {resultLabel(win)}
                    </strong>

                    {win
                      ?.officialWinOddsDecimal !==
                        null &&
                    win
                      ?.officialWinOddsDecimal !==
                        undefined ? (
                      <small>
                        Odds{" "}
                        {decimal(
                          win.officialWinOddsDecimal,
                          2,
                        )}
                      </small>
                    ) : null}
                  </div>

                  <div
                    className={`market-result ${resultClass(
                      place,
                    )}`}
                  >
                    <span>PLATS</span>
                    <strong>
                      {resultLabel(place)}
                    </strong>

                    {place
                      ?.placeOddsDecimal !==
                        null &&
                    place
                      ?.placeOddsDecimal !==
                        undefined ? (
                      <small>
                        Odds{" "}
                        {decimal(
                          place.placeOddsDecimal,
                          2,
                        )}
                      </small>
                    ) : null}
                  </div>
                </div>

                <div className="signal-money-column">
                  <span>
                    Placering{" "}
                    {base.finishPositionOfficial ??
                      "-"}
                  </span>

                  <span>
                    Låst insats{" "}
                    {kronor(lockedStake)} kr
                  </span>

                  <span>
                    Åter{" "}
                    {totalReturn === null
                      ? "-"
                      : `${kronor(
                          totalReturn,
                        )} kr`}
                  </span>

                  <strong
                    className={
                      totalNet === null
                        ? ""
                        : totalNet >= 0
                          ? "money-positive"
                          : "money-negative"
                    }
                  >
                    Netto{" "}
                    {totalNet === null
                      ? "-"
                      : `${
                          totalNet >= 0
                            ? "+"
                            : ""
                        }${kronor(
                          totalNet,
                        )} kr`}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
