export type WinPlaceRuleConfig = {
  ruleVersion: string;
  collectionStartMinutesBeforeRace: number;
  lockTargetSecondsBeforeRace: number;
  lockWindowOpensSecondsBeforeRace: number;
  lockWindowClosesSecondsBeforeRace: number;
  minOddsDropPercentInclusive: number;
  maxCurrentWinOddsInclusive: number;
  minValidOddsPoints: number;
  excludeMonte: boolean;
  defaultWinStakeSEK: number;
  defaultPlaceStakeSEK: number;
};

export const WIN_PLACE_RULE_CONFIG_V1: WinPlaceRuleConfig = {
  ruleVersion: "WIN_PLACE_V1.0",
  collectionStartMinutesBeforeRace: 60,
  lockTargetSecondsBeforeRace: 90,
  lockWindowOpensSecondsBeforeRace: 120,
  lockWindowClosesSecondsBeforeRace: 60,
  minOddsDropPercentInclusive: 30,
  maxCurrentWinOddsInclusive: 6,
  minValidOddsPoints: 5,
  excludeMonte: true,
  defaultWinStakeSEK: 100,
  defaultPlaceStakeSEK: 100,
};

export function getWinPlaceCollectionStartMs(
  plannedStartTime: string,
  config: WinPlaceRuleConfig,
) {
  return (
    Date.parse(plannedStartTime) -
    config.collectionStartMinutesBeforeRace * 60_000
  );
}

export function getWinPlacePlannedLockTimeMs(
  plannedStartTime: string,
  config: WinPlaceRuleConfig,
) {
  return (
    Date.parse(plannedStartTime) -
    config.lockTargetSecondsBeforeRace * 1_000
  );
}

export function isInWinPlaceFinalSignalWindow(
  plannedStartTime: string,
  nowMs: number,
  config: WinPlaceRuleConfig = WIN_PLACE_RULE_CONFIG_V1,
) {
  const startMs = Date.parse(plannedStartTime);

  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  const remainingSeconds = (startMs - nowMs) / 1_000;

  return (
    remainingSeconds <= config.lockWindowOpensSecondsBeforeRace &&
    remainingSeconds >= config.lockWindowClosesSecondsBeforeRace
  );
}
