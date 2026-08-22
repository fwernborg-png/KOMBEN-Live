import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BIG_B_MONSTER_RULE_CONFIG_V1,
  BLAVALEN_PROSPECTIVE_START_DATE,
  BLAVALEN_RULE_CONFIG_V1,
  MODEL_MIN_WIN_ODDS_INCLUSIVE,
  SMALLKARAMELL_RULE_CONFIG_V1,
  WIN_PLACE_RULE_CONFIG_V1,
} from "./config";

import {
  computeWinPlaceStats,
  type WinPlaceBetRecord,
  type WinPlaceMarket,
  type WinPlaceResultOutcome,
  type WinPlaceResultStatus,
  type WinPlaceStats,
} from "./journal";

import {
  loadWinPlaceBetsByRange,
} from "./repository";

import {
  STRONG_STAR_RULE_V1,
} from "../strongStar";

import {
  GALLOP_T1_SHADOW_RULE_VERSION,
} from "../gallop/gallopT1ShadowConfig";

import {
  loadResearchHistoryOptions,
  loadResearchHistoryRows,
} from "../researchHistory/repository";

import type {
  ResearchHistoryFilters,
  ResearchHistoryRow,
} from "../researchHistory/types";

type Props = {
  date: string;
  mode: "journal" | "stats";
};

type PeriodMode = "DAY" | "TEST_PERIOD" | "ALL_COLLECTION";

const TEST_START_DATE = "2026-08-03";
const TEST_END_DATE = "2026-08-16";
const REFRESH_INTERVAL_MS = 60_000;

const SNIGEL_KOMMER_RULE_VERSION =
  "SNIGEL_KOMMER_V1.0";

const JUPITER_RULE_VERSION =
  "JUPITER_V1.0";

const FEGISEN_RULE_VERSION =
  "FEGISEN_V1.0";

const GRODAN_RULE_VERSION =
  "GRODAN_V1.0";

const ENSAMVARGEN_RULE_VERSION =
  "ENSAMVARGEN_V1.0";

const DIAMANTEN_RULE_VERSION =
  "DIAMANTEN_V1.0";

const STRONG_STAR_RULE_VERSION =
  "STRONG_STAR_V1.0";

const STRONG_STAR_STAKE_OREN =
  10_000;

const T90_SWEDEN_GALLOP_RULE_VERSION =
  "T90_SWEDEN_25_40_V1.0";

const GALLOP_S1_SHADOW_RULE_VERSION =
  "GALLOP_S1_10_ODDS_5_12_5_V1.0";

function buildStrongStarHistoryFilters(
  dateFrom: string,
  dateTo: string,
): ResearchHistoryFilters {
  return {
    dateFrom,
    dateTo,

    selection: "ALL_RUNNERS",

    countryCode: "",

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

    minStrength:
      STRONG_STAR_RULE_V1.strengthTotal,

    maxStrength:
      STRONG_STAR_RULE_V1.strengthTotal,

    krTopFour:
      STRONG_STAR_RULE_V1.krTopFour,

    stTopFour: null,
    driverTopFour: null,

    spTopFour:
      STRONG_STAR_RULE_V1.spTopFour,

    gallopTopFour: null,

    oddsIndicatorTopFour:
      STRONG_STAR_RULE_V1.oddsIndicatorTopFour,

    minDropPercent: null,
    maxDropPercent: null,

    minStartOdds: null,
    maxStartOdds: null,

    minLockOdds: null,
    maxLockOdds: null,

    completeOnly: true,
    limit: 5000,
  };
}

