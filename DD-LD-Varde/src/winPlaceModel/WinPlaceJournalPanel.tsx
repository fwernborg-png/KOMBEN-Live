import { useEffect, useMemo, useState } from "react";
import {
  computeWinPlaceStats,
  type WinPlaceBetRecord,
  type WinPlaceMarket,
  type WinPlaceStats,
} from "./journal";
import { loadWinPlaceBetsByDate } from "./repository";

type Props = {
  date: string;
  mode: "journal" | "stats";
};

function kronor(oren: number) {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(oren / 100);
}

function decimal(value: number | null, digits = 1) {
  return value === null
    ? "-"
    : value.toFixed(digits).replace(".", ",");
}

function resultLabel(bet: WinPlaceBetRecord | null) {
  if (!bet) return "Saknas";
  if (bet.resultOutcome === "PENDING") return "Väntar";
  if (bet.resultOutcome === "VOID") return "Void";
  if (
    bet.resultOutcome === "HIT" &&
    bet.resultStatus === "SAKNAR_ODDS"
  ) {
    return "Träff – odds saknas";
  }

  return bet.resultOutcome === "HIT" ? "Träff" : "Miss";
}

function resultColor(bet: WinPlaceBetRecord | null) {
  if (!bet || bet.resultOutcome === "PENDING") return "#facc15";
  if (bet.resultOutcome === "VOID") return "#94a3b8";
  return bet.resultOutcome === "HIT" ? "#4ade80" : "#fb7185";
}

function StatsCards(args: {
  title: string;
  market?: WinPlaceMarket;
  stats: WinPlaceStats;
}) {
  const { title, market, stats } = args;

  return (
    <div
      style={{
        padding: 14,
        border:
          market === "WIN"
            ? "1px solid rgba(250,204,21,.45)"
            : market === "PLACE"
              ? "1px solid rgba(74,222,128,.4)"
              : "1px solid rgba(96,165,250,.45)",
        borderRadius: 14,
        background: "rgba(15,23,42,.62)",
      }}
    >
      <h3
        style={{
          margin: "0 0 12px",
          color:
            market === "WIN"
              ? "#facc15"
              : market === "PLACE"
                ? "#4ade80"
                : "#60a5fa",
        }}
      >
        {title}
      </h3>

      <div className="mini-stats-grid">
        <div className="mini-stat-card">
          <span>Spel</span>
          <strong>{stats.count}</strong>
        </div>
        <div className="mini-stat-card">
          <span>Fastställda</span>
          <strong>{stats.settled}</strong>
        </div>
        <div className="mini-stat-card">
          <span>Träffar</span>
          <strong>{stats.hits}</strong>
        </div>
        <div className="mini-stat-card">
          <span>Träffprocent</span>
          <strong>{decimal(stats.hitRate)} %</strong>
        </div>
        <div className="mini-stat-card">
          <span>Insats</span>
          <strong>{kronor(stats.totalStakeOren)} kr</strong>
        </div>
        <div className="mini-stat-card">
          <span>Åter</span>
          <strong>{kronor(stats.totalReturnOren)} kr</strong>
        </div>
        <div className="mini-stat-card">
          <span>Netto</span>
          <strong>
            {stats.totalNetOren >= 0 ? "+" : ""}
            {kronor(stats.totalNetOren)} kr
          </strong>
        </div>
        <div className="mini-stat-card">
          <span>ROI</span>
          <strong>{decimal(stats.roiPct)} %</strong>
        </div>
      </div>
    </div>
  );
}

