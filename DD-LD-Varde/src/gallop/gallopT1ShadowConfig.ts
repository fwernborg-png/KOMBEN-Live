export const GALLOP_T1_SHADOW_RULE_VERSION =
  "GALLOP_T1_SWEDEN_25_40_V1.0";

export const GALLOP_T1_SHADOW_STRATEGY_CODE =
  "GALLOP_T1_SWEDEN_25_40";

export const GALLOP_T1_SHADOW_START_DATE =
  "2026-08-20";

export const GALLOP_T1_LOCK_TARGET_SECONDS =
  60;

export const GALLOP_T1_PREVIEW_TARGET_SECONDS =
  120;

export const GALLOP_T1_MIN_DROP_PERCENT =
  25;

export const GALLOP_T1_MAX_DROP_PERCENT =
  40;

export const GALLOP_T1_STAKE_SEK =
  100;

export function isGallopT1ShadowRace(args: {
  date: string;
  countryCode: string;
  sport?: string | null;
}): boolean {
  return (
    args.date >=
      GALLOP_T1_SHADOW_START_DATE &&
    args.countryCode
      .trim()
      .toUpperCase() ===
      "SE" &&
    (
      args.sport ===
        undefined ||
      args.sport ===
        null ||
      args.sport
        .trim()
        .toUpperCase() ===
        "GALLOP"
    )
  );
}
