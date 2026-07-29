import { PLACE_RULE_CONFIG_V1 } from "../../src/placeModel/config";
import type { SmoothestCandidate } from "../../src/placeModel/types";
import { WIN_PLACE_RULE_CONFIG_V1 } from "../../src/winPlaceModel/config";
import type { WinPlaceCandidate } from "../../src/winPlaceModel/types";
import type { PlacePushNotification } from "./webPush";

export const FINAL_SIGNAL_NOTIFICATION_VERSION =
  "FINAL_SIGNAL_V1.0";

export function buildFinalSignalNotificationKey(args: {
  raceDate: string;
  trackId: number;
  raceNumber: number;
}) {
  return [
    args.raceDate,
    args.trackId,
    args.raceNumber,
    FINAL_SIGNAL_NOTIFICATION_VERSION,
  ].join(":");
}

function horseLabel(candidate: {
  runnerNumber: number;
  runnerName: string;
}) {
  return `nr ${candidate.runnerNumber} ${candidate.runnerName}`;
}

export function buildFinalSignalNotification(args: {
  raceDate: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  winPlaceCandidate: WinPlaceCandidate | null;
  placeCandidate: SmoothestCandidate | null;
}): PlacePushNotification | null {
  const {
    raceDate,
    trackId,
    trackName,
    raceNumber,
    winPlaceCandidate,
    placeCandidate,
  } = args;

  if (!winPlaceCandidate && !placeCandidate) {
    return null;
  }

  const notificationKey = buildFinalSignalNotificationKey({
    raceDate,
    trackId,
    raceNumber,
  });

  const params = new URLSearchParams({
    date: raceDate,
    trackId: String(trackId),
    raceNumber: String(raceNumber),
    tab: "race",
  });

  const sameHorse =
    winPlaceCandidate !== null &&
    placeCandidate !== null &&
    winPlaceCandidate.runnerNumber === placeCandidate.runnerNumber;

  let title: string;
  let body: string;

  if (winPlaceCandidate && sameHorse) {
    title = `VINNARE + PLATS – ${trackName} lopp ${raceNumber}`;
    body =
      `${horseLabel(winPlaceCandidate)}: ` +
      `${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr vinnare + ` +
      `${WIN_PLACE_RULE_CONFIG_V1.defaultPlaceStakeSEK} kr plats. ` +
      "Uppfyller båda reglerna.";
  } else if (winPlaceCandidate && placeCandidate) {
    title = `TVÅ SPELSIGNALER – ${trackName} lopp ${raceNumber}`;
    body =
      `Vinnare + plats: ${horseLabel(winPlaceCandidate)} ` +
      `(${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr + ` +
      `${WIN_PLACE_RULE_CONFIG_V1.defaultPlaceStakeSEK} kr). ` +
      `Plats: ${horseLabel(placeCandidate)} ` +
      `(${PLACE_RULE_CONFIG_V1.defaultStakeSEK} kr).`;
  } else if (winPlaceCandidate) {
    title = `VINNARE + PLATS – ${trackName} lopp ${raceNumber}`;
    body =
      `${horseLabel(winPlaceCandidate)}: ` +
      `${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr vinnare + ` +
      `${WIN_PLACE_RULE_CONFIG_V1.defaultPlaceStakeSEK} kr plats.`;
  } else {
    title = `PLATSSPEL – endast plats – ${trackName} lopp ${raceNumber}`;
    body =
      `${horseLabel(placeCandidate as SmoothestCandidate)}: ` +
      `${PLACE_RULE_CONFIG_V1.defaultStakeSEK} kr plats.`;
  }

  return {
    title,
    body,
    url: `/?${params.toString()}`,
    tag: notificationKey,
  };
}
