export type StrongStarProfile = {
  strengthTotal: number | null;
  krTopFour: boolean;
  spTopFour: boolean;
  oddsIndicatorTopFour: boolean;
};

/*
 * Forskningsregel V1:
 *
 * ★ = exakt 3/6
 *     + KR topp 4
 *     + ODD topp 4
 *     + SP INTE topp 4
 *
 * Regeln bygger på historisk analys och ska
 * följas framåtriktat innan den eventuellt
 * ändras igen.
 */
export function isStrongStarProfile(
  profile: StrongStarProfile,
): boolean {
  return (
    profile.strengthTotal === 3 &&
    profile.krTopFour &&
    profile.oddsIndicatorTopFour &&
    !profile.spTopFour
  );
}
