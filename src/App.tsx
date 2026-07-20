import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "./lib/supabase";

type Track = {
  id: number;
  name: string;
  startTime?: string;
  products: string[];
};

type CalendarResponse = {
  tracks?: unknown[];
};

type Runner = {
  number: number;
  name: string;
  driver: string;
  odds: number | null;
  scratched: boolean;
};

type Race = {
  raceNumber: number;
  id: string;
  startTime?: string;
  status?: string;
  runners: Runner[];
  isMonte: boolean;
  isP21: boolean;
  finishOrder: number[];
};

type OddsPoint = {
  odds: number;
  timestamp: number;
};

type OddsHistory = Record<string, OddsPoint[]>;

type SavedBet = {
  id: string;
  date: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  a1Number: number;
  a1Name: string;
  a2Number: number;
  a2Name: string;
  firstNumber: number;
  secondNumber: number;
  comboOdds: number | null;
  hit: boolean;
  winningOrder: "A1-A2" | "A2-A1" | "MISS";
  stake: number;
  returnAmount: number;
  net: number;
  lockedAt: string;
  savedAt: string;
  automatic?: boolean;
  needsComboOdds?: boolean;
};

const BETS_STORAGE_KEY = "komben-live-bets-v1";
const ODDS_STORAGE_KEY = "komben-live-odds-history-v1";
const AUTO_SELECTIONS_STORAGE_KEY = "komben-live-auto-selections-v1";
const ALL_RACES_REFRESH_SECONDS = 30;
const MAX_HISTORY_POINTS = 720;

type AutoSelection = {
  raceId: string;
  raceNumber: number;
  a1: TrendRunner;
  a2: TrendRunner;
  lockedAt: string;
};

type TrendRunner = Runner & {
  firstOdds: number | null;
  previousOdds: number | null;
  changePercent: number | null;
  latestAbsoluteChange: number | null;
  direction: "down" | "up" | "same";
  recentOdds: number[];
  samples: number;
  momentum: string;
};

type UnknownRecord = Record<string, unknown>;

const API = "https://www.atg.se/services/racinginfo/v1/api";
const MAX_RACES_TO_CHECK = 15;
const REFRESH_SECONDS = 10;
const TARGET_PRODUCTS = ["V4", "V64", "V65", "V85", "V86"] as const;

const SWEDISH_TRACK_NAMES = new Set(
  [
    "arvika",
    "axevalla",
    "bergsaker",
    "boden",
    "bollnas",
    "dannero",
    "eskilstuna",
    "farjestad",
    "gavle",
    "hagmyren",
    "halmstad",
    "hoting",
    "jagersro",
    "kalmar",
    "karlshamn",
    "lindesberg",
    "lycksele",
    "mantorp",
    "rattvik",
    "romme",
    "skelleftea",
    "solanget",
    "solvalla",
    "tingsryd",
    "umaker",
    "vaggeryd",
    "visby",
    "aby",
    "amal",
    "arjang",
    "orebro",
    "ostersund",
  ].map((name) => name.toLowerCase()),
);

function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatTime(value?: string) {
  if (!value) return "–";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";

  return date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((item) => collectStrings(item, depth + 1));
}

function extractTargetProducts(value: unknown) {
  const text = collectStrings(value).join(" ").toUpperCase();
  return TARGET_PRODUCTS.filter((product) =>
    new RegExp(`(^|[^A-Z0-9])${product}([^A-Z0-9]|$)`).test(text),
  );
}

function isSwedishTrackName(name: string) {
  return SWEDISH_TRACK_NAMES.has(normalizeText(name));
}

function isLunchStart(startTime?: string) {
  if (!startTime) return false;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return false;
  const hour = Number(
    start.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Europe/Stockholm",
    }),
  );
  return hour >= 10 && hour < 16;
}

function parseTrack(value: unknown): Track | null {
  if (!isRecord(value)) return null;

  const id =
    asNumber(value.id) ??
    asNumber(value.trackId) ??
    asNumber(value.number);
  const name =
    asString(value.name) ||
    asString(value.trackName) ||
    asString(value.displayName);
  if (id === null || !name) return null;

  const startTime =
    asString(value.startTime) ||
    asString(value.firstStartTime) ||
    asString(value.firstRaceStartTime);
  const products = extractTargetProducts(value);
  const countryCode = normalizeText(
    asString(value.countryCode) ||
      asString(value.country) ||
      asString(value.nation),
  );
  const isSwedish =
    countryCode === "se" ||
    countryCode === "swe" ||
    countryCode === "sweden" ||
    countryCode === "sverige" ||
    isSwedishTrackName(name);
  const hasMainProduct = products.some((product) => product !== "V4");
  const hasLunchV4 = products.includes("V4") && isLunchStart(startTime);

  if (!isSwedish || (!hasMainProduct && !hasLunchV4)) return null;

  return { id, name, startTime, products };
}

function getRecord(value: unknown, key: string): UnknownRecord | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return [];
  const child = value[key];
  return Array.isArray(child) ? child : [];
}

function formatOdds(rawOdds: number | null) {
  if (rawOdds === null || rawOdds <= 0) return "–";
  return (rawOdds / 100).toFixed(2).replace(".", ",");
}

function runnerKey(raceId: string, runnerNumber: number) {
  return `${raceId}:${runnerNumber}`;
}

function percentChange(first: number | null, current: number | null) {
  if (!first || !current || first <= 0) return null;
  return ((current - first) / first) * 100;
}

function absoluteOddsChange(previous: number | null, current: number | null) {
  if (previous === null || current === null) return null;
  return (current - previous) / 100;
}

function formatAbsoluteChange(value: number | null) {
  if (value === null || Math.abs(value) < 0.005) return "0,00";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2).replace(".", ",")}`;
}

function totalTrendColor(changePercent: number | null) {
  if (changePercent === null || Math.abs(changePercent) < 0.05) return "#f8fafc";
  return changePercent < 0 ? "#4ade80" : "#fb7185";
}

function totalTrendArrow(changePercent: number | null) {
  if (changePercent === null || Math.abs(changePercent) < 0.05) return "→";
  return changePercent < 0 ? "↓" : "↑";
}

function totalTrendLabel(changePercent: number | null) {
  if (changePercent === null || Math.abs(changePercent) < 0.05) return "STABIL";
  return changePercent < 0 ? "STÄRKS" : "TAPPAR";
}

function momentumDisplay(momentum: string) {
  if (momentum === "Starkt ned") return "Stärks starkt kortsiktigt";
  if (momentum === "Ned") return "Stärks kortsiktigt";
  if (momentum === "Starkt upp") return "Tappar starkt kortsiktigt";
  if (momentum === "Upp") return "Tappar kortsiktigt";
  return momentum;
}

function momentumLabel(history: OddsPoint[]) {
  if (history.length < 3) return "För lite data";

  const recent = history.slice(-5);
  let down = 0;
  let up = 0;

  for (let i = 1; i < recent.length; i += 1) {
    if (recent[i].odds < recent[i - 1].odds) down += 1;
    if (recent[i].odds > recent[i - 1].odds) up += 1;
  }

  if (down >= 3 && down > up) return "Starkt ned";
  if (down === 2 && down > up) return "Ned";
  if (up >= 3 && up > down) return "Starkt upp";
  if (up === 2 && up > down) return "Upp";
  return "Stabil";
}

function checkpointOdds(
  history: OddsPoint[],
  raceStartTime: string | undefined,
  minutesBefore: number,
) {
  if (!raceStartTime || !history.length) return null;

  const startMs = new Date(raceStartTime).getTime();
  if (Number.isNaN(startMs)) return null;

  const target = startMs - minutesBefore * 60_000;
  const tolerance =
    minutesBefore <= 5 ? 4 * 60_000 : 8 * 60_000;

  let closest: OddsPoint | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const point of history) {
    const distance = Math.abs(point.timestamp - target);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closest = point;
    }
  }

  return closest && smallestDistance <= tolerance ? closest.odds : null;
}

function formatPercent(value: number | null) {
  if (value === null || Math.abs(value) < 0.05) return "0,0 %";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")} %`;
}

