import {
  useState,
} from "react";

import {
  ResearchHistoryPanel,
} from "./ResearchHistoryPanel";

import {
  ResearchGallopPanel,
} from "./ResearchGallopPanel";

import {
  ResearchCollectionStatusPanel,
} from "./ResearchCollectionStatusPanel";

import "./researchHistory.css";

type ResearchHistoryMode =
  | "TROT"
  | "GALLOP"
  | "STATUS";

export function ResearchHistoryHub() {
  const [
    mode,
    setMode,
  ] = useState<ResearchHistoryMode>(
    "TROT",
  );

  return (
    <div className="research-history-hub">
      <nav
        className="research-sport-tabs"
        aria-label="Historik och analys – sport"
      >
        <button
          type="button"
          className={
            mode === "TROT"
              ? "is-active"
              : ""
          }
          onClick={() =>
            setMode("TROT")
          }
        >
          <span aria-hidden="true">
            🐎
          </span>

          Trav
        </button>

        <button
          type="button"
          className={
            mode === "GALLOP"
              ? "is-active"
              : ""
          }
          onClick={() =>
            setMode("GALLOP")
          }
        >
          <span aria-hidden="true">
            🏇
          </span>

          Galopp
        </button>

        <button
          type="button"
          className={
            mode === "STATUS"
              ? "is-active"
              : ""
          }
          onClick={() =>
            setMode("STATUS")
          }
        >
          <span aria-hidden="true">
            📡
          </span>

          Insamlingsstatus
        </button>
      </nav>

      {mode === "TROT" ? (
        <ResearchHistoryPanel />
      ) : mode === "GALLOP" ? (
        <ResearchGallopPanel />
      ) : (
        <ResearchCollectionStatusPanel />
      )}
    </div>
  );
}
