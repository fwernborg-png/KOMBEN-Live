import { describe, expect, it } from "vitest";
import {
  BLAVALEN_RULE_CONFIG_V1,
  SMALLKARAMELL_RULE_CONFIG_V1,
  WIN_PLACE_RULE_CONFIG_V1,
} from "../../src/winPlaceModel/config";
import type { WinPlaceEvaluation } from "../../src/winPlaceModel/types";
import { buildWinPlaceBetRows } from "./winPlacePersistence";

function makeEvaluation(
  decision: WinPlaceEvaluation["decision"],
): WinPlaceEvaluation {
  const nowIso = "2026-07-29T17:58:30.000Z";

  return {
    raceId: "race-1",
    ruleVersion: WIN_PLACE_RULE_CONFIG_V1.ruleVersion,
    decision,
    reasons: [],
    race: {
      raceId: "race-1",
      date: "2026-07-29",
      trackId: 1,
      trackName: "Solvalla",
      raceNumber: 5,
      plannedStartTime: "2026-07-29T18:00:00.000Z",
      raceStatus: "scheduled",
      isMonte: false,
      startMethod: "AUTO",
      distanceMeters: 2140,
      starters: 10,
    },
    plannedLockTimeMs: Date.parse(nowIso),
    actualLockTimeMs: Date.parse(nowIso),
    lockedAt: nowIso,
    secondsBeforeStartAtLock: 90,
    configSnapshot: WIN_PLACE_RULE_CONFIG_V1,
    checks: [],
    mostShortened:
      decision === "PLAY"
        ? {
            runnerNumber: 6,
            runnerName: "Golden Sunrise",
            horseId: 12345,
            startLane: 6,
            startOdds: 10.49,
            currentWinOdds: 5.99,
            oddsDropPercent: 42.9,
            validOddsPoints: 60,
            cvRaw: 12.345,
            cvDisplay: 12.35,
            strength: 3,
            indicatorsGreen: ["KR", "SP", "ODD"],
          }
        : null,
    createdAt: nowIso,
    updatedAt: nowIso,
    snapshot: {},
  };
}

describe("win-place persistence", () => {
  it("skapar vinnare och plats som två separata spel", () => {
    const rows = buildWinPlaceBetRows({
      evaluation: makeEvaluation("PLAY"),
      nowIso: "2026-07-29T17:58:30.000Z",
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.market)).toEqual([
      "WIN",
      "PLACE",
    ]);
    expect(rows.map((row) => row.stake_oren)).toEqual([
      10_000,
      10_000,
    ]);
    expect(rows[0].bet_id).not.toBe(rows[1].bet_id);
  });

  it("Blåvalen skapar WIN och PLATS även när låsoddset är under 3,50", () => {
    const evaluation =
      makeEvaluation("PLAY");

    const candidate =
      evaluation.mostShortened;

    if (!candidate) {
      throw new Error(
        "Testkandidat saknas",
      );
    }

    const rows =
      buildWinPlaceBetRows({
        evaluation: {
          ...evaluation,

          ruleVersion:
            BLAVALEN_RULE_CONFIG_V1
              .ruleVersion,

          configSnapshot:
            BLAVALEN_RULE_CONFIG_V1,

          mostShortened: {
            ...candidate,
            currentWinOdds: 2.27,
            oddsDropPercent: 88,
          },
        },

        nowIso:
          "2026-08-22T11:51:47.000Z",
      });

    expect(rows).toHaveLength(2);

    expect(
      rows.map(
        (row) => row.market,
      ),
    ).toEqual([
      "WIN",
      "PLACE",
    ]);

    expect(
      rows.every(
        (row) =>
          row.rule_version ===
          "BLAVALEN_V1.0",
      ),
    ).toBe(true);
  });


  it("skapar bara plats när vinnaroddset är under 3,50", () => {
    const evaluation = makeEvaluation("PLAY");
    const candidate = evaluation.mostShortened;

    if (!candidate) {
      throw new Error("Testkandidat saknas");
    }

    evaluation.mostShortened = {
      ...candidate,
      currentWinOdds: 3.49,
    };

    const rows = buildWinPlaceBetRows({
      evaluation,
      nowIso: "2026-07-29T17:58:30.000Z",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].market).toBe("PLACE");
  });

  it("skapar inga spel när regeln inte ger PLAY", () => {
    const rows = buildWinPlaceBetRows({
      evaluation: makeEvaluation("NO_PLAY"),
      nowIso: "2026-07-29T17:58:30.000Z",
    });

    expect(rows).toEqual([]);
  });

  it("sparar Smällkaramellen som en egen regelversion med vinnare och plats", () => {
    const evaluation = makeEvaluation("PLAY");
    const candidate = evaluation.mostShortened;

    if (!candidate) {
      throw new Error("Testkandidat saknas");
    }

    const rows = buildWinPlaceBetRows({
      evaluation: {
        ...evaluation,
        ruleVersion: SMALLKARAMELL_RULE_CONFIG_V1.ruleVersion,
        configSnapshot: SMALLKARAMELL_RULE_CONFIG_V1,
        selectedCandidate: {
          ...candidate,
          runnerNumber: 9,
          runnerName: "Epic S2",
          currentWinOdds: 7,
        },
      },
      nowIso: "2026-07-29T17:58:30.000Z",
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.rule_version === "SMALLKARAMELL_S2_V1.0")).toBe(true);
    expect(rows.every((row) => row.horse_number === 9)).toBe(true);
  });

});
