import type {
  ResearchArchiveOddsRow,
  ResearchArchiveRaceInput,
  ResearchArchiveRunnerStats,
} from "./researchArchive";
import type {
  ParsedResearchProduct,
  ParsedResearchSport,
  ParsedResearchStartMethod,
} from "./researchRaceParser";

export type WorkerResearchRunner = {
  number: number;
  horseId: number | null;
  name: string;

  oddsRaw: number | null;
  placeOddsRaw: number | null;
  scratched: boolean;

  stats: ResearchArchiveRunnerStats;

  horseAge: number | null;
  horseSex: string | null;

  startLane: number | null;
  startDistanceMeters: number | null;

  handicapRating?: number | null;
  carriedWeightKg?: number | null;

  riderId?: number | null;
  riderName?: string | null;

  driverId: number | null;
  driverName: string | null;

  trainerId: number | null;
  trainerName: string | null;

  rawRunnerJson: Record<string, unknown>;
};

export type WorkerResearchRace = {
  raceNumber: number;
  id: string;

  startTime?: string;
  status?: string;

  runners: WorkerResearchRunner[];
  isMonte: boolean;

  eventId: string | null;
  meetingId: string | null;
  meetingName: string | null;

  raceName: string | null;

  sport?: ParsedResearchSport;
  surface?: string | null;
  going?: string | null;
  isHandicapRace?: boolean | null;

  startMethod: ParsedResearchStartMethod;
  distanceMeters: number | null;

  raceClassCode: string | null;
  raceCategory: string | null;

  earningsMin: number | null;
  earningsMax: number | null;

  ageMin: number | null;
  ageMax: number | null;

  firstAdditionalDistanceMeters: number | null;

  prizeMoneyTotal: number | null;
  firstPrize: number | null;

  products: ParsedResearchProduct[];

  rawRaceJson: Record<string, unknown>;
  rawMeetingJson: Record<string, unknown>;
};

export type WorkerResearchTrack = {
  id: number;
  name: string;
  countryCode: string;
};

export type WorkerResearchDbOddsRow = {
  race_id: string;

  runner_number: number;

  horse_id: number | null;
  horse_name: string;

  market: "WIN" | "PLACE";

  odds_decimal: number | string;
  point_ts: string;
  source: string;
};

function rawOddsToDecimal(
  value: number | null,
): number | null {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.round(value) === 9_999
  ) {
    return null;
  }

  return value / 100;
}

export function isResearchArchiveEnabled(
  value: string | undefined,
): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(
    value.trim().toLowerCase(),
  );
}

function mergeResearchProductPair(
  primary: ParsedResearchProduct,
  fallback: ParsedResearchProduct,
): ParsedResearchProduct {
  return {
    productCode:
      primary.productCode,
    productId:
      primary.productId ??
      fallback.productId,
    legNumber:
      primary.legNumber ??
      fallback.legNumber,
    totalLegs:
      primary.totalLegs ??
      fallback.totalLegs,
    rawProductJson: {
      ...fallback.rawProductJson,
      ...primary.rawProductJson,
    },
  };
}

export function mergeResearchProducts(
  ...groups: ParsedResearchProduct[][]
): ParsedResearchProduct[] {
  const exact =
    new Map<
      string,
      ParsedResearchProduct
    >();

  const order: string[] = [];

  for (const product of groups.flat()) {
    const key =
      product.productId
        ? [
            product.productCode,
            "ID",
            product.productId,
          ].join(":")
        : [
            product.productCode,
            "ANON",
            product.legNumber ?? "",
            product.totalLegs ?? "",
          ].join(":");

    const existing =
      exact.get(key);

    if (!existing) {
      exact.set(
        key,
        product,
      );
      order.push(key);
      continue;
    }

    exact.set(
      key,
      mergeResearchProductPair(
        product,
        existing,
      ),
    );
  }

  const values =
    order
      .map((key) => exact.get(key))
      .filter(
        (
          product,
        ): product is ParsedResearchProduct =>
          Boolean(product),
      );

  const codeOrder = [
    ...new Set(
      values.map(
        (product) =>
          product.productCode,
      ),
    ),
  ];

  const merged:
    ParsedResearchProduct[] = [];

  for (const code of codeOrder) {
    const sameCode =
      values.filter(
        (product) =>
          product.productCode ===
          code,
      );

    const specific =
      sameCode.filter(
        (product) =>
          product.productId !== null,
      );

    const anonymous =
      sameCode.filter(
        (product) =>
          product.productId === null,
      );

    if (
      specific.length === 1 &&
      anonymous.length > 0
    ) {
      let enriched =
        specific[0];

      for (
        const fallback
        of anonymous
      ) {
        enriched =
          mergeResearchProductPair(
            enriched,
            fallback,
          );
      }

      merged.push(enriched);
      continue;
    }

    merged.push(...sameCode);
  }

  return merged;
}

