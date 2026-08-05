import type {
  ResearchGrouping,
  ResearchGroupSummary,
  ResearchHistoryRow,
  ResearchHistorySummary,
  SimulatedMarketSummary,
} from "./types";

export const RESEARCH_STAKE_SEK = 100;

function average(
  values: Array<number | null>,
): number | null {
  const valid =
    values.filter(
      (
        value,
      ): value is number =>
        value !== null &&
        Number.isFinite(value),
    );

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    valid.length
  );
}

function ratePercent(
  hits: number,
  total: number,
): number {
  if (total <= 0) {
    return 0;
  }

  return (
    hits /
    total
  ) * 100;
}

function roiPercent(
  stake: number,
  returnAmount: number,
): number | null {
  if (stake <= 0) {
    return null;
  }

  return (
    (
      returnAmount -
      stake
    ) /
    stake
  ) * 100;
}

function buildMarketSummary(
  args: {
    stake: number;
    returnAmount: number;
    payoutMissing: number;
  },
): SimulatedMarketSummary {
  const {
    stake,
    returnAmount,
    payoutMissing,
  } = args;

  return {
    stake,
    returnAmount,

    net:
      returnAmount -
      stake,

    roiPercent:
      payoutMissing > 0
        ? null
        : roiPercent(
            stake,
            returnAmount,
          ),

    payoutMissing,
  };
}

export function computeResearchHistorySummary(
  rows: ResearchHistoryRow[],
  stakeSek = RESEARCH_STAKE_SEK,
): ResearchHistorySummary {
  const raceCount =
    new Set(
      rows.map(
        (row) => row.raceKey,
      ),
    ).size;

  const activeBets =
    rows.filter(
      (row) =>
        !row.betVoid,
    );

  const voids =
    rows.length -
    activeBets.length;

  const wins =
    activeBets.filter(
      (row) =>
        row.winnerOfficial,
    ).length;

  const places =
    activeBets.filter(
      (row) =>
        row.placedOfficial === true,
    ).length;

  let winnerReturn = 0;
  let placeReturn = 0;

  let winnerPayoutMissing = 0;
  let placePayoutMissing = 0;

  for (const row of activeBets) {
    if (row.winnerOfficial) {
      if (
        row.officialWinOddsDecimal ===
        null
      ) {
        winnerPayoutMissing += 1;
      } else {
        winnerReturn +=
          stakeSek *
          row.officialWinOddsDecimal;
      }
    }

    if (row.placedOfficial === true) {
      if (
        row.officialPlaceOddsDecimal ===
        null
      ) {
        placePayoutMissing += 1;
      } else {
        placeReturn +=
          stakeSek *
          row.officialPlaceOddsDecimal;
      }
    }
  }

  const singleMarketStake =
    activeBets.length *
    stakeSek;

  const winnerMarket =
    buildMarketSummary({
      stake:
        singleMarketStake,

      returnAmount:
        winnerReturn,

      payoutMissing:
        winnerPayoutMissing,
    });

  const placeMarket =
    buildMarketSummary({
      stake:
        singleMarketStake,

      returnAmount:
        placeReturn,

      payoutMissing:
        placePayoutMissing,
    });

  const combinedMarket =
    buildMarketSummary({
      stake:
        singleMarketStake * 2,

      returnAmount:
        winnerReturn +
        placeReturn,

      payoutMissing:
        winnerPayoutMissing +
        placePayoutMissing,
    });

  return {
    races:
      raceCount,

    bets:
      activeBets.length,

    voids,

    wins,
    places,

    winRatePercent:
      ratePercent(
        wins,
        activeBets.length,
      ),

    placeRatePercent:
      ratePercent(
        places,
        activeBets.length,
      ),

    averageLockOdds:
      average(
        activeBets.map(
          (row) =>
            row.lockOdds,
        ),
      ),

    averageDropPercent:
      average(
        activeBets.map(
          (row) =>
            row.oddsDropToLockPercent,
        ),
      ),

    averageStrength:
      average(
        activeBets.map(
          (row) =>
            row.strengthTotal,
        ),
      ),

    winnerMarket,
    placeMarket,
    combinedMarket,
  };
}

