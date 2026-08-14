export function normalizeCalendarSport(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

export function shouldIncludeStrategyTrack(
  countryCode: string | null,
): boolean {
  /*
   * Bevarar exakt nuvarande strategi-scope:
   * endast svenska banor.
   */
  return countryCode === "SE";
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
   * - all galopp oavsett land
   * - all trav oavsett land
   *
   * Spelstrategierna påverkas inte.
   * De fortsätter vara Sverige-only via
   * shouldIncludeStrategyTrack().
   */
  const normalizedSport =
    normalizeCalendarSport(
      sport,
    );

  return (
    countryCode === "SE" ||
    normalizedSport === "gallop" ||
    normalizedSport === "trot"
  );
}