function buildBlavalenLaunchDayHistoryFilters():
  ResearchHistoryFilters {
  return {
    dateFrom:
      BLAVALEN_PROSPECTIVE_START_DATE,

    dateTo:
      BLAVALEN_PROSPECTIVE_START_DATE,

    /*
     * Hämta hela startfältet.
     *
     * Vi får INTE skicka Blåvalens
     * sänknings- eller oddsfilter till RPC:n,
     * eftersom filtreringen där sker innan
     * MOST_SHORTENED väljs och då kan S2
     * felaktigt befordras till S1.
     */
    selection: "ALL_RUNNERS",

    countryCode: "SE",

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

    krTopFour: null,
    stTopFour: null,
    driverTopFour: null,
    spTopFour: null,
    gallopTopFour: null,
    oddsIndicatorTopFour: null,

    minDropPercent: null,
    maxDropPercent: null,

    minStartOdds: null,
    maxStartOdds: null,

    minLockOdds: null,
    maxLockOdds: null,

    /*
     * Gasolina Jet har komplett metric och
     * 56 giltiga oddspunkter, men de äldre
     * snapshot-flaggorna är inte båda true.
     * Vi gör därför Blåvalens egna
     * validitetskontroller lokalt.
     */
    completeOnly: false,

    limit: 5000,
  };
}


