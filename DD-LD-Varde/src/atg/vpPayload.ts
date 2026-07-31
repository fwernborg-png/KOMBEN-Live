type UnknownRecord =
  Record<string, unknown>;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as UnknownRecord
    : null;
}

function asArray(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function asFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed = Number(
      value.replace(",", "."),
    );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function raceNumber(
  value: unknown,
  fallback: number,
): number {
  const record = asRecord(value);

  return (
    asFiniteNumber(record?.number) ??
    asFiniteNumber(record?.raceNumber) ??
    fallback
  );
}

function runnerNumber(
  value: unknown,
  fallback: number,
): number {
  const record = asRecord(value);
  const horse = asRecord(record?.horse);

  return (
    asFiniteNumber(record?.number) ??
    asFiniteNumber(record?.startNumber) ??
    asFiniteNumber(horse?.number) ??
    fallback
  );
}

function runnerArrayKey(
  race: UnknownRecord,
): "starts" | "horses" | null {
  if (Array.isArray(race.starts)) {
    return "starts";
  }

  if (Array.isArray(race.horses)) {
    return "horses";
  }

  return null;
}

function resolvePlaceOddsRaw(
  runner: UnknownRecord,
): number | null {
  const pools = asRecord(
    runner.pools,
  );

  const placePool = (
    asRecord(pools?.plats) ??
    asRecord(pools?.place)
  );

  const value = (
    asFiniteNumber(placePool?.odds) ??
    asFiniteNumber(runner.placeOdds)
  );

  if (
    value === null ||
    value <= 0 ||
    Math.round(value) === 9_999
  ) {
    return null;
  }

  return value;
}

function vpPlaceOddsForRace(
  race: UnknownRecord,
): Map<number, number> {
  const key = runnerArrayKey(race);
  const result = new Map<number, number>();

  if (!key) {
    return result;
  }

  const runners = asArray(race[key]);

  runners.forEach(
    (runnerValue, index) => {
      const runner = asRecord(
        runnerValue,
      );

      if (!runner) {
        return;
      }

      const odds = resolvePlaceOddsRaw(
        runner,
      );

      if (odds === null) {
        return;
      }

      result.set(
        runnerNumber(
          runner,
          index + 1,
        ),
        odds,
      );
    },
  );

  return result;
}

export function extractVpPlaceOddsRawByRunner(
  payload: unknown,
): Map<number, number> {
  const root = asRecord(payload);

  if (!root) {
    return new Map();
  }

  const result =
    new Map<number, number>();

  for (
    const raceValue of
    asArray(root.races)
  ) {
    const race = asRecord(
      raceValue,
    );

    if (!race) {
      continue;
    }

    for (
      const [
        number,
        odds,
      ] of vpPlaceOddsForRace(race)
    ) {
      result.set(number, odds);
    }
  }

  return result;
}

export function mergeVpPayloadIntoWinnerPayload(
  winnerPayload: unknown,
  vpPayload: unknown,
): unknown {
  const winnerRoot = asRecord(
    winnerPayload,
  );

  const vpRoot = asRecord(
    vpPayload,
  );

  if (!winnerRoot || !vpRoot) {
    return winnerPayload;
  }

  const winnerRaces =
    asArray(winnerRoot.races);

  const vpRaces =
    asArray(vpRoot.races);

  if (
    winnerRaces.length === 0 ||
    vpRaces.length === 0
  ) {
    return winnerPayload;
  }

  const vpRaceByNumber =
    new Map<number, UnknownRecord>();

  vpRaces.forEach(
    (raceValue, index) => {
      const race = asRecord(
        raceValue,
      );

      if (!race) {
        return;
      }

      vpRaceByNumber.set(
        raceNumber(
          race,
          index + 1,
        ),
        race,
      );
    },
  );

  const mergedRaces =
    winnerRaces.map(
      (winnerRaceValue, raceIndex) => {
        const winnerRace = asRecord(
          winnerRaceValue,
        );

        if (!winnerRace) {
          return winnerRaceValue;
        }

        const vpRace = (
          vpRaceByNumber.get(
            raceNumber(
              winnerRace,
              raceIndex + 1,
            ),
          ) ??
          asRecord(vpRaces[raceIndex]) ??
          asRecord(vpRaces[0])
        );

        if (!vpRace) {
          return winnerRaceValue;
        }

        const winnerRunnerKey =
          runnerArrayKey(winnerRace);

        if (!winnerRunnerKey) {
          return winnerRaceValue;
        }

        const placeOddsByRunner =
          vpPlaceOddsForRace(vpRace);

        if (
          placeOddsByRunner.size === 0
        ) {
          return winnerRaceValue;
        }

        let changed = false;

        const mergedRunners =
          asArray(
            winnerRace[
              winnerRunnerKey
            ],
          ).map(
            (
              winnerRunnerValue,
              runnerIndex,
            ) => {
              const winnerRunner =
                asRecord(
                  winnerRunnerValue,
                );

              if (!winnerRunner) {
                return winnerRunnerValue;
              }

              const number =
                runnerNumber(
                  winnerRunner,
                  runnerIndex + 1,
                );

              const placeOddsRaw =
                placeOddsByRunner.get(
                  number,
                );

              if (
                placeOddsRaw ===
                undefined
              ) {
                return winnerRunnerValue;
              }

              const pools =
                asRecord(
                  winnerRunner.pools,
                ) ?? {};

              const existingPlacePool =
                (
                  asRecord(pools.plats) ??
                  asRecord(pools.place) ??
                  {}
                );

              changed = true;

              return {
                ...winnerRunner,

                placeOdds:
                  placeOddsRaw,

                pools: {
                  ...pools,

                  plats: {
                    ...existingPlacePool,

                    odds:
                      placeOddsRaw,
                  },
                },
              };
            },
          );

        return changed
          ? {
              ...winnerRace,

              [winnerRunnerKey]:
                mergedRunners,
            }
          : winnerRaceValue;
      },
    );

  return {
    ...winnerRoot,

    races:
      mergedRaces,
  };
}
