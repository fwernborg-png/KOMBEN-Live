import {
  fetchHorseGallopPercent,
} from "../../src/gallop";

type GallopFetchArguments =
  Parameters<
    typeof fetchHorseGallopPercent
  >[0];

export type GallopRetryArguments =
  GallopFetchArguments & {
    attempts?: number;
    retryDelayMs?: number;
  };

function delay(
  milliseconds: number,
) {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

/**
 * Ett nullresultat kan vara ett legitimt
 * databortfall, men kan också bero på ett
 * tillfälligt ATG-fel.
 *
 * Vi gör därför högst två försök. Det håller
 * Worker-tiden under kontroll och förbättrar
 * chansen att G finns vid LOCK.
 */
export async function fetchHorseGallopPercentWithRetry(
  args: GallopRetryArguments,
): Promise<number | null> {
  const {
    attempts = 2,
    retryDelayMs = 300,
    ...fetchArguments
  } = args;

  const safeAttempts =
    Math.max(
      1,
      Math.min(
        3,
        Math.floor(attempts),
      ),
    );

  for (
    let attempt = 1;
    attempt <= safeAttempts;
    attempt += 1
  ) {
    const value =
      await fetchHorseGallopPercent(
        fetchArguments,
      );

    if (value !== null) {
      return value;
    }

    if (attempt < safeAttempts) {
      await delay(
        retryDelayMs,
      );
    }
  }

  return null;
}