function parseDriver(start: UnknownRecord) {
  const driver = getRecord(start, "driver");
  if (!driver) return "–";

  const shortName = asString(driver.shortName);
  if (shortName) return shortName;

  return [asString(driver.firstName), asString(driver.lastName)]
    .filter(Boolean)
    .join(" ") || "–";
}

function parseRunner(value: unknown, fallbackNumber: number): Runner | null {
  if (!isRecord(value)) return null;

  const horse = getRecord(value, "horse") ?? value;
  const number =
    asNumber(value.number) ??
    asNumber(value.startNumber) ??
    asNumber(horse.number) ??
    fallbackNumber;

  const name =
    asString(horse.name) ||
    asString(value.horseName) ||
    asString(value.name) ||
    `Häst ${number}`;

  const pools = getRecord(value, "pools");
  const winnerPool = pools
    ? getRecord(pools, "vinnare") ?? getRecord(pools, "winner") ?? getRecord(pools, "win")
    : undefined;

  const odds =
    (winnerPool ? asNumber(winnerPool.odds) : null) ??
    asNumber(value.odds);

  const scratched =
    value.scratched === true ||
    value.withdrawn === true ||
    asString(value.status).toLowerCase() === "scratched";

  return {
    number,
    name,
    driver: parseDriver(value),
    odds,
    scratched,
  };
}

function parseFinishPosition(value: unknown) {
  if (!isRecord(value)) return null;
  const result = getRecord(value, "result");
  const position =
    asNumber(value.finishPosition) ??
    asNumber(value.position) ??
    asNumber(value.place) ??
    asNumber(value.rank) ??
    (result ?
      asNumber(result.finishPosition) ??
      asNumber(result.position) ??
      asNumber(result.place) ??
      asNumber(result.rank)
      : null);
  return position && position > 0 ? position : null;
}

function buildTrendRunnersForRace(race: Race, oddsHistory: OddsHistory): TrendRunner[] {
  return race.runners.map((runner) => {
    const history = oddsHistory[runnerKey(race.id, runner.number)] ?? [];
    const firstOdds = history.length ? history[0].odds : runner.odds;
    const previousOdds = history.length >= 2 ? history[history.length - 2].odds : runner.odds;
    const currentOdds = runner.odds;
    const changePercent = percentChange(firstOdds, currentOdds);
    const latestAbsoluteChange = absoluteOddsChange(previousOdds, currentOdds);
    let direction: TrendRunner["direction"] = "same";
    if (previousOdds && currentOdds) {
      if (currentOdds < previousOdds) direction = "down";
      if (currentOdds > previousOdds) direction = "up";
    }
    return {
      ...runner,
      firstOdds,
      previousOdds,
      changePercent,
      latestAbsoluteChange,
      direction,
      recentOdds: history.slice(-5).map((point) => point.odds),
      samples: history.length,
      momentum: momentumLabel(history),
    };
  });
}

function rankCandidates(runners: TrendRunner[]) {
  return runners
    .filter((runner) => !runner.scratched && runner.odds !== null && runner.changePercent !== null && runner.samples >= 3)
    .sort((a, b) => {
      const aScore = (a.changePercent ?? 0) - (a.direction === "down" ? 1.5 : 0) - (a.momentum === "Starkt ned" ? 2 : a.momentum === "Ned" ? 1 : 0);
      const bScore = (b.changePercent ?? 0) - (b.direction === "down" ? 1.5 : 0) - (b.momentum === "Starkt ned" ? 2 : b.momentum === "Ned" ? 1 : 0);
      return aScore - bScore;
    })
    .slice(0, 2);
}

function parseRace(data: unknown, requestedRaceNumber: number): Race | null {
  if (!isRecord(data)) return null;

  const races = getArray(data, "races");
  const rawRace = races[0];

  if (!isRecord(rawRace)) return null;

  const raceNumber =
    asNumber(rawRace.number) ??
    asNumber(rawRace.raceNumber) ??
    requestedRaceNumber;

  const rawStarts =
    getArray(rawRace, "starts").length > 0
      ? getArray(rawRace, "starts")
      : getArray(rawRace, "horses");

  const runners = rawStarts
    .map((start, index) => parseRunner(start, index + 1))
    .filter((runner): runner is Runner => runner !== null)
    .sort((a, b) => a.number - b.number);

  const finishOrder = rawStarts
    .map((start, index) => {
      const runner = parseRunner(start, index + 1);
      const position = parseFinishPosition(start);
      return runner && position ? { number: runner.number, position } : null;
    })
    .filter((item): item is { number: number; position: number } => item !== null)
    .sort((a, b) => a.position - b.position)
    .map((item) => item.number);

  const raceText = collectStrings(rawRace).join(" ").toLowerCase();

  return {
    raceNumber,
    id: asString(data.id) || `race-${requestedRaceNumber}`,
    startTime:
      asString(rawRace.startTime) ||
      asString(rawRace.scheduledStartTime) ||
      asString(data.startTime),
    status: asString(data.status) || asString(rawRace.status),
    runners,
    isMonte: /mont[eé]/i.test(raceText),
    isP21: /(^|[^a-z0-9])p21([^a-z0-9]|$)/i.test(raceText),
    finishOrder,
  };
}

