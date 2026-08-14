import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStrongStarProfile,
} from "./strongStar";

describe("isStrongStarProfile", () => {
  it("ger stjärna för 3/6 + KR + ODD utan SP", () => {
    expect(
      isStrongStarProfile({
        strengthTotal: 3,
        krTopFour: true,
        spTopFour: false,
        oddsIndicatorTopFour: true,
      }),
    ).toBe(true);
  });

  it("ger inte stjärna när SP ingår", () => {
    expect(
      isStrongStarProfile({
        strengthTotal: 3,
        krTopFour: true,
        spTopFour: true,
        oddsIndicatorTopFour: true,
      }),
    ).toBe(false);
  });

  it("ger inte stjärna för Gioia-profil utan KR", () => {
    expect(
      isStrongStarProfile({
        strengthTotal: 3,
        krTopFour: false,
        spTopFour: false,
        oddsIndicatorTopFour: true,
      }),
    ).toBe(false);
  });

  it("ger inte stjärna för 2/6", () => {
    expect(
      isStrongStarProfile({
        strengthTotal: 2,
        krTopFour: true,
        spTopFour: false,
        oddsIndicatorTopFour: true,
      }),
    ).toBe(false);
  });
});
