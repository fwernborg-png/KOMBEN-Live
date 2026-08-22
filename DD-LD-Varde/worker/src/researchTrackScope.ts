export function normalizeCalendarSport(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

export const ALLOWED_GALLOP_COUNTRY_CODES =
  new Set([
    "SE",
    "DK",
    "NO",
    "ZA",
  ]);

export function isAllowedGallopCountry(
  countryCode: string | null,
): boolean {
  if (!countryCode) {
    return false;
  }

  return (
    ALLOWED_GALLOP_COUNTRY_CODES
      .has(
        countryCode
          .trim()
          .toUpperCase(),
      )
  );
}

export function shouldIncludeStrategyTrack(
  countryCode: string | null,
): boolean {
  if (!countryCode) {
    return false;
  }

  /*
   * Livepipen behöver fortsatt alla svenska
   * racingbanor eftersom dedikerade
   * galoppmodeller som T90 använder den.
   */
  return (
    countryCode
      .trim()
      .toUpperCase() === "SE"
  );
}

export function shouldEvaluateTravStrategy(
  sport: unknown,
): boolean {
  /*
   * Travfestens strategier får endast
   * utvärdera travlopp.
   *
   * Galopp kan fortfarande finnas i livepipen
   * för dedikerade galoppmodeller.
   */
  return (
    normalizeCalendarSport(
      sport,
    ) === "trot"
  );
}

export function shouldIncludeResearchTrack(
  args: {
    countryCode: string | null;
    sport: unknown;
  },
): boolean {
  const {
    countryCode,
    sport,
  } = args;

  if (!countryCode) {
    return false;
  }

  /*
   * Research:
   * - all svensk racing som tidigare
   * - galopp endast från SE, DK, NO och ZA
   * - all trav oavsett land som tidigare
   *
   * Spelstrategierna påverkas inte.
   * De fortsätter vara Sverige-only via
   * shouldIncludeStrategyTrack().
   */
  const normalizedSport =
    normalizeCalendarSport(
      sport,
    );

  const normalizedCountryCode =
    countryCode
      .trim()
      .toUpperCase();

  if (
    normalizedCountryCode ===
    "SE"
  ) {
    return true;
  }

  if (
    normalizedSport ===
    "gallop"
  ) {
    return (
      isAllowedGallopCountry(
        normalizedCountryCode,
      )
    );
  }

  return (
    normalizedSport ===
    "trot"
  );
}
