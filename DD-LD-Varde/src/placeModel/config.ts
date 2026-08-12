export type PlaceRuleConfig = {
  ruleVersion: string;
  collectionStartMinutesBeforeRace: number;
  lockMinutesBeforeRace: number;
  minStrength: number;
  maxCurrentWinOddsExclusive: number;
  requireOddsDrop: boolean;
  requireSmoothestHorse: boolean;
  minValidOddsPoints: number;
  excludeMonte: boolean;
  defaultStakeSEK: number;
  hitMaxOfficialFinishPosition: number;
};

// PLACE_V2.0 är pensionerad.
 // Historik och settlement behålls, men inga nya signaler/spel ska skapas.
export const PLACE_V2_RETIRED = true;

export const PLACE_RULE_CONFIG_V1: PlaceRuleConfig = {
  ruleVersion: "PLACE_V2.0",
  collectionStartMinutesBeforeRace: 60,
  lockMinutesBeforeRace: 1.5,
  minStrength: 4,
  maxCurrentWinOddsExclusive: 10.0,
  requireOddsDrop: true,
  requireSmoothestHorse: true,
  minValidOddsPoints: 5,
  excludeMonte: true,
  defaultStakeSEK: 100,
  hitMaxOfficialFinishPosition: 3,
};

export function getRaceCollectionStartMs(startTimeIso: string, config: PlaceRuleConfig) {
  const startMs = new Date(startTimeIso).getTime();
  return startMs - config.collectionStartMinutesBeforeRace * 60_000;
}

export function getRaceLockTimeMs(startTimeIso: string, config: PlaceRuleConfig) {
  const startMs = new Date(startTimeIso).getTime();
  return startMs - config.lockMinutesBeforeRace * 60_000;
}
