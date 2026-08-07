import {
  describe,
  expect,
  it,
} from "vitest";
import {
  formatPrimaryRaceProductLabel,
  inferRaceMeetingTimeCategory,
  parseRaceProducts,
} from "./raceProducts";

describe("raceProducts", () => {
  it("läser V86-avdelning från text", () => {
    const products =
      parseRaceProducts({
        labels: [
          "V86-5",
          "V4-2",
        ],
      });

    expect(products[0]).toEqual({
      productCode: "V86",
      legNumber: 5,
      totalLegs: null,
    });

    expect(
      formatPrimaryRaceProductLabel(
        products,
        "EVENING",
      ),
    ).toBe("V86-5");
  });

  it("läser strukturerad avdelning", () => {
    const products =
      parseRaceProducts({
        product: {
          productCode: "V85",
          legNumber: 1,
          totalLegs: 7,
        },
      });

    expect(products[0]).toEqual({
      productCode: "V85",
      legNumber: 1,
      totalLegs: 7,
    });
  });

  it("visar LUNCH framför V4", () => {
    const products =
      parseRaceProducts({
        label: "V4-2",
      });

    expect(
      formatPrimaryRaceProductLabel(
        products,
        "LUNCH",
      ),
    ).toBe("LUNCH V4-2");
  });

  it("identifierar lunch via svensk lokal tid", () => {
    expect(
      inferRaceMeetingTimeCategory({
        startTime:
          "2026-08-07T10:30:00.000Z",
        rawContext: {},
      }),
    ).toBe("LUNCH");
  });

  it("hittar uttrycklig lunchmärkning", () => {
    expect(
      inferRaceMeetingTimeCategory({
        startTime:
          "2026-08-07T18:30:00.000Z",
        rawContext: {
          meetingName:
            "Lunchtrav V4",
        },
      }),
    ).toBe("LUNCH");
  });
});
