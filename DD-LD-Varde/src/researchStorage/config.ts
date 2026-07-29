import type { ResearchCaptureTarget } from "./types";

export const RESEARCH_STORAGE_SCHEMA_VERSION =
  "RESEARCH_STORAGE_V1.0";

export const RESEARCH_METRICS_VERSION =
  "RESEARCH_METRICS_V1.0";

export const RESEARCH_SAMPLING_VERSION =
  "RESEARCH_SAMPLING_V1.1";

export type ResearchStorageConfig = {
  schemaVersion: string;
  metricsVersion: string;
  samplingVersion: string;

  collectionStartSecondsBeforeRace: number;

  minuteDataRetentionDays: number;
  minuteDataRetentionEnabled: boolean;

  maxValidOddsDecimal: number;
  invalidOddsDecimals: readonly number[];

  permanentCaptureTargets:
    readonly ResearchCaptureTarget[];
};

export const RESEARCH_STORAGE_CONFIG_V1 = {
  schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
  metricsVersion: RESEARCH_METRICS_VERSION,
  samplingVersion: RESEARCH_SAMPLING_VERSION,

  collectionStartSecondsBeforeRace: 60 * 60,

  minuteDataRetentionDays: 14,
  minuteDataRetentionEnabled: false,

  maxValidOddsDecimal: 200,
  invalidOddsDecimals: [99.99],

  permanentCaptureTargets: [
    {
      captureType: "START",
      targetSecondsBeforeStart: 3600,
      toleranceSeconds: 120,
    },
    {
      captureType: "T30",
      targetSecondsBeforeStart: 1800,
      toleranceSeconds: 75,
    },
    {
      captureType: "T15",
      targetSecondsBeforeStart: 900,
      toleranceSeconds: 75,
    },

    {
      captureType: "T10",
      targetSecondsBeforeStart: 600,
      toleranceSeconds: 40,
    },
    {
      captureType: "T9",
      targetSecondsBeforeStart: 540,
      toleranceSeconds: 40,
    },
    {
      captureType: "T8",
      targetSecondsBeforeStart: 480,
      toleranceSeconds: 40,
    },
    {
      captureType: "T7",
      targetSecondsBeforeStart: 420,
      toleranceSeconds: 40,
    },
    {
      captureType: "T6",
      targetSecondsBeforeStart: 360,
      toleranceSeconds: 40,
    },
    {
      captureType: "T5",
      targetSecondsBeforeStart: 300,
      toleranceSeconds: 40,
    },
    {
      captureType: "T4",
      targetSecondsBeforeStart: 240,
      toleranceSeconds: 40,
    },
    {
      captureType: "T3",
      targetSecondsBeforeStart: 180,
      toleranceSeconds: 40,
    },
    {
      captureType: "T2",
      targetSecondsBeforeStart: 120,
      toleranceSeconds: 35,
    },

    {
      captureType: "LOCK",
      targetSecondsBeforeStart: 90,
      toleranceSeconds: 65,
    },

    {
      captureType: "T1",
      targetSecondsBeforeStart: 60,
      toleranceSeconds: 35,
    },
  ],
} satisfies ResearchStorageConfig;
