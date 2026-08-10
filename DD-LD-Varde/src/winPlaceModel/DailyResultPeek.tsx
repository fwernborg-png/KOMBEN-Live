import { useEffect, useState } from "react";
import { computeWinPlaceStats } from "./journal";
import { loadWinPlaceBetsByRange } from "./repository";

type ResultRange = "DAY" | "7D" | "30D";

type DailyResultPeekProps = {
  date: string;
};

function subtractDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function DailyResultPeek({
  date,
}: DailyResultPeekProps) {
  const [visible, setVisible] = useState(false);
  const [range, setRange] = useState<ResultRange>("DAY");
  const [loading, setLoading] = useState(false);
  const [netOren, setNetOren] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function loadResult() {
      setLoading(true);
      setHasError(false);

      const dateFrom =
        range === "DAY"
          ? date
          : range === "7D"
            ? subtractDays(date, 6)
            : subtractDays(date, 29);

      try {
        const bets = await loadWinPlaceBetsByRange(
          dateFrom,
          date,
          "LIVE",
        );

        if (cancelled) return;

        const stats = computeWinPlaceStats(bets);
        setNetOren(stats.totalNetOren);
      } catch (error) {
        if (cancelled) return;

        console.error(
          "Kunde inte läsa modellresultatet",
          error,
        );
        setHasError(true);
        setNetOren(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadResult();

    return () => {
      cancelled = true;
    };
  }, [date, range, visible]);

  const netSek =
    netOren === null ? null : netOren / 100;

  const resultText =
    loading
      ? "…"
      : hasError
        ? "Fel"
        : netSek === null
          ? "0 kr"
          : `${netSek >= 0 ? "+" : ""}${netSek.toFixed(0)} kr`;

  const resultColor =
    netSek === null
      ? "#94a3b8"
      : netSek >= 0
        ? "#4ade80"
        : "#fb7185";

  if (!visible) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          margin: "-4px 0 12px",
        }}
      >
        <button
          type="button"
          onClick={() => setVisible(true)}
          aria-label="Visa resultat"
          title="Resultat"
          style={{
            minWidth: 72,
            height: 34,
            padding: "0 14px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.18)",
            background: "rgba(15,23,42,0.35)",
            color: "#64748b",
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 3,
            cursor: "pointer",
          }}
        >
          •••
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        margin: "-4px 0 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 6,
          borderRadius: 14,
          border: "1px solid rgba(148,163,184,0.18)",
          background: "rgba(15,23,42,0.48)",
        }}
      >
        {[
          ["DAY", "Dag"],
          ["7D", "7 dagar"],
          ["30D", "30 dagar"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value as ResultRange)}
            style={{
              border: 0,
              borderRadius: 9,
              padding: "7px 9px",
              background:
                range === value
                  ? "rgba(148,163,184,0.18)"
                  : "transparent",
              color:
                range === value
                  ? "#f8fafc"
                  : "#94a3b8",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}

        <strong
          style={{
            minWidth: 76,
            textAlign: "right",
            color: resultColor,
            fontSize: 17,
          }}
        >
          {resultText}
        </strong>

        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dölj resultat"
          title="Dölj"
          style={{
            width: 28,
            height: 28,
            border: 0,
            borderRadius: 8,
            background: "transparent",
            color: "#64748b",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
