import type {
  SpeedAnalysisDocument,
  SpeedAnalysisInterest,
  SpeedAnalysisMarker,
  SpeedAnalysisProduct,
  SpeedAnalysisValidation,
  SpeedCellColor,
} from "./types";

export function normalizeSpeedText(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      "",
    );
}

export function normalizeTrackKey(
  value: string,
): string {
  return normalizeSpeedText(
    value,
  );
}

export function normalizeHorseName(
  value: string,
): string {
  return normalizeSpeedText(
    value,
  );
}

function titleCaseTrack(
  value: string,
): string {
  return value
    .replace(
      /[_-]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .split(" ")
    .map(
      (word) =>
        word
          ? (
              word[0].toLocaleUpperCase(
                "sv-SE",
              ) +
              word.slice(1)
            )
          : word,
    )
    .join(" ");
}

export function parseCompactDate(
  compactDate: string,
): string | null {
  if (
    !/^\d{6}$/.test(
      compactDate,
    )
  ) {
    return null;
  }

  const year =
    2000 +
    Number(
      compactDate.slice(
        0,
        2,
      ),
    );

  const month =
    Number(
      compactDate.slice(
        2,
        4,
      ),
    );

  const day =
    Number(
      compactDate.slice(
        4,
        6,
      ),
    );

  const testDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    testDate.getUTCFullYear() !==
      year ||
    testDate.getUTCMonth() !==
      month - 1 ||
    testDate.getUTCDate() !==
      day
  ) {
    return null;
  }

  return [
    String(year),
    String(month).padStart(
      2,
      "0",
    ),
    String(day).padStart(
      2,
      "0",
    ),
  ].join("-");
}

export function parseSpeedFilenameMetadata(
  filename: string,
): {
  product: SpeedAnalysisProduct | null;
  raceDate: string | null;
  trackName: string;
} {
  const v86 =
    filename.match(
      /V86[-_ ]?(\d{6})[-_ ]?(.+?)\.pdf$/i,
    );

  if (v86) {
    return {
      product: "V86",

      raceDate:
        parseCompactDate(
          v86[1],
        ),

      trackName:
        titleCaseTrack(
          v86[2],
        ),
    };
  }

  const v85 =
    filename.match(
      /(?:V85|Sp)[-_ ]?(\d{6})[-_ ]?(.+?)\.pdf$/i,
    );

  if (v85) {
    return {
      product: "V85",

      raceDate:
        parseCompactDate(
          v85[1],
        ),

      trackName:
        titleCaseTrack(
          v85[2],
        ),
    };
  }

  return {
    product: null,
    raceDate: null,
    trackName: "",
  };
}

export function parseRankText(
  value: string,
): number | null {
  const normalized =
    normalizeSpeedText(
      value,
    );

  if (
    normalized === "ett"
  ) {
    return 1;
  }

  if (
    normalized === "tva"
  ) {
    return 2;
  }

  if (
    normalized === "tre"
  ) {
    return 3;
  }

  const numeric =
    Number(
      value
        .replace(
          /[^0-9]/g,
          "",
        ),
    );

  return (
    Number.isInteger(
      numeric,
    ) &&
    numeric >= 1 &&
    numeric <= 20
  )
    ? numeric
    : null;
}

export function classifySpeedCellFromRgba(
  rgba:
    Uint8ClampedArray,
): SpeedCellColor {
  const counts = {
    GREEN: 0,
    YELLOW: 0,
    RED: 0,
  };

  let visiblePixels = 0;

  for (
    let index = 0;
    index <
      rgba.length;
    index += 4
  ) {
    const red =
      rgba[index];

    const green =
      rgba[index + 1];

    const blue =
      rgba[index + 2];

    const alpha =
      rgba[index + 3];

    if (
      alpha < 80
    ) {
      continue;
    }

    visiblePixels += 1;

    if (
      green >= 100 &&
      green >= red + 35 &&
      green >= blue + 30
    ) {
      counts.GREEN += 1;
      continue;
    }

    if (
      red >= 150 &&
      green >= 135 &&
      blue <= 130 &&
      Math.abs(
        red -
        green,
      ) <= 110
    ) {
      counts.YELLOW += 1;
      continue;
    }

    if (
      red >= 155 &&
      green <= 115 &&
      blue <= 115
    ) {
      counts.RED += 1;
    }
  }

  const entries =
    Object.entries(
      counts,
    ) as Array<
      [
        Exclude<
          SpeedCellColor,
          "NONE"
        >,
        number,
      ]
    >;

  entries.sort(
    (a, b) =>
      b[1] -
      a[1],
  );

  const [
    winningColor,
    winningCount,
  ] =
    entries[0];

  const minimumCount =
    Math.max(
      12,
      visiblePixels *
        0.055,
    );

  return winningCount >=
    minimumCount
    ? winningColor
    : "NONE";
}

