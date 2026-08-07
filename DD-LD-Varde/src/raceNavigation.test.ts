import { describe, expect, it } from "vitest";
import {
  findNextUpcomingRace,
  isRaceFinished,
  isTrackFinished,
  type RaceNavigationRace,
} from "./raceNavigation";

function createRace(args: {
  id: string;
  raceNumber: number;
  startTime?: string;
  finishOrder?: number[];
}): RaceNavigationRace {
  return {
    id: args.id,
    raceNumber: args.raceNumber,
    startTime: args.startTime,
    finishOrder: args.finishOrder ?? [],
  };
}

describe("raceNavigation", () => {
  it("räknar endast lopp med officiell målordning som körda", () => {
    expect(
      isRaceFinished(
        createRace({
          id: "finished",
          raceNumber: 1,
          finishOrder: [4, 2, 7],
        }),
      ),
    ).toBe(true);

    expect(
      isRaceFinished(
        createRace({
          id: "not-finished",
          raceNumber: 2,
          finishOrder: [],
        }),
      ),
    ).toBe(false);
  });

  it("väljer det närmast kommande loppet bland samtliga banor", () => {
    const nowMs = Date.parse("2026-08-04T17:00:00.000Z");

    const result = findNextUpcomingRace({
      nowMs,
      tracks: [
        { id: 1, name: "Solvalla" },
        { id: 2, name: "Romme" },
      ],
      racesByTrack: {
        1: [
          createRace({
            id: "solvalla-1",
            raceNumber: 1,
            startTime: "2026-08-04T17:20:00.000Z",
          }),
        ],
        2: [
          createRace({
            id: "romme-4",
            raceNumber: 4,
            startTime: "2026-08-04T17:10:00.000Z",
          }),
        ],
      },
    });

    expect(result).toMatchObject({
      trackId: 2,
      trackName: "Romme",
      raceId: "romme-4",
      raceNumber: 4,
    });
  });

  it("ignorerar körda lopp även om deras starttid ligger framåt", () => {
    const nowMs = Date.parse("2026-08-04T17:00:00.000Z");

    const result = findNextUpcomingRace({
      nowMs,
      tracks: [{ id: 1, name: "Solvalla" }],
      racesByTrack: {
        1: [
          createRace({
            id: "finished",
            raceNumber: 1,
            startTime: "2026-08-04T17:05:00.000Z",
            finishOrder: [1, 2, 3],
          }),
          createRace({
            id: "upcoming",
            raceNumber: 2,
            startTime: "2026-08-04T17:15:00.000Z",
          }),
        ],
      },
    });

    expect(result?.raceId).toBe("upcoming");
  });

  it("ignorerar passerade lopp utan resultat och ogiltiga starttider", () => {
    const nowMs = Date.parse("2026-08-04T17:00:00.000Z");

    const result = findNextUpcomingRace({
      nowMs,
      tracks: [{ id: 1, name: "Solvalla" }],
      racesByTrack: {
        1: [
          createRace({
            id: "passed",
            raceNumber: 1,
            startTime: "2026-08-04T16:55:00.000Z",
          }),
          createRace({
            id: "invalid",
            raceNumber: 2,
            startTime: "inte-en-tid",
          }),
          createRace({
            id: "missing",
            raceNumber: 3,
          }),
        ],
      },
    });

    expect(result).toBeNull();
  });

  it("ändrar inte underlaget när nästa lopp räknas fram", () => {
    const tracks = [{ id: 1, name: "Solvalla" }];
    const racesByTrack = {
      1: [
        createRace({
          id: "race-1",
          raceNumber: 1,
          startTime: "2026-08-04T18:00:00.000Z",
        }),
      ],
    };

    const tracksBefore = JSON.stringify(tracks);
    const racesBefore = JSON.stringify(racesByTrack);

    findNextUpcomingRace({
      tracks,
      racesByTrack,
      nowMs: Date.parse("2026-08-04T17:00:00.000Z"),
    });

    expect(JSON.stringify(tracks)).toBe(tracksBefore);
    expect(JSON.stringify(racesByTrack)).toBe(racesBefore);
  });

  it("markerar banan klar först när alla lopp har officiellt resultat", () => {
    expect(
      isTrackFinished([
        createRace({
          id: "race-1",
          raceNumber: 1,
          finishOrder: [2, 1, 3],
        }),
        createRace({
          id: "race-2",
          raceNumber: 2,
          finishOrder: [4, 5, 1],
        }),
      ]),
    ).toBe(true);

    expect(
      isTrackFinished([
        createRace({
          id: "race-1",
          raceNumber: 1,
          finishOrder: [2, 1, 3],
        }),
        createRace({
          id: "race-2",
          raceNumber: 2,
          finishOrder: [],
        }),
      ]),
    ).toBe(false);

    expect(isTrackFinished([])).toBe(false);
  });
});
