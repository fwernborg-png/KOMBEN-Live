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

export const GALLOP_T1_CAPTURE_TOLERANCE_SECONDS =
  35;

/*
 * T1 får separata exakta WIN-punkter under
 * sista tre minuterna. Ordinarie minutdata
 * för T90 och trav ändras inte.
 */
export const GALLOP_T1_PRECISE_WINDOW_SECONDS =
  180;

export const GALLOP_T1_HALF_MINUTE_OFFSET_MS =
  30_000;

export const GALLOP_T1_MIN_DROP_PERCENT =
  25;

export const GALLOP_T1_MAX_DROP_PERCENT =
  40;

export const GALLOP_T1_STAKE_SEK =
  100;

/*
 * Forskningsinsamlingen är aktiv, men inga
 * T1-utvärderingar eller skuggspel skapas
 * innan datan har analyserats.
 */
export const GALLOP_T1_LIVE_DECISIONS_ENABLED =
  false;

export function shouldUseGallopT1PreciseSampling(args: {
  date: string;
  countryCode: string;
  sport?: string | null;
  plannedStartTimeMs: number;
  nowMs: number;
}): boolean {
  if (
    !isGallopT1ShadowRace({
      date:
        args.date,
      countryCode:
        args.countryCode,
      sport:
        args.sport,
    })
  ) {
    return false;
  }

  const secondsBeforeStart =
    (
      args.plannedStartTimeMs -
      args.nowMs
    ) /
    1_000;

  return (
    Number.isFinite(
      secondsBeforeStart,
    ) &&
    secondsBeforeStart > 0 &&
    secondsBeforeStart <=
      GALLOP_T1_PRECISE_WINDOW_SECONDS
  );
}

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
