export type StrongStarProfile = {
  strengthTotal: number | null;
  krTopFour: boolean;
  spTopFour: boolean;
  oddsIndicatorTopFour: boolean;
};

export const STRONG_STAR_RULE_V1 = {
  strengthTotal: 3,
  krTopFour: true,
  spTopFour: false,
  oddsIndicatorTopFour: true,
} as const;

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
    profile.strengthTotal ===
      STRONG_STAR_RULE_V1.strengthTotal &&
    profile.krTopFour ===
      STRONG_STAR_RULE_V1.krTopFour &&
    profile.oddsIndicatorTopFour ===
      STRONG_STAR_RULE_V1.oddsIndicatorTopFour &&
    profile.spTopFour ===
      STRONG_STAR_RULE_V1.spTopFour
  );
}
