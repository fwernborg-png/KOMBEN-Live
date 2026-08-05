import { PLACE_RULE_CONFIG_V1 } from "../../src/placeModel/config";
import type { SmoothestCandidate } from "../../src/placeModel/types";
import {
  SMALLKARAMELL_RULE_CONFIG_V1,
  WIN_PLACE_RULE_CONFIG_V1,
} from "../../src/winPlaceModel/config";
import type { WinPlaceCandidate } from "../../src/winPlaceModel/types";
import { RESEARCH_TRIAL_SIGNAL_VERSION } from "./researchTrialSignals";
import type { PlacePushNotification } from "./webPush";

export type FinalSignalMode =
  | "LEGACY"
  | "RESEARCH_TRIAL";

export const FINAL_SIGNAL_NOTIFICATION_VERSION =
  "FINAL_SIGNAL_V1.1";

export function notificationVersionForMode(
  signalMode: FinalSignalMode,
) {
  return signalMode === "RESEARCH_TRIAL"
    ? RESEARCH_TRIAL_SIGNAL_VERSION
    : FINAL_SIGNAL_NOTIFICATION_VERSION;
}

export function buildFinalSignalNotificationKey(args: {
  raceDate: string;
  trackId: number;
  raceNumber: number;
  signalMode?: FinalSignalMode;
}) {
  return [
    args.raceDate,
    args.trackId,
    args.raceNumber,
    notificationVersionForMode(args.signalMode ?? "LEGACY"),
  ].join(":");
}

function horseLabel(candidate: {
  runnerNumber: number;
  runnerName: string;
}) {
  return `nr ${candidate.runnerNumber} ${candidate.runnerName}`;
}