function buildStrongStarBetRecords(
  rows: ResearchHistoryRow[],
): WinPlaceBetRecord[] {
  const result: WinPlaceBetRecord[] = [];

  for (const row of rows) {
    const markets: WinPlaceMarket[] = [
      "WIN",
      "PLACE",
    ];

    for (const market of markets) {
      const hit =
        market === "WIN"
          ? row.winnerOfficial
          : row.placedOfficial === true;

      const payoutOdds =
        market === "WIN"
          ? row.officialWinOddsDecimal
          : row.officialPlaceOddsDecimal;

      const resultOutcome:
        WinPlaceResultOutcome =
        row.betVoid
          ? "VOID"
          : hit
            ? "HIT"
            : "MISS";

      const resultStatus:
        WinPlaceResultStatus =
        row.betVoid
          ? "VOID"
          : hit && payoutOdds === null
            ? "SAKNAR_ODDS"
            : "RESULT_READY";

      const returnOren =
        row.betVoid
          ? 0
          : hit
            ? payoutOdds === null
              ? null
              : Math.round(
                  STRONG_STAR_STAKE_OREN *
                  payoutOdds,
                )
            : 0;

      const netOren =
        returnOren === null
          ? null
          : row.betVoid
            ? 0
            : returnOren -
              STRONG_STAR_STAKE_OREN;

      const timestamp =
        row.plannedStartTime ??
        `${row.raceDate}T00:00:00`;

      result.push({
        id:
          `strong-star:${row.raceKey}:` +
          `${row.runnerNumber}:${market}`,

        betId:
          `strong-star:${row.raceKey}:` +
          `${row.runnerNumber}:${market}`,

        raceId: row.raceKey,
        ruleVersion:
          STRONG_STAR_RULE_VERSION,

        market,
        signalPhase: "BACKTEST",

        date: row.raceDate,

        trackId: 0,
        trackName: row.trackName,
        raceNumber: row.raceNumber,

        plannedStartTime: timestamp,
        lockTime: timestamp,
        secondsBeforeStart: 90,

        horseNumber: row.runnerNumber,
        horseName: row.horseName,
        horseId: null,

        startLane: row.startLane,
        startMethod: row.startMethod,
        distanceMeters: row.distanceMeters,
        starters: row.starters,

        startOdds: row.startOdds ?? 0,
        lockedWinOdds: row.lockOdds ?? 0,

        oddsDropPercent:
          row.oddsDropToLockPercent ?? 0,

        cvRaw: row.cvPercent,
        cvDisplay: row.cvPercent,

        strength:
          row.strengthTotal ?? 0,

        indicatorsGreen: [
          "KR",
          "ODD",
        ],

        validOddsPoints:
          row.validOddsPoints,

        stakeOren:
          STRONG_STAR_STAKE_OREN,

        resultOutcome,
        resultStatus,

        finishPositionOfficial:
          row.finishPositionOfficial,

        officialWinOddsDecimal:
          row.officialWinOddsDecimal,

        placeOddsDecimal:
          row.officialPlaceOddsDecimal,

        returnOren,
        netOren,

        roiPct:
          netOren === null ||
          row.betVoid
            ? null
            : (
                netOren /
                STRONG_STAR_STAKE_OREN
              ) * 100,

        automaticModelBet: false,
        userActuallyPlayed: false,

        resultSource:
          "RESEARCH_ARCHIVE",

        resultUpdatedAt: null,

        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  return result;
}

function blavalenBetIdentityKey(
  bet: WinPlaceBetRecord,
) {
  return [
    bet.date,
    bet.trackName
      .trim()
      .toLowerCase(),
    bet.raceNumber,
    bet.horseNumber,
    bet.market,
  ].join(":");
}


function isValidBlavalenHistoryOdds(
  value: number | null,
) {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return false;
  }

  return (
    Math.abs(value - 99.99) >=
    0.001
  );
}


function buildBlavalenBetRecords(
  rows: ResearchHistoryRow[],
): WinPlaceBetRecord[] {
  const result: WinPlaceBetRecord[] = [];

  const validCandidatesByRace =
    new Map<
      string,
      ResearchHistoryRow[]
    >();

  /*
   * Samma grundprincip som live-motorn:
   * först byggs mängden giltiga kandidater,
   * därefter väljs S1.
   *
   * Vi filtrerar alltså INTE på ≥60 %
   * eller maxodds 6,00 förrän S1 är vald.
   */
  for (const row of rows) {
    if (
      row.oddsDropToLockPercent === null ||
      !Number.isFinite(
        row.oddsDropToLockPercent,
      ) ||
      row.validOddsPoints <
        BLAVALEN_RULE_CONFIG_V1
          .minValidOddsPoints ||
      !isValidBlavalenHistoryOdds(
        row.startOdds,
      ) ||
      !isValidBlavalenHistoryOdds(
        row.lockOdds,
      )
    ) {
      continue;
    }

    const current =
      validCandidatesByRace.get(
        row.raceKey,
      ) ?? [];

    current.push(row);

    validCandidatesByRace.set(
      row.raceKey,
      current,
    );
  }

  for (
    const candidates of
    validCandidatesByRace.values()
  ) {
    const candidate =
      [...candidates].sort(
        (a, b) =>
          (
            b.oddsDropToLockPercent ??
            -Infinity
          ) -
            (
              a.oddsDropToLockPercent ??
              -Infinity
            ) ||
          (
            a.lockOdds ??
            Infinity
          ) -
            (
              b.lockOdds ??
              Infinity
            ) ||
          a.runnerNumber -
            b.runnerNumber,
      )[0] ?? null;

    if (
      !candidate ||
      candidate.lockOdds === null ||
      candidate.oddsDropToLockPercent ===
        null
    ) {
      continue;
    }

    /*
     * Ingen fallback till S2.
     * Om vald S1 inte klarar Blåvalens
     * regel blir loppet inget spel.
     */
    if (
      candidate.metricQualityStatus !==
        "COMPLETE" ||
      candidate.oddsDropToLockPercent +
          Number.EPSILON <
        (
          BLAVALEN_RULE_CONFIG_V1
            .minOddsDropPercentInclusive ??
          0
        ) ||
      candidate.lockOdds >
        BLAVALEN_RULE_CONFIG_V1
          .maxCurrentWinOddsInclusive +
          Number.EPSILON
    ) {
      continue;
    }

    const markets: WinPlaceMarket[] = [
      "WIN",
      "PLACE",
    ];

    for (const market of markets) {
      const hit =
        market === "WIN"
          ? candidate.winnerOfficial
          : candidate.placedOfficial ===
            true;

      const payoutOdds =
        market === "WIN"
          ? candidate
              .officialWinOddsDecimal
          : candidate
              .officialPlaceOddsDecimal;

      const stakeOren =
        (
          market === "WIN"
            ? BLAVALEN_RULE_CONFIG_V1
                .defaultWinStakeSEK
            : BLAVALEN_RULE_CONFIG_V1
                .defaultPlaceStakeSEK
        ) * 100;

      const resultOutcome:
        WinPlaceResultOutcome =
        candidate.betVoid
          ? "VOID"
          : hit
            ? "HIT"
            : "MISS";

      const resultStatus:
        WinPlaceResultStatus =
        candidate.betVoid
          ? "VOID"
          : hit &&
              payoutOdds === null
            ? "SAKNAR_ODDS"
            : "RESULT_READY";

      const returnOren =
        candidate.betVoid
          ? 0
          : hit
            ? payoutOdds === null
              ? null
              : Math.round(
                  stakeOren *
                    payoutOdds,
                )
            : 0;

      const netOren =
        returnOren === null
          ? null
          : candidate.betVoid
            ? 0
            : returnOren -
              stakeOren;

      const timestamp =
        candidate.plannedStartTime ??
        `${candidate.raceDate}T00:00:00`;

      result.push({
        id:
          `blavalen-history:` +
          `${candidate.raceKey}:` +
          `${candidate.runnerNumber}:` +
          `${market}`,

        betId:
          `blavalen-history:` +
          `${candidate.raceKey}:` +
          `${candidate.runnerNumber}:` +
          `${market}`,

        raceId:
          candidate.raceKey,

        ruleVersion:
          BLAVALEN_RULE_CONFIG_V1
            .ruleVersion,

        market,
        signalPhase: "BACKTEST",

        date:
          candidate.raceDate,

        trackId: 0,

        trackName:
          candidate.trackName,

        raceNumber:
          candidate.raceNumber,

        plannedStartTime:
          timestamp,

        lockTime:
          timestamp,

        secondsBeforeStart: 90,

        horseNumber:
          candidate.runnerNumber,

        horseName:
          candidate.horseName,

        horseId: null,

        startLane:
          candidate.startLane,

        startMethod:
          candidate.startMethod,

        distanceMeters:
          candidate.distanceMeters,

        starters:
          candidate.starters,

        startOdds:
          candidate.startOdds ?? 0,

        lockedWinOdds:
          candidate.lockOdds,

        oddsDropPercent:
          candidate
            .oddsDropToLockPercent,

        cvRaw:
          candidate.cvPercent,

        cvDisplay:
          candidate.cvPercent,

        strength:
          candidate.strengthTotal ?? 0,

        indicatorsGreen: [],

        validOddsPoints:
          candidate.validOddsPoints,

        stakeOren,

        resultOutcome,
        resultStatus,

        finishPositionOfficial:
          candidate
            .finishPositionOfficial,

        officialWinOddsDecimal:
          candidate
            .officialWinOddsDecimal,

        placeOddsDecimal:
          candidate
            .officialPlaceOddsDecimal,

        returnOren,
        netOren,

        roiPct:
          netOren === null ||
          candidate.betVoid
            ? null
            : (
                netOren /
                stakeOren
              ) * 100,

        automaticModelBet: false,
        userActuallyPlayed: false,

        resultSource:
          "RESEARCH_ARCHIVE",

        resultUpdatedAt: null,

        createdAt:
          timestamp,

        updatedAt:
          timestamp,
      });
    }
  }

  return result;
}


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
        "Jämnaste · oddset ska ha stigit · låsodds ≥3,50 · 9–10 startande · T−90 · WIN",
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
        "Jämnaste · oddset får inte ha stigit · låsodds 3,00–3,99 · T−90 · PLATS",
      className: "is-jupiter",
    };
  }

  if (
    ruleVersion ===
    FEGISEN_RULE_VERSION
  ) {
    return {
      title: "🐔 Fegisen",
      description:
        "Marknadsfavoriten · AUTO · 10–12 hästar · inga strykningar vid lås · vinnarodds 2,00–2,99 · T−90 · PLATS",
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
        "Jämnaste · G topp 4 · låsodds 4,00–9,99 · T−90 · PLATS",
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
        "Exakt en häst med 5–<10 % sänkning · låsodds ≥6,00 · T−90 · WIN",
      className: "is-snigel",
    };
  }

  if (
    ruleVersion ===
    DIAMANTEN_RULE_VERSION
  ) {
    return {
      title: "💎 Diamanten",
      description:
        "2140 m auto · 7–10 startande · styrka exakt 3/6 · låsodds 6,00–25,00 · T−90 · WIN",
      className: "is-diamanten",
    };
  }

  if (
    ruleVersion ===
    BLAVALEN_RULE_CONFIG_V1.ruleVersion
  ) {
    return {
      title: "🐋 Blåvalen",
      description:
        "TEST · S1 · sänkning ≥60 % · låsodds ≤6,00 · T−90 · WIN + PLATS",
      className: "is-most-shortened",
    };
  }

  if (
    ruleVersion ===
    BIG_B_MONSTER_RULE_CONFIG_V1.ruleVersion
  ) {
    return {
      title: "👹 Big B Monster",
      description:
        "Mest sänkt, inget minimikrav · låsodds ≥3,50 · max 8 startande · styrka ≤3/6 · T−90 · WIN + PLATS",
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
        "Näst mest sänkt, inget minimikrav · låsodds 3,50–7,00 · T−90 · WIN + PLATS",
      className: "is-smallkaramell",
    };
  }

  return {
    title: "Mest sänkta",
    description:
      "Mest sänkt · sänkning ≥30 % · låsodds 3,50–6,00 · T−90 · WIN + PLATS",
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
    useState<PeriodMode>(
      "DAY",
    );

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

  const [
    strongStarRows,
    setStrongStarRows,
  ] = useState<ResearchHistoryRow[]>([]);

  const [
    blavalenRows,
    setBlavalenRows,
  ] = useState<ResearchHistoryRow[]>([]);

  const [
    collectionRange,
    setCollectionRange,
  ] = useState<{
    from: string;
    to: string;
  } | null>(null);

  useEffect(() => {
    setPeriodMode(
      "DAY",
    );
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function loadCollectionRange() {
      try {
        const options =
          await loadResearchHistoryOptions();

        if (cancelled) {
          return;
        }

        const from =
          options.minDate ??
          TEST_START_DATE;

        const to =
          options.maxDate &&
          options.maxDate > date
            ? options.maxDate
            : date;

        setCollectionRange({
          from,
          to,
        });
      } catch {
        if (!cancelled) {
          setCollectionRange({
            from: TEST_START_DATE,
            to: date,
          });
        }
      }
    }

    void loadCollectionRange();

    return () => {
      cancelled = true;
    };
  }, [date]);

  const dateRange = useMemo(() => {
    if (periodMode === "ALL_COLLECTION") {
      return {
        from:
          collectionRange?.from ??
          TEST_START_DATE,

        to:
          collectionRange?.to ??
          date,

        label: "Hela insamlingen",
      };
    }

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
  }, [
    collectionRange,
    date,
    periodMode,
  ]);

  const loadBets = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [
          rows,
          loadedStrongStarRows,
          loadedBlavalenRows,
        ] = await Promise.all([
          loadWinPlaceBetsByRange(
            dateRange.from,
            dateRange.to,
            "LIVE",
          ),

          mode === "stats"
            ? loadResearchHistoryRows(
                buildStrongStarHistoryFilters(
                  dateRange.from,
                  dateRange.to,
                ),
              )
            : Promise.resolve(
                [] as ResearchHistoryRow[],
              ),

          mode === "stats" &&
          dateRange.from <=
            BLAVALEN_PROSPECTIVE_START_DATE &&
          dateRange.to >=
            BLAVALEN_PROSPECTIVE_START_DATE
            ? loadResearchHistoryRows(
                buildBlavalenLaunchDayHistoryFilters(),
              )
            : Promise.resolve(
                [] as ResearchHistoryRow[],
              ),
        ]);

        setBets(
          mode === "stats"
            ? rows.filter(
                (row) =>
                  row.market !== "WIN" ||
                  row.ruleVersion ===
                    BLAVALEN_RULE_CONFIG_V1
                      .ruleVersion ||
                  row.lockedWinOdds +
                    Number.EPSILON >=
                    MODEL_MIN_WIN_ODDS_INCLUSIVE,
              )
            : rows,
        );

        setStrongStarRows(
          loadedStrongStarRows,
        );

        setBlavalenRows(
          loadedBlavalenRows,
        );

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
    [
      dateRange.from,
      dateRange.to,
      mode,
    ],
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
          "Jämnaste · oddset ska ha stigit · låsodds ≥3,50 · 9–10 startande · T−90 · WIN",
        className: "is-snigel",
        winOnly: true,
        placeOnly: false,
      },
      {
        ruleVersion:
          JUPITER_RULE_VERSION,
        title: "🪐 Jupiter",
        description:
          "Jämnaste · oddset får inte ha stigit · låsodds 3,00–3,99 · T−90 · PLATS",
        className: "is-jupiter",
        winOnly: false,
        placeOnly: true,
      },
      {
        ruleVersion:
          FEGISEN_RULE_VERSION,
        title: "🐔 Fegisen",
        description:
          "Marknadsfavoriten · AUTO · 10–12 hästar · inga strykningar vid lås · vinnarodds 2,00–2,99 · T−90 · PLATS",
        className: "is-jupiter",
        winOnly: false,
        placeOnly: true,
      },
      {
        ruleVersion:
          GRODAN_RULE_VERSION,
        title: "🐸 Grodan",
        description:
          "Jämnaste · G topp 4 · låsodds 4,00–9,99 · T−90 · PLATS",
        className: "is-jupiter",
        winOnly: false,
        placeOnly: true,
      },
      {
        ruleVersion:
          ENSAMVARGEN_RULE_VERSION,
        title: "🐺 Ensamvargen",
        description:
          "Exakt en häst med 5–<10 % sänkning · låsodds ≥6,00 · T−90 · WIN",
        className: "is-snigel",
        winOnly: true,
        placeOnly: false,
      },
      {
        ruleVersion:
          DIAMANTEN_RULE_VERSION,
        title: "💎 Diamanten",
        description:
          "2140 m auto · 7–10 startande · styrka exakt 3/6 · låsodds 6,00–25,00 · T−90 · WIN",
        className: "is-diamanten",
        winOnly: true,
        placeOnly: false,
      },
      {
        ruleVersion:
          BLAVALEN_RULE_CONFIG_V1.ruleVersion,
        title: "🐋 Blåvalen",
        description:
          "TEST från 22/8 · S1 · sänkning ≥60 % · låsodds ≤6,00 · T−90 · WIN + PLATS",
        className: "is-most-shortened",
        winOnly: false,
        placeOnly: false,
      },
      {
        ruleVersion:
          BIG_B_MONSTER_RULE_CONFIG_V1.ruleVersion,
        title: "👹 Big B Monster",
        description:
          "Mest sänkt, inget minimikrav · låsodds ≥3,50 · max 8 startande · styrka ≤3/6 · T−90 · WIN + PLATS",
        className: "is-most-shortened",
        winOnly: false,
        placeOnly: false,
      },
      {
        ruleVersion:
          SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion,
        title: "🦞 Kräfta i buren",
        description:
          "Näst mest sänkt, inget minimikrav · låsodds 3,50–7,00 · T−90 · WIN + PLATS",
        className: "is-smallkaramell",
        winOnly: false,
        placeOnly: false,
      },
    ],
    [],
  );

  const strongStarBets =
    useMemo(
      () => {
        const liveRecords =
          bets.filter(
            (bet) =>
              bet.ruleVersion ===
              STRONG_STAR_RULE_VERSION,
          );

        const liveKeys =
          new Set(
            liveRecords.map(
              (bet) =>
                [
                  bet.raceId,
                  bet.horseNumber,
                  bet.market,
                ].join(":"),
            ),
          );

        const historicalRecords =
          buildStrongStarBetRecords(
            strongStarRows,
          ).filter(
            (bet) =>
              !liveKeys.has(
                [
                  bet.raceId,
                  bet.horseNumber,
                  bet.market,
                ].join(":"),
              ),
          );

        const records = [
          ...liveRecords,
          ...historicalRecords,
        ];

        return mode === "stats"
          ? records.filter(
              (bet) =>
                bet.market !== "WIN" ||
                bet.lockedWinOdds + Number.EPSILON >=
                  MODEL_MIN_WIN_ODDS_INCLUSIVE,
            )
          : records;
      },
      [
        bets,
        strongStarRows,
        mode,
      ],
    );

  const blavalenBets =
    useMemo(
      () => {
        const liveRecords =
          bets.filter(
            (bet) =>
              bet.ruleVersion ===
              BLAVALEN_RULE_CONFIG_V1
                .ruleVersion,
          );

        if (mode !== "stats") {
          return liveRecords;
        }

        const liveKeys =
          new Set(
            liveRecords.map(
              blavalenBetIdentityKey,
            ),
          );

        const historicalRecords =
          buildBlavalenBetRecords(
            blavalenRows,
          ).filter(
            (bet) =>
              !liveKeys.has(
                blavalenBetIdentityKey(
                  bet,
                ),
              ),
          );

        return [
          ...liveRecords,
          ...historicalRecords,
        ];
      },
      [
        bets,
        blavalenRows,
        mode,
      ],
    );


  /*
   * Skuggmodellen får inte påverka
   * ordinarie antal signaler, insats,
   * återbetalning eller ROI.
   */
  const regularBets =
    useMemo(
      () =>
        bets.filter(
          (bet) =>
            bet.ruleVersion !==
              STRONG_STAR_RULE_VERSION &&
            bet.ruleVersion !==
              T90_SWEDEN_GALLOP_RULE_VERSION &&
            bet.ruleVersion !==
              GALLOP_T1_SHADOW_RULE_VERSION &&
            bet.ruleVersion !==
              GALLOP_S1_SHADOW_RULE_VERSION,
        ),
      [bets],
    );

  const statsRegularBets =
    useMemo(
      () =>
        regularBets.filter(
          (bet) =>
            bet.ruleVersion !==
              WIN_PLACE_RULE_CONFIG_V1
                .ruleVersion &&
            bet.ruleVersion !==
              BLAVALEN_RULE_CONFIG_V1
                .ruleVersion,
        ),
      [regularBets],
    );


  const strategyGroups = useMemo(
    () => {
      const regularGroups =
        strategyDefinitions.map(
          (definition) => {
            const strategyBets =
              definition.ruleVersion ===
              BLAVALEN_RULE_CONFIG_V1
                .ruleVersion
                ? blavalenBets
                : statsRegularBets.filter(
                    (bet) =>
                      bet.ruleVersion ===
                      definition.ruleVersion,
                  );

            return {
              ...definition,
              bets: strategyBets,

              winStats:
                computeWinPlaceStats(
                  strategyBets,
                  "WIN",
                ),

              placeStats:
                computeWinPlaceStats(
                  strategyBets,
                  "PLACE",
                ),

              combinedStats:
                computeWinPlaceStats(
                  strategyBets,
                ),
            };
          },
        );

      const strongStarGroup = {
        ruleVersion:
          STRONG_STAR_RULE_VERSION,

        title: "⭐ Stjärnhästar",

        description:
          "Styrka 3/6 · KR och ODD topp 4 · " +
          "SP inte topp 4 · T−90 · WIN + PLATS",

        className: "is-diamanten",

        winOnly: false,
        placeOnly: false,

        bets: strongStarBets,

        winStats:
          computeWinPlaceStats(
            strongStarBets,
            "WIN",
          ),

        placeStats:
          computeWinPlaceStats(
            strongStarBets,
            "PLACE",
          ),

        combinedStats:
          computeWinPlaceStats(
            strongStarBets,
          ),
      };

      return [
        strongStarGroup,
        ...regularGroups,
      ];
    },
    [
      blavalenBets,
      statsRegularBets,
      strongStarBets,
      strategyDefinitions,
    ],
  );

  const combinedStats = useMemo(
    () =>
      computeWinPlaceStats(
        mode === "stats"
          ? [
              ...statsRegularBets,
              ...blavalenBets,
              ...strongStarBets,
            ]
          : regularBets,
      ),
    [
      blavalenBets,
      mode,
      regularBets,
      statsRegularBets,
      strongStarBets,
    ],
  );

  const raceGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        win: WinPlaceBetRecord | null;
        place: WinPlaceBetRecord | null;
      }
    >();

    for (const bet of regularBets) {
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
  }, [regularBets]);

  const strongStarSignalCount =
    useMemo(
      () =>
        new Set(
          strongStarBets.map(
            (bet) =>
              [
                bet.raceId,
                bet.horseNumber,
              ].join(":"),
          ),
        ).size,
      [strongStarBets],
    );

  const statsRegularSignalCount =
    useMemo(
      () =>
        new Set(
          statsRegularBets.map(
            (bet) =>
              [
                bet.raceId,
                bet.ruleVersion,
              ].join(":"),
          ),
        ).size,
      [statsRegularBets],
    );

  const blavalenSignalCount =
    useMemo(
      () =>
        new Set(
          blavalenBets.map(
            (bet) =>
              [
                bet.raceId,
                bet.horseNumber,
              ].join(":"),
          ),
        ).size,
      [blavalenBets],
    );

  const overallSignalCount =
    mode === "stats"
      ? statsRegularSignalCount +
        blavalenSignalCount +
        strongStarSignalCount
      : raceGroups.length;

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
              Idag
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

            {mode === "stats" ? (
              <button
                type="button"
                className={
                  periodMode ===
                  "ALL_COLLECTION"
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  setPeriodMode(
                    "ALL_COLLECTION",
                  )
                }
              >
                Hela insamlingen
              </button>
            ) : null}
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
          value={String(overallSignalCount)}
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
        <strong>Så läses reglerna:</strong>
        <span>
          Låsodds avser hästens WIN-odds vid
          T−90. Sänkning mäts från första
          giltiga oddspunkt till låsningen.
        </span>
      </div>

      <div className="test-period-note">
        <strong>
          🧪 Galopp – 30-sekundersinsamling:
        </strong>
        <span>
          Svenska galopplopp · exakta WIN-odds
          sista tre minuterna · inga spelbeslut ·
          ingår inte i strategiernas totalsiffror.
        </span>
      </div>

      <div className="test-period-note">
        <strong>Testperiod 3–16 augusti:</strong>
        <span>
          Den gamla Mest sänkta-regeln är
          pensionerad. Historiken ligger kvar i
          speljournalen men ingår inte längre i
          Strategistatistikens totalsiffror.
          Blåvalen räknas från 22 augusti,
          inklusive dagens redan avslutade lopp
          från researcharkivets T−90-data.
          Snigel kommer och Jupiter följs
          framåt från 10 augusti.
          Diamanten följs framåt från
          11 augusti och redovisas separat.
          Stjärnhästar räknas om från
          forskningsarkivets LOCK-data med
          dagens stjärnregel och ingår i
          Strategistatistikens total med
          100 kr vinnare + 100 kr plats
          per stjärnhäst.
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
