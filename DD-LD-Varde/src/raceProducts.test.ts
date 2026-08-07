import {
  describe,
  expect,
  it,
} from "vitest";
import {
  formatPrimaryRaceProductLabel,
  inferRaceMeetingTimeCategory,
  parseCalendarGameProducts,
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
  it("kopplar ATG calendar games till rätt avdelning", () => {
    const byRace =
      parseCalendarGameProducts({
        V64: [
          {
            id: "V64_2026-08-07_19_4",
            races: [
              "2026-08-07_19_4",
              "2026-08-07_19_5",
              "2026-08-07_19_6",
              "2026-08-07_19_7",
              "2026-08-07_19_8",
              "2026-08-07_19_9",
            ],
          },
        ],
        V4: [
          {
            id: "V4_2026-08-07_19_6",
            races: [
              "2026-08-07_19_6",
              "2026-08-07_19_7",
              "2026-08-07_19_8",
              "2026-08-07_19_9",
            ],
          },
        ],
      });

    expect(
      byRace[
        "2026-08-07_19_4"
      ],
    ).toEqual([
      {
        productCode: "V64",
        legNumber: 1,
        totalLegs: 6,
      },
    ]);

    expect(
      byRace[
        "2026-08-07_19_6"
      ],
    ).toEqual([
      {
        productCode: "V64",
        legNumber: 3,
        totalLegs: 6,
      },
      {
        productCode: "V4",
        legNumber: 1,
        totalLegs: 4,
      },
    ]);

    expect(
      formatPrimaryRaceProductLabel(
        byRace[
          "2026-08-07_19_6"
        ],
        "EVENING",
      ),
    ).toBe("V64-3");
  });

});