function currencyCodeForCountry(
  countryCode: string,
): string {
  const byCountry: Record<string, string> = {
    SE: "SEK",
    NO: "NOK",
    DK: "DKK",
    FR: "EUR",
    IE: "EUR",
    DE: "EUR",
    GB: "GBP",
    ZA: "ZAR",
    AU: "AUD",
    NZ: "NZD",
    US: "USD",
    CA: "CAD",
    HK: "HKD",
    AE: "AED",
  };

  return byCountry[countryCode] ?? "XXX";
}

export function buildResearchArchiveRaceInput(args: {
  raceDate: string;
  track: WorkerResearchTrack;
  race: WorkerResearchRace;
}): ResearchArchiveRaceInput {
  const { raceDate, track, race } = args;

  const countryCode =
    track.countryCode
      .trim()
      .toUpperCase();

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error(
      `Ogiltig landskod för ${track.name}: ${track.countryCode}`,
    );
  }

  if (!race.startTime) {
    throw new Error(
      `Planerad starttid saknas för lopp ${race.id}`,
    );
  }

  return {
    sourceRaceId: race.id,
    raceDate,

    eventId: race.eventId,
    meetingId: race.meetingId,
    meetingName: race.meetingName,

    countryCode,

    currencyCode:
      currencyCodeForCountry(
        countryCode,
      ),

    trackId: track.id,
    trackName: track.name,
    raceNumber: race.raceNumber,

    raceName: race.raceName,

    plannedStartTime: race.startTime,
    actualStartTime: null,

    raceStatus: race.status ?? null,

    sport:
      race.sport ??
      (
        race.isMonte
          ? "MONTE"
          : "TROT"
      ),

    surface:
      race.surface ?? null,

    going:
      race.going ?? null,

    isHandicapRace:
      race.isHandicapRace ?? null,

    startMethod: race.startMethod,
    distanceMeters: race.distanceMeters,
    isMonte: race.isMonte,

    scheduledStarters: race.runners.length,

    raceClassCode: race.raceClassCode,
    raceCategory: race.raceCategory,

    earningsMin: race.earningsMin,
    earningsMax: race.earningsMax,

    ageMin: race.ageMin,
    ageMax: race.ageMax,

    firstAdditionalDistanceMeters:
      race.firstAdditionalDistanceMeters,

    prizeMoneyTotal: race.prizeMoneyTotal,
    firstPrize: race.firstPrize,

    products: race.products,

    runners: race.runners.map((runner) => ({
      number: runner.number,

      horseId: runner.horseId,
      name: runner.name,

      horseAge: runner.horseAge,
      horseSex: runner.horseSex,

      startLane: runner.startLane,
      startDistanceMeters:
        runner.startDistanceMeters,

      handicapRating:
        runner.handicapRating ?? null,

      carriedWeightKg:
        runner.carriedWeightKg ?? null,

      riderId:
        runner.riderId ?? null,

      riderName:
        runner.riderName ?? null,

      driverId: runner.driverId,
      driverName: runner.driverName,

      trainerId: runner.trainerId,
      trainerName: runner.trainerName,

      scratched: runner.scratched,

      currentWinOddsDecimal:
        rawOddsToDecimal(runner.oddsRaw),

      currentPlaceOddsDecimal:
        rawOddsToDecimal(
          runner.placeOddsRaw,
        ),

      stats: {
        ...runner.stats,
      },

      rawRunnerJson:
        runner.rawRunnerJson,
    })),

    rawRaceJson: {
      race: race.rawRaceJson,
      meeting: race.rawMeetingJson,
    },
  };
}

export function mapResearchArchiveOddsRows(args: {
  rows: WorkerResearchDbOddsRow[];
  race: WorkerResearchRace;
  actualLockTimeMs: number;
}): ResearchArchiveOddsRow[] {
  const runnerByNumber = new Map(
    args.race.runners.map((runner) => [
      runner.number,
      runner,
    ]),
  );

  return args.rows
    .map((row): ResearchArchiveOddsRow | null => {
      const pointTimestampMs = Date.parse(
        row.point_ts,
      );

      const oddsDecimal = Number(
        row.odds_decimal,
      );

      if (
        !Number.isFinite(pointTimestampMs) ||
        pointTimestampMs >
          args.actualLockTimeMs ||
        !Number.isFinite(oddsDecimal)
      ) {
        return null;
      }

      const runner = runnerByNumber.get(
        row.runner_number,
      );

      return {
        runnerNumber: row.runner_number,

        horseId:
          row.horse_id ??
          runner?.horseId ??
          null,

        horseName:
          row.horse_name ||
          runner?.name ||
          `Häst ${row.runner_number}`,

        market: row.market,
        oddsDecimal,
        pointTimestampMs,

        scratched:
          runner?.scratched ?? false,

        source: row.source || "ATG",
      };
    })
    .filter(
      (
        row,
      ): row is ResearchArchiveOddsRow =>
        row !== null,
    )
    .sort(
      (a, b) =>
        a.runnerNumber - b.runnerNumber ||
        a.pointTimestampMs -
          b.pointTimestampMs ||
        a.market.localeCompare(b.market),
    );
}
