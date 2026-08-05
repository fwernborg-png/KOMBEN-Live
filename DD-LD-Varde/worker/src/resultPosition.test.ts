import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseFinishPosition,
} from "./index";

describe("parseFinishPosition", () => {
  it("läser officiell positiv plats", () => {
    expect(
      parseFinishPosition({
        result: {
          place: 2,
          finishOrder: 2,
        },
      }),
    ).toBe(2);
  });

  it("använder finishOrder när place är noll", () => {
    expect(
      parseFinishPosition({
        result: {
          place: 0,
          finishOrder: 11,
        },
      }),
    ).toBe(11);
  });

  it("returnerar null när inget positivt resultat finns", () => {
    expect(
      parseFinishPosition({
        result: {
          place: 0,
          finishOrder: 0,
        },
      }),
    ).toBeNull();
  });
});
