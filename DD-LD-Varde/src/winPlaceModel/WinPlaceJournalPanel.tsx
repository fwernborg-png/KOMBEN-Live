import { useEffect, useMemo, useState } from "react";
import {
  SMALLKARAMELL_RULE_CONFIG_V1,
  WIN_PLACE_RULE_CONFIG_V1,
} from "./config";
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

function strategyLabel(ruleVersion: string) {
  return ruleVersion === SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion
    ? "🎉 Smällkaramellen · S2 · odds högst 7,00"
    : "Mest sänkta · minst 30 % · odds högst 6,00";
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
        <div className="mini-stat-card"><span>Spel</span><strong>{stats.count}</strong></div>
        <div className="mini-stat-card"><span>Fastställda</span><strong>{stats.settled}</strong></div>
        <div className="mini-stat-card"><span>Träffar</span><strong>{stats.hits}</strong></div>
        <div className="mini-stat-card"><span>Träffprocent</span><strong>{decimal(stats.hitRate)} %</strong></div>
        <div className="mini-stat-card"><span>Insats</span><strong>{kronor(stats.totalStakeOren)} kr</strong></div>
        <div className="mini-stat-card"><span>Åter</span><strong>{kronor(stats.totalReturnOren)} kr</strong></div>
        <div className="mini-stat-card">
          <span>Netto</span>
          <strong>{stats.totalNetOren >= 0 ? "+" : ""}{kronor(stats.totalNetOren)} kr</strong>
        </div>
        <div className="mini-stat-card"><span>ROI</span><strong>{decimal(stats.roiPct)} %</strong></div>
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

  const strategyGroups = useMemo(() => {
    const definitions = [
      {
        ruleVersion: WIN_PLACE_RULE_CONFIG_V1.ruleVersion,
        title: "Mest sänkta – vinnare + plats",
        description: "Minst 30 % sänkning · vinnarodds högst 6,00",
      },
      {
        ruleVersion: SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion,
        title: "🎉 Smällkaramellen – vinnare + plats",
        description: "S2 · näst mest sänkt · vinnarodds högst 7,00",
      },
    ];

    return definitions.map((definition) => {
      const strategyBets = bets.filter(
        (bet) => bet.ruleVersion === definition.ruleVersion,
      );

      return {
        ...definition,
        bets: strategyBets,
        winStats: computeWinPlaceStats(strategyBets, "WIN"),
        placeStats: computeWinPlaceStats(strategyBets, "PLACE"),
        combinedStats: computeWinPlaceStats(strategyBets),
      };
    });
  }, [bets]);

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
      const group = groups.get(key) ?? { win: null, place: null };
      if (bet.market === "WIN") group.win = bet;
      if (bet.market === "PLACE") group.place = bet;
      groups.set(key, group);
    }

    return [...groups.values()].sort((a, b) => {
      const firstA = a.win ?? a.place;
      const firstB = b.win ?? b.place;
      if (!firstA || !firstB) return 0;
      const track = firstA.trackName.localeCompare(firstB.trackName, "sv");
      return track !== 0
        ? track
        : firstA.raceNumber - firstB.raceNumber;
    });
  }, [bets]);

  if (mode === "stats") {
    return (
      <section style={{ display: "grid", gap: 18, margin: "14px 0 22px" }}>
        <div className="panel-header-row">
          <div>
            <p style={{ margin: 0, color: "#facc15" }}>T−90 · SEPARAT UPPFÖLJNING</p>
            <h2 style={{ margin: "4px 0" }}>Vinnare + plats-strategier</h2>
          </div>
          <div className="panel-meta-row"><span>LIVE</span><span>2 strategier</span></div>
        </div>

        {error ? (
          <div style={{ padding: 12, border: "1px solid #7f1d1d", borderRadius: 12, color: "#fecaca" }}>
            {error}
          </div>
        ) : null}

        {loading ? <p>Läser statistik...</p> : null}

        {!loading
          ? strategyGroups.map((strategy) => (
              <div key={strategy.ruleVersion} style={{ display: "grid", gap: 10 }}>
                <div className="panel-header-row">
                  <div>
                    <h3 style={{ margin: 0 }}>{strategy.title}</h3>
                    <small>{strategy.description}</small>
                  </div>
                  <div className="panel-meta-row"><span>{strategy.ruleVersion}</span><span>{strategy.bets.length} spelrader</span></div>
                </div>
                <StatsCards title="VINNARE" market="WIN" stats={strategy.winStats} />
                <StatsCards title="PLATS" market="PLACE" stats={strategy.placeStats} />
                <StatsCards title="TOTALT" stats={strategy.combinedStats} />
              </div>
            ))
          : null}
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
        background: "linear-gradient(135deg,rgba(113,63,18,.22),rgba(15,23,42,.88))",
      }}
    >
      <div className="panel-header-row">
        <div>
          <p style={{ margin: 0, color: "#facc15" }}>VINNARE + PLATS</p>
          <h3 style={{ margin: "4px 0" }}>Automatiska T−90-signaler</h3>
        </div>
        <div className="panel-meta-row"><span>{raceGroups.length} signaler</span><span>2 strategier</span></div>
      </div>

      <div className="mini-stats-grid">
        <div className="mini-stat-card"><span>Spelrader</span><strong>{combinedStats.count}</strong></div>
        <div className="mini-stat-card"><span>Fastställda</span><strong>{combinedStats.settled}</strong></div>
        <div className="mini-stat-card"><span>Total insats</span><strong>{kronor(combinedStats.totalStakeOren)} kr</strong></div>
        <div className="mini-stat-card">
          <span>Totalt netto</span>
          <strong style={{ color: combinedStats.totalNetOren >= 0 ? "#4ade80" : "#fb7185" }}>
            {combinedStats.totalNetOren >= 0 ? "+" : ""}{kronor(combinedStats.totalNetOren)} kr
          </strong>
        </div>
      </div>

      {error ? (
        <div style={{ padding: 12, border: "1px solid #7f1d1d", borderRadius: 12, color: "#fecaca" }}>
          {error}
        </div>
      ) : null}

      {loading ? <p>Läser journal...</p> : null}

      <div className="history-list-compact">
        {!loading && !raceGroups.length && !error ? <p>Inga LIVE-signaler för valt datum.</p> : null}

        {raceGroups.map(({ win, place }) => {
          const base = win ?? place;
          if (!base) return null;

          const rows = [win, place].filter(
            (bet): bet is WinPlaceBetRecord => bet !== null,
          );
          const allReturnsKnown = rows.every((bet) => bet.returnOren !== null);
          const totalStake = rows.reduce((sum, bet) => sum + bet.stakeOren, 0);
          const totalReturn = allReturnsKnown
            ? rows.reduce((sum, bet) => sum + (bet.returnOren ?? 0), 0)
            : null;
          const totalNet = totalReturn === null ? null : totalReturn - totalStake;
          const isSmallkaramell =
            base.ruleVersion === SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion;

          return (
            <article
              key={`${base.raceId}:${base.ruleVersion}`}
              className="history-row-card"
              style={{ borderLeft: `5px solid ${isSmallkaramell ? "#f59e0b" : "#facc15"}` }}
            >
              <div>
                <strong>{base.date} · {base.trackName} · Lopp {base.raceNumber}</strong>
                <span style={{ color: isSmallkaramell ? "#fbbf24" : "#facc15", fontWeight: 850 }}>
                  {strategyLabel(base.ruleVersion)}
                </span>
                <span>Häst {base.horseNumber}. {base.horseName}</span>
                <span>
                  {decimal(base.startOdds, 2)} → {decimal(base.lockedWinOdds, 2)} · Sänkning {decimal(base.oddsDropPercent)} % · Låst {decimal(base.secondsBeforeStart, 0)} sek före
                </span>
              </div>

              <div style={{ display: "grid", gap: 5 }}>
                <strong style={{ color: resultColor(win) }}>
                  VINNARE: {resultLabel(win)}
                  {win?.officialWinOddsDecimal !== null && win?.officialWinOddsDecimal !== undefined
                    ? ` · odds ${decimal(win.officialWinOddsDecimal, 2)}`
                    : ""}
                </strong>
                <strong style={{ color: resultColor(place) }}>
                  PLATS: {resultLabel(place)}
                  {place?.placeOddsDecimal !== null && place?.placeOddsDecimal !== undefined
                    ? ` · odds ${decimal(place.placeOddsDecimal, 2)}`
                    : ""}
                </strong>
                <span>
                  Placering {base.finishPositionOfficial ?? "-"} · Insats {kronor(totalStake)} kr · Netto {totalNet === null ? "-" : `${totalNet >= 0 ? "+" : ""}${kronor(totalNet)} kr`}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