function lockOddsGroup(
  value: number | null,
): {
  key: string;
  label: string;
} {
  if (value === null) {
    return {
      key: "UNKNOWN",
      label: "Okänt låsodds",
    };
  }

  if (value < 3) {
    return {
      key: "01_UNDER_3",
      label: "Under 3,00",
    };
  }

  if (value < 5) {
    return {
      key: "02_3_TO_5",
      label: "3,00–4,99",
    };
  }

  if (value < 10) {
    return {
      key: "03_5_TO_10",
      label: "5,00–9,99",
    };
  }

  if (value < 15) {
    return {
      key: "04_10_TO_15",
      label: "10,00–14,99",
    };
  }

  if (value < 25) {
    return {
      key: "05_15_TO_25",
      label: "15,00–24,99",
    };
  }

  return {
    key: "06_25_PLUS",
    label: "25,00 eller högre",
  };
}

function groupingKey(
  row: ResearchHistoryRow,
  grouping: ResearchGrouping,
): {
  key: string;
  label: string;
} {
  if (grouping === "DISTANCE") {
    const value =
      row.distanceMeters;

    return {
      key:
        value === null
          ? "UNKNOWN"
          : String(value),

      label:
        value === null
          ? "Okänd distans"
          : `${value} meter`,
    };
  }

  if (grouping === "TRACK") {
    return {
      key:
        row.trackName ||
        "UNKNOWN",

      label:
        row.trackName ||
        "Okänd bana",
    };
  }

  if (grouping === "DRIVER") {
    return {
      key:
        row.driverName ??
        "UNKNOWN",

      label:
        row.driverName ??
        "Okänd kusk",
    };
  }

  if (grouping === "START_LANE") {
    const value =
      row.startLane;

    return {
      key:
        value === null
          ? "UNKNOWN"
          : String(value).padStart(
              2,
              "0",
            ),

      label:
        value === null
          ? "Okänt spår"
          : `Spår ${value}`,
    };
  }

  if (grouping === "RACE_CLASS") {
    const value =
      row.raceClassCode ??
      row.raceCategory;

    return {
      key:
        value ??
        "UNKNOWN",

      label:
        value ??
        "Okänd loppklass",
    };
  }

  if (grouping === "LOCK_ODDS") {
    return lockOddsGroup(
      row.lockOdds,
    );
  }

  if (grouping === "STRENGTH") {
    const value =
      row.strengthTotal;

    return {
      key:
        value === null
          ? "UNKNOWN"
          : String(value),

      label:
        value === null
          ? "Okänd styrka"
          : `Styrka ${value}/6`,
    };
  }

  return {
    key:
      row.startMethod ??
      "UNKNOWN",

    label:
      row.startMethod === "AUTO"
        ? "Autostart"
        : row.startMethod === "VOLT"
          ? "Voltstart"
          : "Okänd startmetod",
  };
}

export function groupResearchHistoryRows(
  rows: ResearchHistoryRow[],
  grouping: ResearchGrouping,
): ResearchGroupSummary[] {
  const grouped =
    new Map<
      string,
      {
        label: string;
        rows: ResearchHistoryRow[];
      }
    >();

  for (const row of rows) {
    const group =
      groupingKey(
        row,
        grouping,
      );

    const existing =
      grouped.get(group.key) ?? {
        label:
          group.label,

        rows: [],
      };

    existing.rows.push(row);

    grouped.set(
      group.key,
      existing,
    );
  }

  return [
    ...grouped.entries(),
  ]
    .map(
      ([
        key,
        value,
      ]) => {
        const summary =
          computeResearchHistorySummary(
            value.rows,
          );

        return {
          key,
          label:
            value.label,

          races:
            summary.races,

          bets:
            summary.bets,

          wins:
            summary.wins,

          places:
            summary.places,

          winRatePercent:
            summary.winRatePercent,

          placeRatePercent:
            summary.placeRatePercent,

          averageDropPercent:
            summary.averageDropPercent,

          averageLockOdds:
            summary.averageLockOdds,

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
        a.label.localeCompare(
          b.label,
          "sv",
        ),
    );
}
