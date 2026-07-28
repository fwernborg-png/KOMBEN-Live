import { describe, expect, it } from "vitest";
import type { SmoothestCandidate } from "../../src/placeModel/types";
import {
  PLACE_ALERT_CONFIG_V1,
  buildPlaceT3Notification,
  buildPlaceT3NotificationKey,
  isInPlaceT3NotificationWindow,
} from "./placeNotifications";

const candidate: SmoothestCandidate = {
  runnerNumber: 7,
  runnerName: "Testhästen",
  startLane: 7,
  startOdds: 8.5,
  currentWinOdds: 6.2,
  oddsDropPercent: -27.06,
  validOddsPoints: 42,
  cvRaw: 0.08,
  cvDisplay: 8,
  strength: 5,
  indicatorsGreen: ["KR", "ST", "K", "SP", "ODD"],
};

describe("place T-3 notifications", () => {
  it("använder samma regler som platsmodellen men låser vid T-3", () => {
    expect(PLACE_ALERT_CONFIG_V1.lockMinutesBeforeRace).toBe(3);
    expect(PLACE_ALERT_CONFIG_V1.ruleVersion).toBe("PLACE_ALERT_V1.0");
    expect(PLACE_ALERT_CONFIG_V1.minStrength).toBe(4);
    expect(PLACE_ALERT_CONFIG_V1.maxCurrentWinOddsExclusive).toBe(10);
  });

  it("godkänner körning mellan T-4 och T-2", () => {
    const start = "2026-07-28T18:00:00.000Z";

    expect(
      isInPlaceT3NotificationWindow(start, Date.parse("2026-07-28T17:56:00.000Z")),
    ).toBe(true);

    expect(
      isInPlaceT3NotificationWindow(start, Date.parse("2026-07-28T17:57:00.000Z")),
    ).toBe(true);

    expect(
      isInPlaceT3NotificationWindow(start, Date.parse("2026-07-28T17:58:00.000Z")),
    ).toBe(true);
  });

  it("avvisar tider utanför T-3-fönstret", () => {
    const start = "2026-07-28T18:00:00.000Z";

    expect(
      isInPlaceT3NotificationWindow(start, Date.parse("2026-07-28T17:55:59.000Z")),
    ).toBe(false);

    expect(
      isInPlaceT3NotificationWindow(start, Date.parse("2026-07-28T17:58:01.000Z")),
    ).toBe(false);

    expect(isInPlaceT3NotificationWindow("ogiltig", Date.now())).toBe(false);
  });

  it("bygger en unik nyckel per lopp och regelversion", () => {
    expect(
      buildPlaceT3NotificationKey({
        raceDate: "2026-07-28",
        trackId: 33,
        raceNumber: 3,
      }),
    ).toBe("2026-07-28:33:3:PLACE_ALERT_V1.0");
  });

  it("skickar endast en uppmaning att öppna rätt lopp", () => {
    const notification = buildPlaceT3Notification({
      raceDate: "2026-07-28",
      trackId: 33,
      trackName: "Mantorp",
      raceNumber: 3,
      candidate,
    });

    expect(notification.title).toBe("Möjligt platsspel – Mantorp lopp 3");
    expect(notification.body).toBe(
      "Öppna appen för slutlig kontroll. Start om cirka 3 minuter.",
    );
    expect(notification.body).not.toContain(candidate.runnerName);
    expect(notification.url).toBe(
      "/?date=2026-07-28&trackId=33&raceNumber=3&tab=race",
    );
    expect(notification.tag).toBe(
      "2026-07-28:33:3:PLACE_ALERT_V1.0",
    );
  });
});
