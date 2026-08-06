export type SpeedAnalysisProduct =
  | "V85"
  | "V86";

export type SpeedCellColor =
  | "GREEN"
  | "YELLOW"
  | "RED"
  | "NONE";

export type SpeedAnalysisRunner = {
  legNumber: number;
  runnerNumber: number;

  horseName: string;
  normalizedHorseName: string;

  spetsText: string;

  botText: string;
  s1000Text: string;
  s500Text: string;

  botColor: SpeedCellColor;
  s1000Color: SpeedCellColor;
  s500Color: SpeedCellColor;

  probableLeader: boolean;
  ownProbableLeader: boolean;

  rankPosition: number | null;
  rankText: string;

  sourcePage: number;
};

export type SpeedAnalysisDocument = {
  product: SpeedAnalysisProduct;

  raceDate: string;

  trackName: string;
  trackKey: string;

  sourceFilename: string;
  pageCount: number;

  runners: SpeedAnalysisRunner[];

  parserWarnings: string[];
};

export type SpeedAnalysisMarker =
  SpeedAnalysisRunner & {
    id: string | null;
    importId: string | null;

    product: SpeedAnalysisProduct;

    raceDate: string;

    trackName: string;
    trackKey: string;

    sourceFilename: string;
  };

export type SpeedAnalysisValidation = {
  errors: string[];
  warnings: string[];
};

export type SpeedAnalysisInterest =
  | "HOT"
  | "EXTRA"
  | "INFO"
  | null;
