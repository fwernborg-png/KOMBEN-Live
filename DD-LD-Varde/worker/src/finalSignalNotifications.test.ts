import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  SmoothestCandidate,
} from "../../src/placeModel/types";

import type {
  WinPlaceCandidate,
} from "../../src/winPlaceModel/types";

import {
  buildFinalSignalNotification,
  buildFinalSignalNotificationKey,
} from "./finalSignalNotifications";

function winPlaceCandidate(
  runnerNumber = 6,
): WinPlaceCandidate {
  return {
    runnerNumber,
    runnerName:
      `Vinnare ${runnerNumber}`,
    horseId:
      1000 + runnerNumber,
    startLane:
      runnerNumber,
    startOdds:
      10,
    currentWinOdds:
      5.5,
    oddsDropPercent:
      45,
    validOddsPoints:
      60,
    cvRaw:
      12.4,
    cvDisplay:
      12.4,
    strength:
      3,
    indicatorsGreen: [
      "KR",
      "ODD",
    ],
  };
}

function placeCandidate(
  runnerNumber = 4,
): SmoothestCandidate {
  return {
    runnerNumber,
    runnerName:
      `Platshäst ${runnerNumber}`,
    startLane:
      runnerNumber,
    startOdds:
      8,
    currentWinOdds:
      6.5,
    oddsDropPercent:
      18.75,
    validOddsPoints:
      60,
    cvRaw:
      0.05,
    cvDisplay:
      0.05,
    strength:
      2,
    indicatorsGreen: [
      "KR",
      "ODD",
    ],
  };
}

const base = {
  raceDate:
    "2026-08-10",
  trackId:
    33,
  trackName:
    "Mantorp",
  raceNumber:
    5,
};

describe(
  "slutlig gemensam spelnotis",
  () => {
    it(
      "behåller den gamla vinnare plus plats-notisen",
      () => {
        const notification =
          buildFinalSignalNotification({
            ...base,
            winPlaceCandidate:
              winPlaceCandidate(),
            placeCandidate:
              null,
          });

        expect(
          notification?.title,
        ).toBe(
          "VINNARE + PLATS – Mantorp lopp 5",
        );
      },
    );

    it(
      "skriver tydligt vinnarspelet i testläget",
      () => {
        const notification =
          buildFinalSignalNotification({
            ...base,

            signalMode:
              "RESEARCH_TRIAL",

            winPlaceCandidate: {
              ...winPlaceCandidate(),
              startOdds: 4,
              currentWinOdds: 2.8,
              strength: 5,
            },

            placeCandidate:
              null,
          });

        expect(
          notification?.title,
        ).toBe(
          "VINNARSPEL – Mantorp lopp 5",
        );

        expect(
          notification?.body,
        ).toContain(
          "100 kr vinnare",
        );

        expect(
          notification?.body,
        ).toContain(
          "startodds 4,00",
        );
      },
    );

    it(
      "skriver tydligt platsspelet i testläget",
      () => {
        const notification =
          buildFinalSignalNotification({
            ...base,

            signalMode:
              "RESEARCH_TRIAL",

            winPlaceCandidate:
              null,

            placeCandidate:
              placeCandidate(),
          });

        expect(
          notification?.title,
        ).toBe(
          "PLATSSPEL – Mantorp lopp 5",
        );

        expect(
          notification?.body,
        ).toContain(
          "100 kr plats",
        );

        expect(
          notification?.body,
        ).toContain(
          "låsodds 6,50",
        );
      },
    );

    it(
      "samlar två testspel i samma notis",
      () => {
        const notification =
          buildFinalSignalNotification({
            ...base,

            signalMode:
              "RESEARCH_TRIAL",

            winPlaceCandidate: {
              ...winPlaceCandidate(6),
              startOdds: 4,
              strength: 5,
            },

            placeCandidate:
              placeCandidate(4),
          });

        expect(
          notification?.title,
        ).toBe(
          "TVÅ SPEL – Mantorp lopp 5",
        );

        expect(
          notification?.body,
        ).toContain(
          "VINNARE 100 kr",
        );

        expect(
          notification?.body,
        ).toContain(
          "PLATS 100 kr",
        );
      },
    );

    it(
      "skapar ingen notis när inget spel finns",
      () => {
        expect(
          buildFinalSignalNotification({
            ...base,
            winPlaceCandidate:
              null,
            placeCandidate:
              null,
          }),
        ).toBeNull();
      },
    );

    it(
      "ger testperioden en egen notisnyckel",
      () => {
        expect(
          buildFinalSignalNotificationKey({
            ...base,
            signalMode:
              "RESEARCH_TRIAL",
          }),
        ).toBe(
          "2026-08-10:33:5:RESEARCH_TRIAL_2026-08-03_2026-08-16_V1.1",
        );
      },
    );

    it(
      "behåller den gamla notisnyckeln",
      () => {
        expect(
          buildFinalSignalNotificationKey(
            base,
          ),
        ).toBe(
          "2026-08-10:33:5:FINAL_SIGNAL_V1.1",
        );
      },
    );

    it(
      "skriver Kräfta i buren som vinnare plus plats",
      () => {
        const notification =
          buildFinalSignalNotification({
            ...base,
            winPlaceCandidate: null,
            placeCandidate: null,
            smallkaramellCandidate: {
              ...winPlaceCandidate(9),
              runnerName: "Epic S2",
              currentWinOdds: 7,
              strength: 2,
            },
          });

        expect(notification?.title).toBe(
          "KRÄFTA I BUREN – Mantorp lopp 5",
        );
        expect(notification?.body).toContain("100 kr vinnare + 100 kr plats");
        expect(notification?.body).toContain("S2");
        expect(notification?.body).toContain("låsodds 7,00");
        expect(notification?.url).toContain(
          "kraftaRunner=9",
        );
      },
    );

    it(
      "samlar Kräfta i buren med andra signaler i en gemensam notis",
      () => {
        const notification =
          buildFinalSignalNotification({
            ...base,
            winPlaceCandidate: winPlaceCandidate(6),
            placeCandidate: placeCandidate(4),
            smallkaramellCandidate: winPlaceCandidate(9),
          });

        expect(notification?.title).toBe(
          "FLERA SPELSIGNALER – Mantorp lopp 5",
        );
        expect(notification?.body).toContain("KRÄFTA I BUREN");
        expect(notification?.body).toContain("Vinnare + plats");
        expect(notification?.body).toContain("Plats:");
      },
    );

  },
);