export function WinPlaceJournalPanel({ date, mode }: Props) {
  const [bets, setBets] = useState<WinPlaceBetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void loadWinPlaceBetsByDate(date, "LIVE")
      .then((rows) => {
        if (cancelled) return;
        setBets(rows);
        setError("");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setBets([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Kunde inte läsa vinnare- och platsjournalen.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  const winStats = useMemo(
    () => computeWinPlaceStats(bets, "WIN"),
    [bets],
  );

  const placeStats = useMemo(
    () => computeWinPlaceStats(bets, "PLACE"),
    [bets],
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
      const key = `${bet.raceId}:${bet.ruleVersion}:${bet.signalPhase}`;
      const group = groups.get(key) ?? {
        win: null,
        place: null,
      };

      if (bet.market === "WIN") group.win = bet;
      if (bet.market === "PLACE") group.place = bet;
      groups.set(key, group);
    }

    return [...groups.values()].sort((a, b) => {
      const firstA = a.win ?? a.place;
      const firstB = b.win ?? b.place;

      if (!firstA || !firstB) return 0;

      const track = firstA.trackName.localeCompare(
        firstB.trackName,
        "sv",
      );

      return track !== 0
        ? track
        : firstA.raceNumber - firstB.raceNumber;
    });
  }, [bets]);

  if (mode === "stats") {
    return (
      <section
        style={{
          display: "grid",
          gap: 14,
          margin: "14px 0 22px",
        }}
      >
        <div className="panel-header-row">
          <div>
            <p style={{ margin: 0, color: "#facc15" }}>
              MEST SÄNKTA · MINST 30 % · ODDS HÖGST 6,00
            </p>
            <h2 style={{ margin: "4px 0" }}>
              Vinnare + plats
            </h2>
          </div>
          <div className="panel-meta-row">
            <span>WIN_PLACE_V1.0</span>
            <span>LIVE</span>
          </div>
        </div>

        {error ? (
          <div
            style={{
              padding: 12,
              border: "1px solid #7f1d1d",
              borderRadius: 12,
              color: "#fecaca",
            }}
          >
            {error}
          </div>
        ) : null}

        {loading ? <p>Läser statistik...</p> : null}

        <StatsCards
          title="VINNARE"
          market="WIN"
          stats={winStats}
        />
        <StatsCards
          title="PLATS"
          market="PLACE"
          stats={placeStats}
        />
        <StatsCards title="TOTALT" stats={combinedStats} />
      </section>
    );
  }

  return (
    <section
      style={{
        display: "grid",
        gap: 12,
        margin: "12px 0 24px",
        padding: 14,
        border: "1px solid rgba(250,204,21,.45)",
        borderRadius: 14,
        background:
          "linear-gradient(135deg,rgba(113,63,18,.22),rgba(15,23,42,.88))",
      }}
    >
      <div className="panel-header-row">
        <div>
          <p style={{ margin: 0, color: "#facc15" }}>
            VINNARE + PLATS
          </p>
          <h3 style={{ margin: "4px 0" }}>
            Mest sänkta hästen
          </h3>
        </div>
        <div className="panel-meta-row">
          <span>{raceGroups.length} signaler</span>
          <span>WIN_PLACE_V1.0</span>
        </div>
      </div>

      <div className="mini-stats-grid">
        <div className="mini-stat-card">
          <span>Vinnarträffar</span>
          <strong>
            {winStats.hits}/{winStats.settled}
          </strong>
        </div>
        <div className="mini-stat-card">
          <span>Platsträffar</span>
          <strong>
            {placeStats.hits}/{placeStats.settled}
          </strong>
        </div>
        <div className="mini-stat-card">
          <span>Total insats</span>
          <strong>
            {kronor(combinedStats.totalStakeOren)} kr
          </strong>
        </div>
        <div className="mini-stat-card">
          <span>Totalt netto</span>
          <strong
            style={{
              color:
                combinedStats.totalNetOren >= 0
                  ? "#4ade80"
                  : "#fb7185",
            }}
          >
            {combinedStats.totalNetOren >= 0 ? "+" : ""}
            {kronor(combinedStats.totalNetOren)} kr
          </strong>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            border: "1px solid #7f1d1d",
            borderRadius: 12,
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? <p>Läser journal...</p> : null}

      <div className="history-list-compact">
        {!loading && !raceGroups.length && !error ? (
          <p>Inga LIVE-signaler för valt datum.</p>
        ) : null}

        {raceGroups.map(({ win, place }) => {
          const base = win ?? place;

          if (!base) return null;

          const rows = [win, place].filter(
            (bet): bet is WinPlaceBetRecord => bet !== null,
          );

          const allReturnsKnown = rows.every(
            (bet) => bet.returnOren !== null,
          );

          const totalStake = rows.reduce(
            (sum, bet) => sum + bet.stakeOren,
            0,
          );

          const totalReturn = allReturnsKnown
            ? rows.reduce(
                (sum, bet) => sum + (bet.returnOren ?? 0),
                0,
              )
            : null;

          const totalNet =
            totalReturn === null
              ? null
              : totalReturn - totalStake;

          return (
            <article
              key={`${base.raceId}:${base.ruleVersion}`}
              className="history-row-card"
              style={{
                borderLeft: "5px solid #facc15",
              }}
            >
              <div>
                <strong>
                  {base.date} · {base.trackName} · Lopp{" "}
                  {base.raceNumber}
                </strong>
                <span>
                  Häst {base.horseNumber}. {base.horseName}
                </span>
                <span>
                  {decimal(base.startOdds, 2)} →{" "}
                  {decimal(base.lockedWinOdds, 2)} · Sänkning{" "}
                  {decimal(base.oddsDropPercent)} % · Låst{" "}
                  {decimal(base.secondsBeforeStart, 0)} sek före
                </span>
              </div>

              <div style={{ display: "grid", gap: 5 }}>
                <strong style={{ color: resultColor(win) }}>
                  VINNARE: {resultLabel(win)}
                  {win?.officialWinOddsDecimal !== null &&
                  win?.officialWinOddsDecimal !== undefined
                    ? ` · odds ${decimal(
                        win.officialWinOddsDecimal,
                        2,
                      )}`
                    : ""}
                </strong>

                <strong style={{ color: resultColor(place) }}>
                  PLATS: {resultLabel(place)}
                  {place?.placeOddsDecimal !== null &&
                  place?.placeOddsDecimal !== undefined
                    ? ` · odds ${decimal(
                        place.placeOddsDecimal,
                        2,
                      )}`
                    : ""}
                </strong>

                <span>
                  Placering{" "}
                  {base.finishPositionOfficial ?? "-"} · Insats{" "}
                  {kronor(totalStake)} kr · Netto{" "}
                  {totalNet === null
                    ? "-"
                    : `${totalNet >= 0 ? "+" : ""}${kronor(
                        totalNet,
                      )} kr`}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