export default function App() {
  const [dbStatus, setDbStatus] = useState("Testar...");
  useEffect(() => {
  async function testConnection() {
    const { error } = await supabase
      .from("komben_races")
      .select("*")
      .limit(1);

    if (error) {
      setDbStatus("❌ " + error.message);
    } else {
      setDbStatus("✅ Databasen fungerar!");
    }
  }

  testConnection();
}, []);
  const [date, setDate] = useState(today());
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState("");
  const [races, setRaces] = useState<Race[]>([]);
  const [raceNumber, setRaceNumber] = useState("");
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [secondsToRefresh, setSecondsToRefresh] = useState(REFRESH_SECONDS);
  const [oddsHistory, setOddsHistory] = useState<OddsHistory>({});
  const [savedBets, setSavedBets] = useState<SavedBet[]>([]);
  const [lockedSelection, setLockedSelection] = useState<{
    a1: TrendRunner;
    a2: TrendRunner;
    lockedAt: string;
  } | null>(null);
  const [firstNumber, setFirstNumber] = useState("");
  const [secondNumber, setSecondNumber] = useState("");
  const [comboOddsInput, setComboOddsInput] = useState("");
  const [allRacesUpdated, setAllRacesUpdated] = useState("");
  const [backgroundCollecting, setBackgroundCollecting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [autoSelections, setAutoSelections] = useState<AutoSelection[]>([]);
  const [autoStatus, setAutoStatus] = useState("Helkvällsautomaten väntar på en bana.");
  const [pendingOddsInputs, setPendingOddsInputs] = useState<Record<string, string>>({});

  const selectedTrack = useMemo(
    () => tracks.find((track) => String(track.id) === trackId),
    [tracks, trackId],
  );

  const selectedRace = useMemo(
    () => races.find((race) => String(race.raceNumber) === raceNumber),
    [races, raceNumber],
  );

  const countdown = useMemo(() => {
    if (!selectedRace?.startTime) {
      return {
        label: "Ingen starttid",
        phase: "unknown" as const,
        totalSeconds: null as number | null,
      };
    }

    const startMs = new Date(selectedRace.startTime).getTime();

    if (Number.isNaN(startMs)) {
      return {
        label: "Ingen starttid",
        phase: "unknown" as const,
        totalSeconds: null as number | null,
      };
    }

    const diffSeconds = Math.floor((startMs - nowMs) / 1000);

    if (diffSeconds <= 0) {
      return {
        label: "STARTAT",
        phase: "started" as const,
        totalSeconds: diffSeconds,
      };
    }

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;

    const label =
      hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;

    let phase: "normal" | "warning" | "urgent" | "critical" = "normal";

    if (diffSeconds <= 60) {
      phase = "critical";
    } else if (diffSeconds <= 5 * 60) {
      phase = "urgent";
    } else if (diffSeconds <= 10 * 60) {
      phase = "warning";
    }

    return {
      label,
      phase,
      totalSeconds: diffSeconds,
    };
  }, [selectedRace?.startTime, nowMs]);

  const trendRunners = useMemo<TrendRunner[]>(() => {
    if (!selectedRace) return [];
    return buildTrendRunnersForRace(selectedRace, oddsHistory);
  }, [selectedRace, oddsHistory]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ODDS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OddsHistory;
        if (parsed && typeof parsed === "object") {
          setOddsHistory(parsed);
        }
      }
    } catch (error) {
      console.error("Kunde inte läsa sparad oddshistorik", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ODDS_STORAGE_KEY,
        JSON.stringify(oddsHistory),
      );
    } catch (error) {
      console.error("Kunde inte spara oddshistorik", error);
    }
  }, [oddsHistory]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedBet[];
        if (Array.isArray(parsed)) setSavedBets(parsed);
      }
    } catch (error) {
      console.error("Kunde inte läsa sparad speljournal", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(BETS_STORAGE_KEY, JSON.stringify(savedBets));
    } catch (error) {
      console.error("Kunde inte spara speljournal", error);
    }
  }, [savedBets]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AUTO_SELECTIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AutoSelection[];
        if (Array.isArray(parsed)) setAutoSelections(parsed);
      }
    } catch (error) {
      console.error("Kunde inte läsa automatiska låsningar", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SELECTIONS_STORAGE_KEY, JSON.stringify(autoSelections));
    } catch (error) {
      console.error("Kunde inte spara automatiska låsningar", error);
    }
  }, [autoSelections]);

  useEffect(() => {
    setLockedSelection(null);
    setFirstNumber("");
    setSecondNumber("");
    setComboOddsInput("");
  }, [trackId, raceNumber]);

  const candidates = useMemo(() => rankCandidates(trendRunners), [trendRunners]);

  const favoriteRunner = useMemo(() => {
    return [...trendRunners]
      .filter((runner) => !runner.scratched && runner.odds !== null && runner.odds > 0)
      .sort((a, b) => (a.odds ?? Number.POSITIVE_INFINITY) - (b.odds ?? Number.POSITIVE_INFINITY))[0] ?? null;
  }, [trendRunners]);

  const racePictureText = useMemo(() => {
    if (!favoriteRunner || !candidates[0] || !candidates[1]) {
      return "För lite data för en tydlig loppbild ännu.";
    }

    const favChange = favoriteRunner.changePercent ?? 0;
    const a1Change = candidates[0].changePercent ?? 0;
    const a2Change = candidates[1].changePercent ?? 0;

    if (favChange > 4 && a1Change < -5 && a2Change < -5) {
      return "Favoriten försvagas samtidigt som både A1 och A2 sjunker tydligt. Intressant loppbild.";
    }

    if (favChange < -5 && (a1Change > -3 || a2Change > -3)) {
      return "Favoriten stärks tydligt. A1/A2-rörelsen bör värderas försiktigare.";
    }

    if (Math.abs(favChange) < 3 && a1Change < -8 && a2Change < -8) {
      return "Favoriten är stabil medan A1 och A2 får tydliga oddssänkningar.";
    }

    if (favChange > 5) {
      return "Favoriten stiger och tappar stöd. Det öppnar loppbilden.";
    }

    if (favChange < -5) {
      return "Favoriten sjunker och stärks i marknaden.";
    }

    return "Favoriten är relativt stabil. A1 och A2 bedöms främst på sina egna trender.";
  }, [favoriteRunner, candidates]);


  const journalTotals = useMemo(() => {
    const stake = savedBets.reduce((sum, bet) => sum + bet.stake, 0);
    const returnAmount = savedBets.reduce((sum, bet) => sum + bet.returnAmount, 0);
    const net = returnAmount - stake;
    const roi = stake > 0 ? (net / stake) * 100 : 0;
    const hits = savedBets.filter((bet) => bet.hit).length;
    return { stake, returnAmount, net, roi, hits };
  }, [savedBets]);

  function lockCurrentSelection() {
    if (!candidates[0] || !candidates[1]) {
      setError("Det finns ännu inte två kandidater med tillräcklig trenddata.");
      return;
    }
    setLockedSelection({
      a1: candidates[0],
      a2: candidates[1],
      lockedAt: new Date().toLocaleTimeString("sv-SE"),
    });
    setError("");
  }

  function saveResult() {
    if (!selectedTrack || !selectedRace || !lockedSelection) {
      setError("Lås A1 och A2 innan resultatet sparas.");
      return;
    }

    const first = Number(firstNumber);
    const second = Number(secondNumber);

    if (!first || !second || first === second) {
      setError("Välj olika hästar som etta och tvåa.");
      return;
    }

    const a1 = lockedSelection.a1;
    const a2 = lockedSelection.a2;
    const isA1A2 = first === a1.number && second === a2.number;
    const isA2A1 = first === a2.number && second === a1.number;
    const hit = isA1A2 || isA2A1;

    const parsedOdds = Number(comboOddsInput.replace(",", "."));
    const comboOdds = Number.isFinite(parsedOdds) && parsedOdds > 0 ? parsedOdds : null;

    if (hit && comboOdds === null) {
      setError("Ange komboddset för den vinnande ordningen.");
      return;
    }

    const stake = 100;
    const returnAmount = hit && comboOdds ? 50 * comboOdds : 0;
    const net = returnAmount - stake;

    const bet: SavedBet = {
      id: `${date}-${selectedTrack.id}-${selectedRace.raceNumber}-${Date.now()}`,
      date,
      trackId: selectedTrack.id,
      trackName: selectedTrack.name,
      raceNumber: selectedRace.raceNumber,
      a1Number: a1.number,
      a1Name: a1.name,
      a2Number: a2.number,
      a2Name: a2.name,
      firstNumber: first,
      secondNumber: second,
      comboOdds,
      hit,
      winningOrder: isA1A2 ? "A1-A2" : isA2A1 ? "A2-A1" : "MISS",
      stake,
      returnAmount,
      net,
      lockedAt: lockedSelection.lockedAt,
      savedAt: new Date().toISOString(),
    };

    setSavedBets((current) => [bet, ...current]);
    setFirstNumber("");
    setSecondNumber("");
    setComboOddsInput("");
    setLockedSelection(null);
    setError("");
  }

  function deleteSavedBet(id: string) {
    setSavedBets((current) => current.filter((bet) => bet.id !== id));
  }

  function finalizeComboOdds(id: string) {
    const raw = pendingOddsInputs[id] ?? "";
    const odds = Number(raw.replace(",", "."));
    if (!Number.isFinite(odds) || odds <= 0) {
      setError("Ange ett giltigt kombodds.");
      return;
    }
    setSavedBets((current) => current.map((bet) => {
      if (bet.id !== id) return bet;
      const returnAmount = 50 * odds;
      return { ...bet, comboOdds: odds, returnAmount, net: returnAmount - bet.stake, needsComboOdds: false };
    }));
    setPendingOddsInputs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setError("");
  }


  async function loadTracks() {
    setLoadingTracks(true);
    setError("");
    setTrackId("");
    setRaces([]);
    setRaceNumber("");

    try {
      const response = await fetch(`${API}/calendar/day/${date}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`ATG svarade med status ${response.status}`);
      }

      const data = (await response.json()) as CalendarResponse;
      const list = (data.tracks ?? [])
        .map(parseTrack)
        .filter((track): track is Track => track !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "sv"));

      setTracks(list);
      setUpdated(new Date().toLocaleTimeString("sv-SE"));

      if (!list.length) {
        setError(
          "Inga svenska lunch-V4-, V64-, V65-, V85- eller V86-omgångar hittades för valt datum.",
        );
      }
    } catch (err) {
      console.error(err);
      setTracks([]);
      setError("Kunde inte hämta banorna från ATG.");
    } finally {
      setLoadingTracks(false);
    }
  }

  async function fetchRace(track: Track, number: number) {
    const gameId = `vinnare_${date}_${track.id}_${number}`;
    const response = await fetch(`${API}/games/${gameId}`, {
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data: unknown = await response.json();
    return parseRace(data, number);
  }

  async function loadRaces(track = selectedTrack) {
    if (!track) return;

    setLoadingRaces(true);
    setError("");
    setRaces([]);
    setRaceNumber("");

    try {
      const raceNumbers = Array.from(
        { length: MAX_RACES_TO_CHECK },
        (_, index) => index + 1,
      );

      const results = await Promise.all(
        raceNumbers.map((number) => fetchRace(track, number).catch(() => null)),
      );

      const availableRaces = results
        .filter(
          (race): race is Race =>
            race !== null && !race.isMonte && !race.isP21,
        )
        .sort((a, b) => a.raceNumber - b.raceNumber);

      setRaces(availableRaces);
      setOddsHistory((current) => {
        const next = { ...current };
        const timestamp = Date.now();

        for (const race of availableRaces) {
          for (const runner of race.runners) {
            if (runner.odds === null || runner.odds <= 0) continue;

            const key = runnerKey(race.id, runner.number);
            const history = next[key] ?? [];
            const last = history[history.length - 1];

            if (last?.odds !== runner.odds) {
              next[key] = [
                ...history,
                { odds: runner.odds, timestamp },
              ].slice(-MAX_HISTORY_POINTS);
            }
          }
        }

        return next;
      });
      setUpdated(new Date().toLocaleTimeString("sv-SE"));

      if (availableRaces.length) {
        setRaceNumber(String(availableRaces[0].raceNumber));
      } else {
        setError(
          `Inga godkända lopp hittades för ${track.name}. Monté och P21 är bortfiltrerade.`,
        );
      }
    } catch (err) {
      console.error(err);
      setError(`Kunde inte hämta loppen för ${track.name}.`);
    } finally {
      setLoadingRaces(false);
    }
  }

  async function refreshAllRaces() {
    if (!selectedTrack || !races.length || backgroundCollecting) return;

    setBackgroundCollecting(true);

    try {
      const refreshedResults = await Promise.all(
        races.map((race) =>
          fetchRace(selectedTrack, race.raceNumber).catch(() => null),
        ),
      );

      const refreshedRaces = refreshedResults.filter(
        (race): race is Race => race !== null,
      );

      const timestamp = Date.now();

      setOddsHistory((current) => {
        const next = { ...current };

        for (const race of refreshedRaces) {
          for (const runner of race.runners) {
            if (runner.odds === null || runner.odds <= 0) continue;

            const key = runnerKey(race.id, runner.number);
            const history = next[key] ?? [];
            const last = history[history.length - 1];

            if (last?.odds !== runner.odds) {
              next[key] = [
                ...history,
                { odds: runner.odds, timestamp },
              ].slice(-MAX_HISTORY_POINTS);
            }
          }
        }

        return next;
      });

      setRaces((current) =>
        current.map(
          (race) =>
            refreshedRaces.find(
              (refreshed) => refreshed.raceNumber === race.raceNumber,
            ) ?? race,
        ),
      );

      setAllRacesUpdated(new Date().toLocaleTimeString("sv-SE"));
      setUpdated(new Date().toLocaleTimeString("sv-SE"));
    } catch (error) {
      console.error("Bakgrundsinsamlingen misslyckades", error);
    } finally {
      setBackgroundCollecting(false);
    }
  }

  async function refreshSelectedRace() {
    if (!selectedTrack || !raceNumber) return;

    setLoadingOdds(true);

    try {
      const refreshed = await fetchRace(selectedTrack, Number(raceNumber));

      if (!refreshed) {
        throw new Error("Loppet kunde inte hämtas.");
      }

      setOddsHistory((current) => {
        const next = { ...current };

        for (const runner of refreshed.runners) {
          if (runner.odds === null || runner.odds <= 0) continue;

          const key = runnerKey(refreshed.id, runner.number);
          const history = next[key] ?? [];
          const last = history[history.length - 1];

          next[key] =
            last?.odds === runner.odds
              ? history
              : [...history, { odds: runner.odds, timestamp: Date.now() }].slice(-MAX_HISTORY_POINTS);
        }

        return next;
      });

      setRaces((current) =>
        current.map((race) =>
          race.raceNumber === refreshed.raceNumber ? refreshed : race,
        ),
      );
      setUpdated(new Date().toLocaleTimeString("sv-SE"));
      setSecondsToRefresh(REFRESH_SECONDS);
    } catch (err) {
      console.error(err);
      setError("Kunde inte uppdatera liveoddsen.");
    } finally {
      setLoadingOdds(false);
    }
  }

  useEffect(() => {
    void loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedTrack) return;
    void loadRaces(selectedTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  useEffect(() => {
    if (!selectedTrack || !raceNumber) return;

    setSecondsToRefresh(REFRESH_SECONDS);

    const countdown = window.setInterval(() => {
      setSecondsToRefresh((current) => {
        if (current <= 1) return REFRESH_SECONDS;
        return current - 1;
      });
    }, 1000);

    const refresh = window.setInterval(() => {
      void refreshSelectedRace();
    }, REFRESH_SECONDS * 1000);

    return () => {
      window.clearInterval(countdown);
      window.clearInterval(refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, raceNumber]);

  useEffect(() => {
    if (!selectedTrack || !races.length) return;

    void refreshAllRaces();

    const collector = window.setInterval(() => {
      void refreshAllRaces();
    }, ALL_RACES_REFRESH_SECONDS * 1000);

    return () => window.clearInterval(collector);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, races.length]);

  useEffect(() => {
    if (!selectedTrack || !races.length) {
      setAutoStatus("Helkvällsautomaten väntar på en bana.");
      return;
    }

    const now = Date.now();
    const savedRaceNumbers = new Set(savedBets.filter((bet) => bet.date === date && bet.trackId === selectedTrack.id).map((bet) => bet.raceNumber));
    const selectionsByRace = new Map(autoSelections.map((selection) => [selection.raceId, selection]));
    const newSelections: AutoSelection[] = [];

    for (const race of races) {
      if (!race.startTime || savedRaceNumbers.has(race.raceNumber) || selectionsByRace.has(race.id)) continue;
      const startMs = new Date(race.startTime).getTime();
      if (Number.isNaN(startMs)) continue;
      const secondsLeft = Math.floor((startMs - now) / 1000);
      if (secondsLeft > 60 || secondsLeft < -120) continue;
      const ranked = rankCandidates(buildTrendRunnersForRace(race, oddsHistory));
      if (ranked[0] && ranked[1]) {
        const selection: AutoSelection = {
          raceId: race.id,
          raceNumber: race.raceNumber,
          a1: ranked[0],
          a2: ranked[1],
          lockedAt: new Date().toLocaleTimeString("sv-SE"),
        };
        newSelections.push(selection);
        selectionsByRace.set(race.id, selection);
        if (race.raceNumber === selectedRace?.raceNumber) {
          setLockedSelection({ a1: ranked[0], a2: ranked[1], lockedAt: selection.lockedAt });
        }
      }
    }

    if (newSelections.length) {
      setAutoSelections((current) => [...current, ...newSelections]);
      setAutoStatus(`Låste automatiskt ${newSelections.map((selection) => `lopp ${selection.raceNumber}`).join(", ")}.`);
    }

    const betsToAdd: SavedBet[] = [];
    for (const race of races) {
      if (race.finishOrder.length < 2 || savedRaceNumbers.has(race.raceNumber)) continue;
      const selection = selectionsByRace.get(race.id);
      if (!selection) continue;
      const first = race.finishOrder[0];
      const second = race.finishOrder[1];
      const isA1A2 = first === selection.a1.number && second === selection.a2.number;
      const isA2A1 = first === selection.a2.number && second === selection.a1.number;
      const hit = isA1A2 || isA2A1;
      betsToAdd.push({
        id: `${date}-${selectedTrack.id}-${race.raceNumber}-auto`,
        date,
        trackId: selectedTrack.id,
        trackName: selectedTrack.name,
        raceNumber: race.raceNumber,
        a1Number: selection.a1.number,
        a1Name: selection.a1.name,
        a2Number: selection.a2.number,
        a2Name: selection.a2.name,
        firstNumber: first,
        secondNumber: second,
        comboOdds: null,
        hit,
        winningOrder: isA1A2 ? "A1-A2" : isA2A1 ? "A2-A1" : "MISS",
        stake: 100,
        returnAmount: 0,
        net: -100,
        lockedAt: selection.lockedAt,
        savedAt: new Date().toISOString(),
        automatic: true,
        needsComboOdds: hit,
      });
      savedRaceNumbers.add(race.raceNumber);
    }

    if (betsToAdd.length) {
      setSavedBets((current) => [...betsToAdd, ...current]);
      setAutoStatus(`Rättade automatiskt ${betsToAdd.map((bet) => `lopp ${bet.raceNumber}`).join(", ")}.`);
    }

    const upcoming = races
      .filter((race) => race.startTime && new Date(race.startTime).getTime() > now - 30_000 && !savedRaceNumbers.has(race.raceNumber))
      .sort((a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime())[0];
    if (upcoming && String(upcoming.raceNumber) !== raceNumber) {
      setRaceNumber(String(upcoming.raceNumber));
    }

    if (!newSelections.length && !betsToAdd.length) {
      const next = upcoming?.startTime ? formatTime(upcoming.startTime) : "–";
      setAutoStatus(`Helkvällsautomaten är aktiv. Nästa lopp ${upcoming?.raceNumber ?? "–"} kl. ${next}.`);
    }
  }, [nowMs, races, oddsHistory, selectedTrack, selectedRace?.raceNumber, savedBets, autoSelections, date, raceNumber]);

  function countdownStyle() {
    if (countdown.phase === "critical" || countdown.phase === "started") {
      return {
        background: "rgba(127,29,29,.32)",
        borderColor: "#ef4444",
        color: "#fecaca",
      };
    }

    if (countdown.phase === "urgent") {
      return {
        background: "rgba(194,65,12,.26)",
        borderColor: "#f97316",
        color: "#fed7aa",
      };
    }

    if (countdown.phase === "warning") {
      return {
        background: "rgba(161,98,7,.24)",
        borderColor: "#eab308",
        color: "#fef08a",
      };
    }

    return {
      background: "#111827",
      borderColor: "#334155",
      color: "#f8fafc",
    };
  }

  function favoriteBehavior(change: number | null) {
    if (change === null) return "Okänd";
    if (change <= -5) return "Stärks";
    if (change >= 5) return "Försvagas";
    return "Stabil";
  }

  return (
    <main style={s.page}>
      <section style={s.card}>
        <header style={s.header}>
          <div>
            <p style={s.kicker}>LIVEODDS FRÅN ATG</p>
            <h1 style={s.title}>🏇 KOMBEN Live</h1>
          </div>
          <span style={s.live}>LIVE</span>
        </header>

        <div style={s.filterBanner}>
          <strong>SVERIGE-FILTER AKTIVT</strong>
          <span>Lunch-V4 samt dagens V64, V65, V85 och V86. Monté och P21 tas bort.</span>
        </div>

        <div style={s.autoBanner}>
          <strong>🤖 HELKVÄLLSAUTOMATIK</strong>
          <span>{autoStatus}</span>
          <small>A1/A2 låses vid 1:00. Resultat rättas när ATG visar placeringarna. Vid träff fyller du i komboddset i journalen.</small>
        </div>

        <div style={s.controls}>
          <label style={s.label}>
            Datum
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              style={s.input}
            />
          </label>

          <button
            type="button"
            onClick={() => void loadTracks()}
            disabled={loadingTracks}
            style={{
              ...s.button,
              opacity: loadingTracks ? 0.6 : 1,
            }}
          >
            {loadingTracks ? "Hämtar banor…" : "Hämta banor"}
          </button>

          <label style={s.label}>
            Välj bana
            <select
              value={trackId}
              onChange={(event) => setTrackId(event.target.value)}
              disabled={loadingTracks || !tracks.length}
              style={s.input}
            >
              <option value="">
                {tracks.length
                  ? `Välj bland ${tracks.length} banor`
                  : "Inga banor laddade"}
              </option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name} · {track.products.join("/")}
                </option>
              ))}
            </select>
          </label>

          {selectedTrack && (
            <label style={s.label}>
              Välj lopp
              <select
                value={raceNumber}
                onChange={(event) => setRaceNumber(event.target.value)}
                disabled={loadingRaces || !races.length}
                style={s.input}
              >
                <option value="">
                  {loadingRaces
                    ? "Hämtar lopp…"
                    : races.length
                      ? `Välj bland ${races.length} lopp`
                      : "Inga lopp hittade"}
                </option>
                {races.map((race) => (
                  <option key={race.id} value={race.raceNumber}>
                    Lopp {race.raceNumber} · {formatTime(race.startTime)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && <div style={s.error}>{error}</div>}

        {selectedTrack && (
          <div style={s.collectionBanner}>
            <div>
              <span style={s.small}>BAKGRUNDSINSAMLING</span>
              <strong>
                {backgroundCollecting
                  ? "Hämtar godkända lopp…"
                  : "Endast svenska mållopp bevakas"}
              </strong>
            </div>
            <span style={s.collectionText}>
              Var {ALL_RACES_REFRESH_SECONDS}:e sekund · Senast{" "}
              {allRacesUpdated || "väntar"}
            </span>
          </div>
        )}

        {selectedTrack && (
          <div style={s.trackBar}>
            <div>
              <span style={s.small}>VALD BANA</span>
              <strong>
                {selectedTrack.name} · {selectedTrack.products.join("/")}
              </strong>
            </div>
            <div>
              <span style={s.small}>BAN-ID</span>
              <strong>{selectedTrack.id}</strong>
            </div>
            <div>
              <span style={s.small}>FÖRSTA START</span>
              <strong>{formatTime(selectedTrack.startTime)}</strong>
            </div>
          </div>
        )}

        {selectedRace ? (
          <section style={s.racePanel}>
            <div style={s.raceHeader}>
              <div>
                <p style={s.kicker}>VINNARODDS</p>
                <h2 style={s.raceTitle}>
                  {selectedTrack?.name} · Lopp {selectedRace.raceNumber}
                </h2>
                <p style={s.muted}>
                  Start {formatTime(selectedRace.startTime)}
                  {selectedRace.status ? ` · ${selectedRace.status}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void refreshSelectedRace()}
                disabled={loadingOdds}
                style={s.refreshButton}
              >
                {loadingOdds ? "Uppdaterar…" : "Uppdatera nu"}
              </button>
            </div>

            <div style={s.tableHeader}>
              <span>Nr</span>
              <span>Häst / kusk</span>
              <span style={s.alignRight}>Odds</span>
            </div>

            <div style={s.trendLegend}>
              <span><strong style={{ color: "#4ade80" }}>GRÖNT ↓</strong> = totaloddset har sjunkit, hästen stärks</span>
              <span><strong style={{ color: "#fb7185" }}>RÖTT ↑</strong> = totaloddset har stigit, hästen tappar</span>
              <span><strong style={{ color: "#f8fafc" }}>VITT →</strong> = i princip oförändrat</span>
            </div>

            <div style={s.runnerList}>
              {selectedRace.runners.length ? (
                trendRunners.map((runner) => (
                  <div
                    key={`${selectedRace.id}-${runner.number}`}
                    style={{
                      ...s.runnerRow,
                      opacity: runner.scratched ? 0.45 : 1,
                    }}
                  >
                    <span style={s.numberBox}>{runner.number}</span>
                    <div>
                      <strong style={s.runnerName}>{runner.name}</strong>
                      <span style={s.driver}>{runner.driver}</span>
                      <span style={s.radarLine}>
                        Senaste 5:{" "}
                        {runner.recentOdds.length
                          ? runner.recentOdds
                              .map((odds) => formatOdds(odds))
                              .join(" → ")
                          : "–"}
                      </span>
                      <span style={s.radarLine}>
                        Kort trend: {momentumDisplay(runner.momentum)} · {runner.samples} mätningar
                      </span>
                      <div style={s.checkpointRow}>
                        <span>
                          60m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                60,
                              ),
                            )}
                          </strong>
                        </span>
                        <span>
                          30m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                30,
                              ),
                            )}
                          </strong>
                        </span>
                        <span>
                          15m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                15,
                              ),
                            )}
                          </strong>
                        </span>
                        <span>
                          5m{" "}
                          <strong>
                            {formatOdds(
                              checkpointOdds(
                                oddsHistory[
                                  runnerKey(selectedRace.id, runner.number)
                                ] ?? [],
                                selectedRace.startTime,
                                5,
                              ),
                            )}
                          </strong>
                        </span>
                      </div>
                    </div>
                    <div style={s.oddsCell}>
                      <strong
                        style={{
                          ...s.odds,
                          color: totalTrendColor(runner.changePercent),
                        }}
                      >
                        {runner.scratched ? "STR" : formatOdds(runner.odds)}
                      </strong>
                      {!runner.scratched && (
                        <span
                          style={{
                            ...s.trendStatus,
                            color: totalTrendColor(runner.changePercent),
                          }}
                        >
                          {totalTrendLabel(runner.changePercent)} {totalTrendArrow(runner.changePercent)}
                        </span>
                      )}
                      {!runner.scratched && (
                        <span
                          style={{
                            ...s.change,
                            color: totalTrendColor(runner.changePercent),
                          }}
                        >
                          Totalt {formatPercent(runner.changePercent)}
                        </span>
                      )}
                      {!runner.scratched && (
                        <span style={s.latestMove}>
                          Senaste tick: {formatAbsoluteChange(runner.latestAbsoluteChange)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p style={s.muted}>
                  Loppet hittades, men hästlistan kunde inte läsas ännu.
                </p>
              )}
            </div>

            <div style={s.lockBar}>
              <button
                type="button"
                onClick={lockCurrentSelection}
                disabled={!candidates[0] || !candidates[1]}
                style={{
                  ...s.button,
                  marginBottom: 0,
                  opacity: !candidates[0] || !candidates[1] ? 0.5 : 1,
                }}
              >
                {lockedSelection
                  ? `Låst ${lockedSelection.lockedAt}`
                  : "Lås A1 och A2"}
              </button>
            </div>

            <div style={s.comboPanel}>
              <div style={s.comboCard}>
                <span style={s.small}>PRELIMINÄR A1</span>
                <strong style={s.comboName}>
                  {candidates[0]
                    ? `${candidates[0].number}. ${candidates[0].name}`
                    : "Minst 3 mätningar krävs"}
                </strong>
                <span style={s.comboTrend}>
                  {candidates[0]
                    ? formatPercent(candidates[0].changePercent)
                    : "Vänta på fler uppdateringar"}
                </span>
              </div>

              <div style={s.comboCard}>
                <span style={s.small}>PRELIMINÄR A2</span>
                <strong style={s.comboName}>
                  {candidates[1]
                    ? `${candidates[1].number}. ${candidates[1].name}`
                    : "Minst 3 mätningar krävs"}
                </strong>
                <span style={s.comboTrend}>
                  {candidates[1]
                    ? formatPercent(candidates[1].changePercent)
                    : "Vänta på fler uppdateringar"}
                </span>
              </div>
            </div>

            <p style={s.disclaimer}>
              A1/A2 är fortfarande en teknisk trendrankning. Den väger nu
              samman total oddssänkning, senaste rörelsen och kortsiktigt momentum.
              Appen visar inte “pengar in”, eftersom oddsrörelse inte avslöjar exakt
              spelbelopp. Den riktiga KOMBEN-modellen låses först efter test mot
              verkliga lopp.
            </p>

            <section style={s.racePicturePanel}>
              <div style={s.racePictureHeader}>
                <div>
                  <p style={s.kicker}>LOPPBILD JUST NU</p>
                  <h3 style={s.pictureTitle}>A1, A2 och favoriten</h3>
                </div>
                <div style={s.headerStatusGroup}>
                  <div
                    style={{
                      ...s.countdownBox,
                      ...countdownStyle(),
                    }}
                  >
                    <span style={s.countdownLabel}>START OM</span>
                    <strong style={s.countdownTime}>{countdown.label}</strong>
                  </div>

                  <span style={s.pictureStatus}>
                    {favoriteRunner
                      ? favoriteBehavior(favoriteRunner.changePercent)
                      : "Väntar"}
                  </span>
                </div>
              </div>

              <div style={s.pictureGrid}>
                <article style={s.pictureCard}>
                  <span style={s.small}>A1</span>
                  <strong style={s.pictureName}>
                    {candidates[0]
                      ? `${candidates[0].number}. ${candidates[0].name}`
                      : "För lite data"}
                  </strong>
                  <span style={s.pictureLine}>
                    Nu: <strong>{candidates[0] ? formatOdds(candidates[0].odds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Start: <strong>{candidates[0] ? formatOdds(candidates[0].firstOdds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Förändring:{" "}
                    <strong
                      style={{
                        color:
                          (candidates[0]?.changePercent ?? 0) < 0 ? "#4ade80" : "#fb7185",
                      }}
                    >
                      {candidates[0] ? formatPercent(candidates[0].changePercent) : "–"}
                    </strong>
                  </span>
                  <span style={s.pictureLine}>
                    Momentum: <strong>{candidates[0]?.momentum ?? "–"}</strong>
                  </span>
                </article>

                <article style={s.pictureCard}>
                  <span style={s.small}>A2</span>
                  <strong style={s.pictureName}>
                    {candidates[1]
                      ? `${candidates[1].number}. ${candidates[1].name}`
                      : "För lite data"}
                  </strong>
                  <span style={s.pictureLine}>
                    Nu: <strong>{candidates[1] ? formatOdds(candidates[1].odds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Start: <strong>{candidates[1] ? formatOdds(candidates[1].firstOdds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Förändring:{" "}
                    <strong
                      style={{
                        color:
                          (candidates[1]?.changePercent ?? 0) < 0 ? "#4ade80" : "#fb7185",
                      }}
                    >
                      {candidates[1] ? formatPercent(candidates[1].changePercent) : "–"}
                    </strong>
                  </span>
                  <span style={s.pictureLine}>
                    Momentum: <strong>{candidates[1]?.momentum ?? "–"}</strong>
                  </span>
                </article>

                <article style={s.favoriteCard}>
                  <span style={s.small}>ODDSFAVORIT</span>
                  <strong style={s.pictureName}>
                    {favoriteRunner
                      ? `${favoriteRunner.number}. ${favoriteRunner.name}`
                      : "För lite data"}
                  </strong>
                  <span style={s.pictureLine}>
                    Nu: <strong>{favoriteRunner ? formatOdds(favoriteRunner.odds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Start: <strong>{favoriteRunner ? formatOdds(favoriteRunner.firstOdds) : "–"}</strong>
                  </span>
                  <span style={s.pictureLine}>
                    Förändring:{" "}
                    <strong
                      style={{
                        color:
                          (favoriteRunner?.changePercent ?? 0) < 0 ? "#4ade80" : "#fb7185",
                      }}
                    >
                      {favoriteRunner ? formatPercent(favoriteRunner.changePercent) : "–"}
                    </strong>
                  </span>
                  <span style={s.pictureLine}>
                    Beteende:{" "}
                    <strong>
                      {favoriteRunner ? favoriteBehavior(favoriteRunner.changePercent) : "–"}
                    </strong>
                  </span>
                </article>
              </div>

              <div style={s.racePictureConclusion}>
                <span style={s.small}>TOLKNING</span>
                <strong>{racePictureText}</strong>
              </div>
            </section>

            <section style={s.resultPanel}>
              <p style={s.kicker}>RESULTAT & SPELJOURNAL</p>

              {lockedSelection ? (
                <>
                  <div style={s.lockedInfo}>
                    <strong>A1: {lockedSelection.a1.number}. {lockedSelection.a1.name}</strong>
                    <strong>A2: {lockedSelection.a2.number}. {lockedSelection.a2.name}</strong>
                    <span style={s.muted}>Låst {lockedSelection.lockedAt}</span>
                  </div>

                  <div style={s.resultGrid}>
                    <label style={s.label}>
                      1:a i mål
                      <select value={firstNumber} onChange={(e) => setFirstNumber(e.target.value)} style={s.input}>
                        <option value="">Välj vinnare</option>
                        {selectedRace.runners.filter((r) => !r.scratched).map((r) => (
                          <option key={`first-${r.number}`} value={r.number}>
                            {r.number}. {r.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={s.label}>
                      2:a i mål
                      <select value={secondNumber} onChange={(e) => setSecondNumber(e.target.value)} style={s.input}>
                        <option value="">Välj tvåa</option>
                        {selectedRace.runners.filter((r) => !r.scratched).map((r) => (
                          <option key={`second-${r.number}`} value={r.number}>
                            {r.number}. {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label style={s.label}>
                    Kombodds för rätt ordning
                    <input
                      value={comboOddsInput}
                      onChange={(e) => setComboOddsInput(e.target.value)}
                      inputMode="decimal"
                      placeholder="Exempel: 12,40"
                      style={s.input}
                    />
                  </label>

                  <button type="button" onClick={saveResult} style={s.button}>
                    Spara lopp
                  </button>

                  <p style={s.disclaimer}>
                    Insatsen räknas som 50 kr på A1–A2 och 50 kr på A2–A1,
                    totalt 100 kr. Kombodds behövs endast vid träff.
                  </p>
                </>
              ) : (
                <p style={s.muted}>
                  Lås A1 och A2 före start. Därefter kan resultat och kombodds sparas här.
                </p>
              )}
            </section>

            <div style={s.refreshInfo}>
              <span>Valt lopp uppdateras var {REFRESH_SECONDS}:e sekund</span>
              <strong>Nästa om {secondsToRefresh} s</strong>
            </div>
          </section>
        ) : (
          <div style={s.emptyPanel}>
            <p style={s.kicker}>STATUS</p>
            <h2 style={s.raceTitle}>
              {loadingRaces
                ? "Letar efter lopp…"
                : selectedTrack
                  ? "Välj ett lopp"
                  : "Välj en bana"}
            </h2>
            <p style={s.muted}>
              När loppet är valt visas hästar och liveodds här.
            </p>
          </div>
        )}

        <section style={s.journalPanel}>
          <div style={s.journalHeader}>
            <div>
              <p style={s.kicker}>TOTAL STATISTIK</p>
              <h2 style={s.raceTitle}>Speljournal</h2>
            </div>
            <strong>{savedBets.length} lopp</strong>
          </div>

          <div style={s.statsGrid}>
            <div style={s.statCard}><span style={s.small}>TRÄFFAR</span><strong>{journalTotals.hits}</strong></div>
            <div style={s.statCard}><span style={s.small}>INSATS</span><strong>{journalTotals.stake.toFixed(0)} kr</strong></div>
            <div style={s.statCard}><span style={s.small}>ÅTERBETALNING</span><strong>{journalTotals.returnAmount.toFixed(0)} kr</strong></div>
            <div style={s.statCard}><span style={s.small}>VÄNTAR ODDS</span><strong>{savedBets.filter((bet) => bet.needsComboOdds).length}</strong></div>
            <div style={s.statCard}>
              <span style={s.small}>NETTO</span>
              <strong style={{ color: journalTotals.net >= 0 ? "#4ade80" : "#fb7185" }}>
                {journalTotals.net >= 0 ? "+" : ""}{journalTotals.net.toFixed(0)} kr
              </strong>
            </div>
            <div style={s.statCard}>
              <span style={s.small}>ROI</span>
              <strong style={{ color: journalTotals.roi >= 0 ? "#4ade80" : "#fb7185" }}>
                {journalTotals.roi >= 0 ? "+" : ""}{journalTotals.roi.toFixed(1).replace(".", ",")} %
              </strong>
            </div>
          </div>

          <div style={s.historyList}>
            {savedBets.length ? savedBets.map((bet) => (
              <article key={bet.id} style={s.historyCard}>
                <div>
                  <strong>{bet.date} · {bet.trackName} · Lopp {bet.raceNumber}</strong>
                  <span style={s.historyLine}>A1 {bet.a1Number}. {bet.a1Name} · A2 {bet.a2Number}. {bet.a2Name}</span>
                  <span style={s.historyLine}>Resultat {bet.firstNumber}–{bet.secondNumber} · {bet.hit ? `Träff ${bet.winningOrder}` : "Miss"}</span>
                  <span style={s.historyLine}>
                    Kombodds {bet.comboOdds?.toFixed(2).replace(".", ",") ?? "–"} · Åter {bet.returnAmount.toFixed(0)} kr · Netto {bet.net >= 0 ? "+" : ""}{bet.net.toFixed(0)} kr
                  </span>
                  {bet.needsComboOdds && (
                    <div style={s.pendingOddsRow}>
                      <input
                        value={pendingOddsInputs[bet.id] ?? ""}
                        onChange={(event) => setPendingOddsInputs((current) => ({ ...current, [bet.id]: event.target.value }))}
                        placeholder="Ange kombodds"
                        inputMode="decimal"
                        style={s.pendingOddsInput}
                      />
                      <button type="button" onClick={() => finalizeComboOdds(bet.id)} style={s.pendingOddsButton}>Räkna klart</button>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => deleteSavedBet(bet.id)} style={s.deleteButton}>Ta bort</button>
              </article>
            )) : <p style={s.muted}>Inga lopp är sparade ännu.</p>}
          </div>
        </section>

        <footer style={s.footer}>
          <span>
            Banor: <strong>{tracks.length}</strong>
          </span>
          <span>
            Lopp: <strong>{races.length}</strong>
          </span>
          <span>
            Uppdaterad: <strong>{updated || "–"}</strong>
          </span>
          <span>
            Databas: <strong>{dbStatus.startsWith("✅") ? "ansluten" : dbStatus}</strong>
          </span>
        </footer>
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "24px 14px",
    background: "linear-gradient(180deg, #09111f, #111827)",
    color: "#f8fafc",
    fontFamily:
      "Inter, Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    maxWidth: 680,
    color: "#f8fafc",
    margin: "0 auto",
    padding: 22,
    border: "1px solid #293548",
    borderRadius: 22,
    background: "#111827",
    boxShadow: "0 24px 70px rgba(0,0,0,.35)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 22,
  },
  kicker: {
    margin: "0 0 6px",
    color: "#22c55e",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: ".12em",
  },
  title: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "clamp(30px, 8vw, 42px)",
  },
  live: {
    height: "fit-content",
    color: "#ffffff",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#ef4444",
    fontSize: 11,
    fontWeight: 900,
  },
  filterBanner: {
    display: "grid",
    gap: 4,
    marginBottom: 18,
    padding: "11px 13px",
    border: "1px solid #166534",
    borderRadius: 12,
    background: "rgba(22,101,52,.16)",
    color: "#f8fafc",
    fontSize: 12,
    lineHeight: 1.4,
  },
  autoBanner: {
    display: "grid",
    gap: 5,
    marginBottom: 18,
    padding: 14,
    border: "1px solid #3b82f6",
    borderRadius: 14,
    background: "rgba(30,64,175,.18)",
    color: "#f8fafc",
    textAlign: "center",
  },
  pendingOddsRow: {
    display: "flex",
    gap: 8,
    marginTop: 10,
  },
  pendingOddsInput: {
    minWidth: 0,
    flex: 1,
    height: 38,
    padding: "0 10px",
    border: "1px solid #475569",
    borderRadius: 9,
    background: "#0f172a",
    color: "#f8fafc",
  },
  pendingOddsButton: {
    height: 38,
    padding: "0 12px",
    border: 0,
    borderRadius: 9,
    background: "#22c55e",
    color: "#052e16",
    fontWeight: 900,
    cursor: "pointer",
  },
  controls: {
    display: "grid",
    gap: 2,
  },
  label: {
    display: "grid",
    gap: 8,
    marginBottom: 14,
    color: "#cbd5e1",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    colorScheme: "dark",
    minHeight: 48,
    boxSizing: "border-box",
    padding: "0 12px",
    border: "1px solid #334155",
    borderRadius: 12,
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: 16,
  },
  button: {
    width: "100%",
    minHeight: 48,
    marginBottom: 16,
    border: 0,
    borderRadius: 12,
    background: "#15803d",
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  },
  error: {
    marginBottom: 14,
    padding: 12,
    border: "1px solid #7f1d1d",
    borderRadius: 12,
    background: "rgba(127,29,29,.3)",
    color: "#fecaca",
  },
  collectionBanner: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    margin: "6px 0 12px",
    padding: 12,
    border: "1px solid #166534",
    borderRadius: 12,
    background: "rgba(22,101,52,.16)",
  },
  collectionText: {
    color: "#d1d5db",
    fontSize: 12,
    textAlign: "right",
  },
  trackBar: {
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr",
    gap: 12,
    margin: "6px 0 16px",
    padding: 14,
    border: "1px solid #263244",
    borderRadius: 14,
    background: "#0b1220",
  },
  small: {
    display: "block",
    marginBottom: 4,
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: ".09em",
  },
  racePanel: {
    color: "#f8fafc",
    border: "1px solid #263244",
    borderRadius: 16,
    overflow: "hidden",
    background: "#0b1220",
  },
  raceHeader: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    padding: 18,
  },
  raceTitle: {
    color: "#f8fafc",
    margin: "0 0 4px",
    fontSize: 25,
  },
  muted: {
    margin: 0,
    color: "#d1d5db",
    lineHeight: 1.5,
  },
  refreshButton: {
    minHeight: 40,
    padding: "0 12px",
    border: "1px solid #334155",
    borderRadius: 10,
    background: "#172033",
    color: "#f8fafc",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "48px 1fr 80px",
    gap: 12,
    padding: "10px 16px",
    borderTop: "1px solid #263244",
    borderBottom: "1px solid #263244",
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: ".08em",
    textTransform: "uppercase",
  },
  trendLegend: {
    display: "grid",
    gap: 4,
    padding: "10px 16px",
    borderBottom: "1px solid #263244",
    background: "#0f172a",
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1.35,
  },
  alignRight: {
    textAlign: "right",
  },
  runnerList: {
    display: "grid",
  },
  runnerRow: {
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "48px 1fr 80px",
    alignItems: "center",
    gap: 12,
    minHeight: 62,
    padding: "8px 16px",
    borderBottom: "1px solid #1e293b",
  },
  numberBox: {
    color: "#f8fafc",
    display: "grid",
    placeItems: "center",
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#1e293b",
    fontSize: 18,
    fontWeight: 900,
  },
  runnerName: {
    color: "#f8fafc",
    display: "block",
    fontSize: 16,
  },
  driver: {
    display: "block",
    marginTop: 3,
    color: "#d1d5db",
    fontSize: 13,
  },
  radarLine: {
    display: "block",
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1.35,
  },
  checkpointRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 12px",
    marginTop: 7,
    color: "#d1d5db",
    fontSize: 11,
  },
  odds: {
    textAlign: "right",
    color: "#f8fafc",
    fontSize: 20,
  },
  oddsCell: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
  },
  trendStatus: {
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: ".08em",
  },
  change: {
    fontSize: 11,
    fontWeight: 800,
  },
  latestMove: {
    color: "#d1d5db",
    fontSize: 10,
    fontWeight: 700,
  },
  comboPanel: {
    color: "#f8fafc",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    padding: 14,
    background: "#111827",
  },
  comboCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 4,
    padding: 13,
    border: "1px solid #334155",
    borderRadius: 12,
    background: "#0f172a",
  },
  comboName: {
    color: "#f8fafc",
    fontSize: 15,
  },
  comboTrend: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: 800,
  },
  disclaimer: {
    margin: 0,
    padding: "0 14px 14px",
    background: "#111827",
    color: "#d1d5db",
    fontSize: 11,
    lineHeight: 1.45,
  },
  refreshInfo: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 16px",
    color: "#d1d5db",
    fontSize: 12,
  },
  emptyPanel: {
    color: "#f8fafc",
    padding: 22,
    border: "1px solid #263244",
    borderRadius: 16,
    background: "#0b1220",
  },
  lockBar: {
    color: "#f8fafc",
    padding: "14px 14px 0",
    background: "#111827",
  },
  racePicturePanel: {
    color: "#f8fafc",
    padding: 16,
    borderTop: "1px solid #263244",
    background: "#0b1220",
  },
  racePictureHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  pictureTitle: {
    color: "#f8fafc",
    margin: 0,
    fontSize: 22,
  },
  headerStatusGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  countdownBox: {
    display: "grid",
    justifyItems: "center",
    minWidth: 112,
    padding: "8px 12px",
    border: "1px solid #334155",
    borderRadius: 14,
  },
  countdownLabel: {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: ".12em",
    opacity: 0.8,
  },
  countdownTime: {
    color: "#f8fafc",
    marginTop: 2,
    fontSize: 22,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  pictureStatus: {
    padding: "6px 10px",
    border: "1px solid #334155",
    borderRadius: 999,
    background: "#111827",
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 900,
  },
  pictureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
  },
  pictureCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 6,
    padding: 14,
    border: "1px solid #334155",
    borderRadius: 14,
    background: "#111827",
  },
  favoriteCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 6,
    padding: 14,
    border: "1px solid #a16207",
    borderRadius: 14,
    background: "rgba(161,98,7,.12)",
  },
  pictureName: {
    color: "#f8fafc",
    marginBottom: 3,
    fontSize: 16,
  },
  pictureLine: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 1.35,
  },
  racePictureConclusion: {
    color: "#f8fafc",
    display: "grid",
    gap: 6,
    marginTop: 12,
    padding: 14,
    border: "1px solid #334155",
    borderRadius: 14,
    background: "#0f172a",
    lineHeight: 1.45,
  },
  resultPanel: {
    color: "#f8fafc",
    padding: 16,
    borderTop: "1px solid #263244",
    background: "#0f172a",
  },
  lockedInfo: {
    color: "#f8fafc",
    display: "grid",
    gap: 5,
    marginBottom: 14,
    padding: 12,
    border: "1px solid #334155",
    borderRadius: 12,
    background: "#111827",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  journalPanel: {
    color: "#f8fafc",
    marginTop: 18,
    padding: 16,
    border: "1px solid #263244",
    borderRadius: 16,
    background: "#0b1220",
  },
  journalHeader: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    color: "#f8fafc",
    display: "grid",
    gap: 5,
    padding: 12,
    border: "1px solid #263244",
    borderRadius: 12,
    background: "#111827",
  },
  historyList: {
    display: "grid",
    gap: 10,
  },
  historyCard: {
    color: "#f8fafc",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    border: "1px solid #263244",
    borderRadius: 12,
    background: "#111827",
  },
  historyLine: {
    display: "block",
    marginTop: 4,
    color: "#d1d5db",
    fontSize: 12,
    lineHeight: 1.4,
  },
  deleteButton: {
    height: 36,
    padding: "0 10px",
    border: "1px solid #7f1d1d",
    borderRadius: 9,
    background: "rgba(127,29,29,.2)",
    color: "#fecaca",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 16,
    color: "#d1d5db",
    fontSize: 12,
  },
};