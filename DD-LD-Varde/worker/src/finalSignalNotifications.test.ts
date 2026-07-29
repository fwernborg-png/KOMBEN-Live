import { describe, expect, it } from "vitest";
import type { SmoothestCandidate } from "../../src/placeModel/types";
import type { WinPlaceCandidate } from "../../src/winPlaceModel/types";
import {
  buildFinalSignalNotification,
  buildFinalSignalNotificationKey,
} from "./finalSignalNotifications";

function winPlaceCandidate(
  runnerNumber = 6,
): WinPlaceCandidate {
  return {
    runnerNumber,
    runnerName: `Vinnare ${runnerNumber}`,
    horseId: 1000 + runnerNumber,
    startLane: runnerNumber,
    startOdds: 10,
    currentWinOdds: 5.5,
    oddsDropPercent: 45,
    validOddsPoints: 60,
    cvRaw: 12.4,
    cvDisplay: 12.4,
    strength: 3,
    indicatorsGreen: ["KR", "ODD"],
  };
}

function placeCandidate(
  runnerNumber = 4,
): SmoothestCandidate {
  return {
    runnerNumber,
    runnerName: `Platshäst ${runnerNumber}`,
    startLane: runnerNumber,
    startOdds: 8,
    currentWinOdds: 6.5,
    oddsDropPercent: -18.75,
    validOddsPoints: 60,
    cvRaw: 0.05,
    cvDisplay: 5,
    strength: 5,
    indicatorsGreen: ["KR", "ST", "K", "SP", "ODD"],
  };
}

const base = {
  raceDate: "2026-07-29",
  trackId: 33,
  trackName: "Mantorp",
  raceNumber: 5,
};

describe("slutlig gemensam spelnotis", () => {
  it("bygger vinnare och plats när bara nya regeln gäller", () => {
    const notification = buildFinalSignalNotification({
      ...base,
      winPlaceCandidate: winPlaceCandidate(),
      placeCandidate: null,
    });

    expect(notification?.title).toBe(
      "VINNARE + PLATS – Mantorp lopp 5",
    );
    expect(notification?.body).toContain(
      "nr 6 Vinnare 6: 100 kr vinnare + 100 kr plats",
    );
  });

  it("bygger endast platsspel när bara platsregeln gäller", () => {
    const notification = buildFinalSignalNotification({
      ...base,
      winPlaceCandidate: null,
      placeCandidate: placeCandidate(),
    });

    expect(notification?.title).toBe(
      "PLATSSPEL – Mantorp lopp 5",
    );
    expect(notification?.body).toBe(
      "nr 4 Platshäst 4: 100 kr plats.",
    );
  });

  it("samlar två olika hästar i en enda notis", () => {
    const notification = buildFinalSignalNotification({
      ...base,
      winPlaceCandidate: winPlaceCandidate(6),
      placeCandidate: placeCandidate(4),
    });

    expect(notification?.title).toBe(
      "TVÅ SPELSIGNALER – Mantorp lopp 5",
    );
    expect(notification?.body).toContain(
      "Vinnare + plats: nr 6 Vinnare 6",
    );
    expect(notification?.body).toContain(
      "Plats: nr 4 Platshäst 4",
    );
  });

  it("ger inte dubbelt platsspel när båda reglerna väljer samma häst", () => {
    const notification = buildFinalSignalNotification({
      ...base,
      winPlaceCandidate: winPlaceCandidate(6),
      placeCandidate: {
        ...placeCandidate(6),
        runnerName: "Vinnare 6",
      },
    });

    expect(notification?.title).toBe(
      "VINNARE + PLATS – Mantorp lopp 5",
    );
    expect(notification?.body).toContain(
      "Uppfyller båda reglerna",
    );
    expect(notification?.body?.match(/100 kr plats/g)).toHaveLength(
      1,
    );
  });

  it("skapar ingen notis när inget spel finns", () => {
    expect(
      buildFinalSignalNotification({
        ...base,
        winPlaceCandidate: null,
        placeCandidate: null,
      }),
    ).toBeNull();
  });

  it("använder en enda unik slutnotisnyckel per lopp", () => {
    expect(
      buildFinalSignalNotificationKey(base),
    ).toBe("2026-07-29:33:5:FINAL_SIGNAL_V1.0");
  });
});