export function probableLeaderBorderScoreFromRgba(
  rgba:
    Uint8ClampedArray,
): number {
  let visiblePixels = 0;
  let brightGreenPixels = 0;

  for (
    let index = 0;
    index <
      rgba.length;
    index += 4
  ) {
    const red =
      rgba[index];

    const green =
      rgba[index + 1];

    const blue =
      rgba[index + 2];

    const alpha =
      rgba[index + 3];

    if (
      alpha < 80
    ) {
      continue;
    }

    visiblePixels += 1;

    if (
      green >= 185 &&
      red <= 95 &&
      blue <= 165 &&
      green >= red + 90
    ) {
      brightGreenPixels += 1;
    }
  }

  return visiblePixels > 0
    ? (
        brightGreenPixels /
        visiblePixels
      )
    : 0;
}

export function hasProbableLeaderBorderFromRgba(
  rgba:
    Uint8ClampedArray,
): boolean {
  return (
    probableLeaderBorderScoreFromRgba(
      rgba,
    ) >= 0.006
  );
}

export function speedHorseNamesMatch(
  importedName: string,
  actualName: string,
): boolean {
  const imported =
    normalizeHorseName(
      importedName,
    );

  const actual =
    normalizeHorseName(
      actualName,
    );

  if (
    !imported ||
    !actual
  ) {
    return false;
  }

  if (
    imported === actual
  ) {
    return true;
  }

  if (
    Math.min(
      imported.length,
      actual.length,
    ) >= 6 &&
    (
      imported.includes(
        actual,
      ) ||
      actual.includes(
        imported,
      )
    )
  ) {
    return true;
  }

  const importedTokens =
    importedName
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .split(
        /[^a-z0-9]+/,
      )
      .filter(
        (token) =>
          token.length >= 2,
      );

  const actualTokens =
    actualName
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .split(
        /[^a-z0-9]+/,
      )
      .filter(
        (token) =>
          token.length >= 2,
      );

  if (
    !importedTokens.length ||
    !actualTokens.length
  ) {
    return false;
  }

  const actualSet =
    new Set(
      actualTokens,
    );

  const shared =
    importedTokens.filter(
      (token) =>
        actualSet.has(
          token,
        ),
    ).length;

  return (
    shared >= 2 &&
    shared /
      Math.min(
        importedTokens.length,
        actualTokens.length,
      ) >=
      0.66
  );
}

export function findSpeedAnalysisMarker(
  markers:
    SpeedAnalysisMarker[],
  args: {
    trackName: string;
    runnerNumber: number;
    horseName: string;
  },
): SpeedAnalysisMarker | null {
  const trackKey =
    normalizeTrackKey(
      args.trackName,
    );

  const matches =
    markers.filter(
      (marker) =>
        marker.trackKey ===
          trackKey &&
        marker.runnerNumber ===
          args.runnerNumber &&
        speedHorseNamesMatch(
          marker.horseName,
          args.horseName,
        ),
    );

  if (
    !matches.length
  ) {
    return null;
  }

  return [...matches].sort(
    (a, b) => {
      const aGreen =
        Number(
          a.botColor ===
            "GREEN",
        ) +
        Number(
          a.s1000Color ===
            "GREEN",
        ) +
        Number(
          a.s500Color ===
            "GREEN",
        );

      const bGreen =
        Number(
          b.botColor ===
            "GREEN",
        ) +
        Number(
          b.s1000Color ===
            "GREEN",
        ) +
        Number(
          b.s500Color ===
            "GREEN",
        );

      return (
        bGreen -
          aGreen ||
        Number(
          b.probableLeader,
        ) -
          Number(
            a.probableLeader,
          ) ||
        (
          a.rankPosition ??
          99
        ) -
          (
            b.rankPosition ??
            99
          )
      );
    },
  )[0];
}

export function getSpeedAnalysisInterest(
  marker:
    SpeedAnalysisMarker | null,
  hasOddsSignal: boolean,
): SpeedAnalysisInterest {
  if (!marker) {
    return null;
  }

  const doubleGreen =
    marker.s1000Color ===
      "GREEN" &&
    marker.s500Color ===
      "GREEN";

  const anySpeedGreen =
    marker.botColor ===
      "GREEN" ||
    marker.s1000Color ===
      "GREEN" ||
    marker.s500Color ===
      "GREEN";

  const hasLeaderSignal =
    marker.probableLeader ||
    marker.ownProbableLeader;

  if (
    doubleGreen &&
    hasOddsSignal
  ) {
    return "HOT";
  }

  if (
    doubleGreen ||
    (
      hasLeaderSignal &&
      anySpeedGreen
    )
  ) {
    return "EXTRA";
  }

  if (
    anySpeedGreen ||
    hasLeaderSignal ||
    (
      marker.rankPosition !==
        null &&
      marker.rankPosition <= 3
    )
  ) {
    return "INFO";
  }

  return null;
}

