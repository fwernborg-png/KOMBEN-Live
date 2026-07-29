import { describe, expect, it } from "vitest";
import {
  inferResearchMeetingTimeCategory,
  parseResearchProducts,
  parseResearchRaceMeta,
  parseResearchRunnerMeta,
} from "./researchRaceParser";

describe("researchRaceParser", () => {
  it("läser startmetod, distans och klassvärden", () => {
    const parsed = parseResearchRaceMeta({
      name: "Försök 1",
      startMethod: "Autostart",
      distanceMeters: 1640,
      conditions: {
        earningsMin: 20_001,
        earningsMax: 150_000,
        ageMin: 3,
        ageMax: 12,
      },
      firstPrize: 50_000,
    });

    expect(parsed.raceName).toBe("Försök 1");
    expect(parsed.startMethod).toBe("AUTO");
    expect(parsed.distanceMeters).toBe(1640);
    expect(parsed.earningsMin).toBe(20_001);
    expect(parsed.earningsMax).toBe(150_000);
    expect(parsed.ageMin).toBe(3);
    expect(parsed.ageMax).toBe(12);
    expect(parsed.firstPrize).toBe(50_000);
  });

  it("kan läsa distans och inkomstgränser ur text", () => {
    const parsed = parseResearchRaceMeta({
      description:
        "3-åriga och äldre 20.001 - 150.000 kr. 2140 m. Voltstart. Pris: 40.000-20.000 kr.",
    });

    expect(parsed.startMethod).toBe("VOLT");
    expect(parsed.distanceMeters).toBe(2140);
    expect(parsed.earningsMin).toBe(20_001);
    expect(parsed.earningsMax).toBe(150_000);
    expect(parsed.firstPrize).toBe(40_000);
  });

  it("läser spår, kusk, tränare och hästuppgifter", () => {
    const parsed = parseResearchRunnerMeta({
      postPosition: 7,
      startDistance: 2160,
      horse: {
        age: 5,
        sex: "VALACK",
      },
      driver: {
        id: 101,
        name: "Anna Kusk",
      },
      trainer: {
        id: 202,
        name: "Erik Tränare",
      },
    });

    expect(parsed.startLane).toBe(7);
    expect(parsed.startDistanceMeters).toBe(2160);
    expect(parsed.horseAge).toBe(5);
    expect(parsed.horseSex).toBe("VALACK");
    expect(parsed.driverId).toBe(101);
    expect(parsed.driverName).toBe("Anna Kusk");
    expect(parsed.trainerId).toBe(202);
    expect(parsed.trainerName).toBe("Erik Tränare");
  });

  it("identifierar flera spelprodukter utan dubbletter", () => {
    const products = parseResearchProducts({
      labels: [
        "V85-3",
        "V4-1",
        "DD-1",
        "V85-3",
      ],
    });

    expect(
      products.map((product) => product.productCode),
    ).toEqual(["V85", "V4", "DD"]);

    expect(
      products.find(
        (product) =>
          product.productCode === "V85",
      )?.legNumber,
    ).toBe(3);
  });

  it("prioriterar uttrycklig lunchmärkning", () => {
    const inferred =
      inferResearchMeetingTimeCategory({
        plannedStartTime:
          "2026-07-29T18:00:00.000Z",
        rawMeetingOrRace: {
          meetingName: "Lunchtrav",
        },
      });

    expect(inferred.category).toBe("LUNCH");
    expect(inferred.method).toBe("SOURCE_LABEL");
  });

  it("tolkar inte brunch som uttrycklig lunchmärkning", () => {
    const inferred =
      inferResearchMeetingTimeCategory({
        plannedStartTime:
          "2026-07-29T18:00:00.000Z",
        rawMeetingOrRace: {
          meetingName: "Brunchmöte",
        },
      });

    expect(inferred.category).toBe("EVENING");
    expect(inferred.method).toBe("TIME_RULE_V1");
  });

  it("kan använda svensk lokal starttid som reservregel", () => {
    const inferred =
      inferResearchMeetingTimeCategory({
        plannedStartTime:
          "2026-07-29T10:00:00.000Z",
        rawMeetingOrRace: {},
      });

    expect(inferred.category).toBe("LUNCH");
    expect(inferred.method).toBe("TIME_RULE_V1");
  });
});
