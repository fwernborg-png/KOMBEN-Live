export function isExcludedAtgNonRacingTrackName(
  value: unknown,
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  /*
   * ATG Riders League är hästhoppning men
   * ATG-kalendern kan felaktigt märka posten
   * som sport = "trot".
   */
  return normalized.includes(
    "atg riders league",
  );
}
