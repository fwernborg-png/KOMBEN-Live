import { describe, expect, it } from "vitest";
import {
  PLACE_RULE_CONFIG_V1,
  getRaceLockTimeMs,
} from "./config";

describe("PLACE_V2.0 låstid", () => {
  it("låser 90 sekunder före planerad start", () => {
    const startTime = "2026-07-29T18:00:00.000Z";
    const startMs = Date.parse(startTime);

    expect(PLACE_RULE_CONFIG_V1.ruleVersion).toBe("PLACE_V2.0");
    expect(PLACE_RULE_CONFIG_V1.lockMinutesBeforeRace).toBe(1.5);
    expect(
      getRaceLockTimeMs(startTime, PLACE_RULE_CONFIG_V1),
    ).toBe(startMs - 90_000);
  });
});
