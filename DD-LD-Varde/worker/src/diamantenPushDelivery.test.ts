import { describe, expect, it } from "vitest";
import type { WinPlaceCandidate } from "../../src/winPlaceModel/types";
import {
  buildDiamantenNotification,
  buildDiamantenNotificationKey,
} from "./diamantenPushDelivery";

function candidate(
  runnerNumber: number,
  runnerName: string,
  currentWinOdds: number,
): WinPlaceCandidate {
  return {
    runnerNumber,
    runnerName,
    horseId: runnerNumber,
    startLane: runnerNumber,
    startOdds: currentWinOdds + 2,
    currentWinOdds,
    oddsDropPercent: 10,
    validOddsPoints: 5,
    cvRaw: 2,
    cvDisplay: 2,
    strength: 3,
    indicatorsGreen: ["KR", "ST", "K"],
  };
}

describe("Diamanten push", () => {
  it("bygger rätt notisnyckel", () => {
    expect(
      buildDiamantenNotificationKey({
        raceDate: "2026-08-11",
        trackId: 5,
        raceNumber: 7,
      }),
    ).toBe("2026-08-11:5:7:DIAMANTEN_V1.0");
  });

  it("samlar flera kandidater i samma push", () => {
    const notification = buildDiamantenNotification({
      raceDate: "2026-08-11",
      trackId: 5,
      trackName: "Åby",
      raceNumber: 7,
      candidates: [
        candidate(6, "Häst Sex", 22),
        candidate(2, "Häst Två", 7.5),
      ],
    });

    expect(notification?.title).toBe(
      "💎 DIAMANTEN – Åby lopp 7",
    );

    expect(notification?.body).toContain(
      "VINNARE 100 kr: nr 2 Häst Två",
    );

    expect(notification?.body).toContain(
      "nr 6 Häst Sex",
    );

    expect(notification?.url).toContain(
      "diamantenRunners=2%2C6",
    );
  });
});