function formatOdds(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function smallkaramellLine(candidate: WinPlaceCandidate) {
  return (
    `🎉 SMÄLLKARAMELLEN: ${horseLabel(candidate)} · ` +
    `${SMALLKARAMELL_RULE_CONFIG_V1.defaultWinStakeSEK} kr vinnare + ` +
    `${SMALLKARAMELL_RULE_CONFIG_V1.defaultPlaceStakeSEK} kr plats · ` +
    `S2 · låsodds ${formatOdds(candidate.currentWinOdds)} · ` +
    `styrka ${candidate.strength}/6.`
  );
}

function buildTrialNotification(args: {
  trackName: string;
  raceNumber: number;
  winnerCandidate: WinPlaceCandidate | null;
  placeCandidate: SmoothestCandidate | null;
  smallkaramellCandidate: WinPlaceCandidate | null;
}) {
  const {
    trackName,
    raceNumber,
    winnerCandidate,
    placeCandidate,
    smallkaramellCandidate,
  } = args;

  if (smallkaramellCandidate) {
    const lines: string[] = [];

    if (winnerCandidate) {
      lines.push(
        `VINNARE ${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr: ` +
          `${horseLabel(winnerCandidate)} · startodds ` +
          `${formatOdds(winnerCandidate.startOdds)} · ` +
          `styrka ${winnerCandidate.strength}/6.`,
      );
    }

    if (placeCandidate) {
      lines.push(
        `PLATS ${PLACE_RULE_CONFIG_V1.defaultStakeSEK} kr: ` +
          `${horseLabel(placeCandidate)} · låsodds ` +
          `${formatOdds(placeCandidate.currentWinOdds)} · ` +
          `styrka ${placeCandidate.strength}/6.`,
      );
    }

    lines.push(smallkaramellLine(smallkaramellCandidate));

    return {
      title:
        lines.length === 1
          ? `SMÄLLKARAMELLEN – ${trackName} lopp ${raceNumber}`
          : `FLERA SPELSIGNALER – ${trackName} lopp ${raceNumber}`,
      body: lines.join(" "),
    };
  }

  if (winnerCandidate && placeCandidate) {
    const sameHorse =
      winnerCandidate.runnerNumber === placeCandidate.runnerNumber;

    return {
      title: `TVÅ SPEL – ${trackName} lopp ${raceNumber}`,
      body:
        `VINNARE ${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr: ` +
        `${horseLabel(winnerCandidate)} · startodds ` +
        `${formatOdds(winnerCandidate.startOdds)} · ` +
        `styrka ${winnerCandidate.strength}/6. ` +
        `PLATS ${PLACE_RULE_CONFIG_V1.defaultStakeSEK} kr: ` +
        `${sameHorse ? "samma häst" : horseLabel(placeCandidate)} · ` +
        `låsodds ${formatOdds(placeCandidate.currentWinOdds)} · ` +
        `styrka ${placeCandidate.strength}/6.`,
    };
  }

  if (winnerCandidate) {
    return {
      title: `VINNARSPEL – ${trackName} lopp ${raceNumber}`,
      body:
        `${horseLabel(winnerCandidate)}: ` +
        `${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr vinnare. ` +
        `Favorit vid lås · startodds ` +
        `${formatOdds(winnerCandidate.startOdds)} · ` +
        `styrka ${winnerCandidate.strength}/6.`,
    };
  }

  const candidate = placeCandidate as SmoothestCandidate;

  return {
    title: `PLATSSPEL – ${trackName} lopp ${raceNumber}`,
    body:
      `${horseLabel(candidate)}: ` +
      `${PLACE_RULE_CONFIG_V1.defaultStakeSEK} kr plats. ` +
      `Jämnaste hästen · låsodds ` +
      `${formatOdds(candidate.currentWinOdds)} · ` +
      `styrka ${candidate.strength}/6.`,
  };
}

export function buildFinalSignalNotification(args: {
  raceDate: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  winPlaceCandidate: WinPlaceCandidate | null;
  placeCandidate: SmoothestCandidate | null;
  smallkaramellCandidate?: WinPlaceCandidate | null;
  signalMode?: FinalSignalMode;
}): PlacePushNotification | null {
  const {
    raceDate,
    trackId,
    trackName,
    raceNumber,
    winPlaceCandidate,
    placeCandidate,
    smallkaramellCandidate = null,
    signalMode = "LEGACY",
  } = args;

  if (
    !winPlaceCandidate &&
    !placeCandidate &&
    !smallkaramellCandidate
  ) {
    return null;
  }

  const notificationKey = buildFinalSignalNotificationKey({
    raceDate,
    trackId,
    raceNumber,
    signalMode,
  });

  const params = new URLSearchParams({
    date: raceDate,
    trackId: String(trackId),
    raceNumber: String(raceNumber),
    tab: "race",
  });

  if (signalMode === "RESEARCH_TRIAL") {
    return {
      ...buildTrialNotification({
        trackName,
        raceNumber,
        winnerCandidate: winPlaceCandidate,
        placeCandidate,
        smallkaramellCandidate,
      }),
      url: `/?${params.toString()}`,
      tag: notificationKey,
    };
  }

  if (smallkaramellCandidate) {
    const lines: string[] = [];

    if (winPlaceCandidate) {
      lines.push(
        `Vinnare + plats: ${horseLabel(winPlaceCandidate)} ` +
          `(${WIN_PLACE_RULE_CONFIG_V1.defaultWinStakeSEK} kr + ` +
          `${WIN_PLACE_RULE_CONFIG_V1.defaultPlaceStakeSEK} kr).`,
      );
    }

    if (placeCandidate) {
      lines.push(
        `Plats: ${horseLabel(placeCandidate)} ` +
          `(${PLACE_RULE_CONFIG_V1.defaultStakeSEK} kr).`,
      );
    }

    lines.push(smallkaramellLine(smallkaramellCandidate));

    return {
      title:
        lines.length === 1
          ? `SMÄLLKARAMELLEN – ${trackName} lopp ${raceNumber}`
          : `FLERA SPELSIGNALER – ${trackName} lopp ${raceNumber}`,
      body: lines.join(" "),
      url: `/?${params.toString()}`,
      tag: notificationKey,
    };
  }

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
