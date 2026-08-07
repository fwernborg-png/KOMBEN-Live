import {
  describe,
  expect,
  it,
} from "vitest";
import {
  formatRaceType,
  liveRefreshIntervalSeconds,
  parseRaceDistanceMeters,
  parseRaceStartMethod,
} from "./raceDisplay";

describe("raceDisplay", () => {
  it("läser autostart och distans", () => {
    const race = {
      startMethod: "Autostart",
      distance: 2140,
    };

    expect(parseRaceStartMethod(race)).toBe("AUTO");
    expect(parseRaceDistanceMeters(race)).toBe(2140);
    expect(
      formatRaceType(
        parseRaceStartMethod(race),
        parseRaceDistanceMeters(race),
      ),
    ).toBe("A2140");
  });

  it("läser volt och distans ur text", () => {
    const race = {
      conditions: "Voltstart 1640 m",
    };

    expect(parseRaceStartMethod(race)).toBe("VOLT");
    expect(parseRaceDistanceMeters(race)).toBe(1640);
    expect(
      formatRaceType(
        parseRaceStartMethod(race),
        parseRaceDistanceMeters(race),
      ),
    ).toBe("V1640");
  });

  it("är försiktig när startmetod saknas", () => {
    expect(
      formatRaceType(
        "UNKNOWN",
        2140,
      ),
    ).toBe("2140 m");

    expect(
      formatRaceType(
        "UNKNOWN",
        null,
      ),
    ).toBe("–");
  });

  it("uppdaterar var 30:e sekund bara sista fem minuterna", () => {
    const startTime =
      "2026-08-07T18:30:00.000Z";

    expect(
      liveRefreshIntervalSeconds(
        startTime,
        Date.parse(
          "2026-08-07T18:24:59.000Z",
        ),
      ),
    ).toBe(60);

    expect(
      liveRefreshIntervalSeconds(
        startTime,
        Date.parse(
          "2026-08-07T18:25:00.000Z",
        ),
      ),
    ).toBe(30);

    expect(
      liveRefreshIntervalSeconds(
        startTime,
        Date.parse(
          "2026-08-07T18:29:30.000Z",
        ),
      ),
    ).toBe(30);

    expect(
      liveRefreshIntervalSeconds(
        startTime,
        Date.parse(
          "2026-08-07T18:30:01.000Z",
        ),
      ),
    ).toBe(60);
  });
});
