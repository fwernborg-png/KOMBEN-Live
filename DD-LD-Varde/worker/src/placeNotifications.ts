import {
  PLACE_RULE_CONFIG_V1,
  type PlaceRuleConfig,
} from "../../src/placeModel/config";
import type { SmoothestCandidate } from "../../src/placeModel/types";
import type { PlacePushNotification } from "./webPush";

const MINUTE_MS = 60_000;

export const PLACE_ALERT_CONFIG_V1: PlaceRuleConfig = {
  ...PLACE_RULE_CONFIG_V1,
  ruleVersion: "PLACE_ALERT_V1.0",
  lockMinutesBeforeRace: 3,
};

export function isInPlaceT3NotificationWindow(
  plannedStartTime: string,
  nowMs: number,
): boolean {
  const startMs = Date.parse(plannedStartTime);

  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  const remainingMs = startMs - nowMs;

  return remainingMs >= 2 * MINUTE_MS && remainingMs <= 4 * MINUTE_MS;
}

export function buildPlaceT3NotificationKey(args: {
  raceDate: string;
  trackId: number;
  raceNumber: number;
}): string {
  return [
    args.raceDate,
    args.trackId,
    args.raceNumber,
    PLACE_ALERT_CONFIG_V1.ruleVersion,
  ].join(":");
}

export function buildPlaceT3Notification(args: {
  raceDate: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  candidate: SmoothestCandidate;
}): PlacePushNotification {
  const notificationKey = buildPlaceT3NotificationKey(args);
  const params = new URLSearchParams({
    date: args.raceDate,
    trackId: String(args.trackId),
    raceNumber: String(args.raceNumber),
    tab: "race",
  });

  return {
    title: `Möjligt platsspel – ${args.trackName} lopp ${args.raceNumber}`,
    body: "Öppna appen för slutlig kontroll. Start om cirka 3 minuter.",
    url: `/?${params.toString()}`,
    tag: notificationKey,
  };
}