export function isInterestingSpeedMarker(
  marker:
    Pick<
      SpeedAnalysisMarker,
      | "botColor"
      | "s1000Color"
      | "s500Color"
      | "probableLeader"
      | "ownProbableLeader"
      | "rankPosition"
    >,
): boolean {
  return (
    marker.botColor ===
      "GREEN" ||
    marker.s1000Color ===
      "GREEN" ||
    marker.s500Color ===
      "GREEN" ||
    marker.probableLeader ||
    marker.ownProbableLeader ||
    (
      marker.rankPosition !==
        null &&
      marker.rankPosition <= 3
    )
  );
}

export function validateSpeedAnalysisDocument(
  document:
    SpeedAnalysisDocument,
): SpeedAnalysisValidation {
  const errors: string[] = [];
  const warnings: string[] = [
    ...document.parserWarnings,
  ];

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      document.raceDate,
    )
  ) {
    errors.push(
      "Datumet saknas eller är ogiltigt.",
    );
  }

  if (
    !document.trackName.trim()
  ) {
    errors.push(
      "Banan saknas.",
    );
  }

  const legs =
    new Set(
      document.runners.map(
        (runner) =>
          runner.legNumber,
      ),
    );

  const expectedLegs =
    new Set(
      Array.from(
        {
          length: 8,
        },
        (
          _value,
          index,
        ) =>
          index + 1,
      ),
    );

  for (
    const leg of
    expectedLegs
  ) {
    if (
      !legs.has(
        leg,
      )
    ) {
      errors.push(
        `${document.product}-${leg} saknas.`,
      );
    }
  }

  const unexpectedLegs =
    [...legs].filter(
      (leg) =>
        !expectedLegs.has(
          leg,
        ),
    );

  if (
    unexpectedLegs.length
  ) {
    errors.push(
      `Oväntade avdelningar: ${unexpectedLegs.join(", ")}.`,
    );
  }

  if (
    document.runners.length <
      40
  ) {
    errors.push(
      `Bara ${document.runners.length} hästar hittades. Importen stoppas under 40 hästar.`,
    );
  }

  const duplicateKeys =
    new Set<string>();

  const seenKeys =
    new Set<string>();

  for (
    const runner of
    document.runners
  ) {
    const key =
      `${runner.legNumber}:${runner.runnerNumber}`;

    if (
      seenKeys.has(
        key,
      )
    ) {
      duplicateKeys.add(
        key,
      );
    }

    seenKeys.add(
      key,
    );

    if (
      !runner.horseName.trim()
    ) {
      errors.push(
        `${document.product}-${runner.legNumber}, nummer ${runner.runnerNumber}: hästnamn saknas.`,
      );
    }
  }

  if (
    duplicateKeys.size
  ) {
    errors.push(
      `Dubbla startnummer hittades: ${[...duplicateKeys].join(", ")}.`,
    );
  }

  for (
    let legNumber = 1;
    legNumber <= 8;
    legNumber += 1
  ) {
    const runnerCount =
      document.runners.filter(
        (runner) =>
          runner.legNumber ===
          legNumber,
      ).length;

    if (
      runnerCount > 0 &&
      runnerCount < 5
    ) {
      warnings.push(
        `${document.product}-${legNumber} innehåller bara ${runnerCount} hästar.`,
      );
    }

    if (
      runnerCount > 0
    ) {
      const probableLeaderCount =
        document.runners.filter(
          (runner) =>
            runner.legNumber ===
              legNumber &&
            runner.probableLeader,
        ).length;

      if (
        probableLeaderCount !==
        1
      ) {
        errors.push(
          `${document.product}-${legNumber} måste ha exakt en PDF-spetshäst, men ${probableLeaderCount} hittades.`,
        );
      }

      const ownProbableLeaderCount =
        document.runners.filter(
          (runner) =>
            runner.legNumber ===
              legNumber &&
            runner.ownProbableLeader,
        ).length;

      if (
        ownProbableLeaderCount >
        1
      ) {
        errors.push(
          `${document.product}-${legNumber} får ha högst en egen spetshäst, men ${ownProbableLeaderCount} hittades.`,
        );
      }
    }
  }

  return {
    errors:
      [...new Set(errors)],

    warnings:
      [...new Set(warnings)],
  };
}
