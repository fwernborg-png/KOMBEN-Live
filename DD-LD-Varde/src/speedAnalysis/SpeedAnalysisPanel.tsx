import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  isInterestingSpeedMarker,
  normalizeHorseName,
  normalizeTrackKey,
  validateSpeedAnalysisDocument,
} from "./logic";

import {
  loadSpeedAnalysisMarkersByDate,
  saveSpeedAnalysisDocument,
} from "./repository";

import type {
  SpeedAnalysisDocument,
  SpeedAnalysisMarker,
  SpeedAnalysisRunner,
  SpeedCellColor,
} from "./types";

import "./speedAnalysis.css";

const COLOR_OPTIONS:
  Array<{
    value: SpeedCellColor;
    label: string;
  }> = [
    {
      value: "GREEN",
      label: "Grön",
    },
    {
      value: "YELLOW",
      label: "Gul",
    },
    {
      value: "RED",
      label: "Röd",
    },
    {
      value: "NONE",
      label: "Ingen",
    },
  ];

function colorClass(
  color: SpeedCellColor,
): string {
  return `is-${color.toLowerCase()}`;
}

function groupedByLeg<
  T extends {
    legNumber: number;
  },
>(
  rows: T[],
): Array<
  [
    number,
    T[],
  ]
> {
  const grouped =
    new Map<
      number,
      T[]
    >();

  for (
    const row of
    rows
  ) {
    const current =
      grouped.get(
        row.legNumber,
      ) ?? [];

    current.push(
      row,
    );

    grouped.set(
      row.legNumber,
      current,
    );
  }

  return [...grouped.entries()]
    .sort(
      (a, b) =>
        a[0] -
        b[0],
    )
    .map(
      ([
        legNumber,
        legRows,
      ]) => [
        legNumber,

        [...legRows].sort(
          (a, b) =>
            (
              "runnerNumber" in a
                ? Number(
                    a.runnerNumber,
                  )
                : 0
            ) -
            (
              "runnerNumber" in b
                ? Number(
                    b.runnerNumber,
                  )
                : 0
            ),
        ),
      ],
    );
}

function countGreen(
  document:
    SpeedAnalysisDocument,
  key:
    | "botColor"
    | "s1000Color"
    | "s500Color",
): number {
  return document.runners.filter(
    (runner) =>
      runner[key] ===
      "GREEN",
  ).length;
}

function markerBadges(
  marker:
    SpeedAnalysisMarker,
) {
  const doubleGreen =
    marker.s1000Color ===
      "GREEN" &&
    marker.s500Color ===
      "GREEN";

  return (
    <div className="speed-analysis-badge-row">
      {doubleGreen ? (
        <span className="speed-analysis-badge is-double">
          S1000 + S500
        </span>
      ) : (
        <>
          {marker.s1000Color === "GREEN" ? (
            <span className="speed-analysis-badge is-green">
              S1000
            </span>
          ) : null}

          {marker.s500Color === "GREEN" ? (
            <span className="speed-analysis-badge is-green">
              S500
            </span>
          ) : null}
        </>
      )}

      {marker.botColor === "GREEN" ? (
        <span className="speed-analysis-badge is-bot">
          BOT
        </span>
      ) : null}

      {marker.probableLeader ? (
        <span className="speed-analysis-badge is-spets">
          PDF-SPETS
        </span>
      ) : null}

      {marker.ownProbableLeader ? (
        <span className="speed-analysis-badge is-own-spets">
          EGEN SPETS
        </span>
      ) : null}

      {marker.rankPosition !== null &&
      marker.rankPosition <= 3 ? (
        <span className="speed-analysis-badge is-rank">
          RANK {marker.rankPosition}
        </span>
      ) : null}
    </div>
  );
}

export function SpeedAnalysisPanel(
  {
    activeDate,
    onImportSaved,
  }: {
    activeDate: string;

    onImportSaved:
      (
        raceDate: string,
      ) => void;
  },
) {
  const [
    document,
    setDocument,
  ] = useState<
    SpeedAnalysisDocument | null
  >(null);

  const [
    existingMarkers,
    setExistingMarkers,
  ] = useState<
    SpeedAnalysisMarker[]
  >([]);

  const [
    parsing,
    setParsing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    loadingExisting,
    setLoadingExisting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  useEffect(() => {
    let cancelled =
      false;

    async function loadExisting() {
      setLoadingExisting(true);

      try {
        const markers =
          await loadSpeedAnalysisMarkersByDate(
            activeDate,
          );

        if (!cancelled) {
          setExistingMarkers(
            markers,
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setExistingMarkers(
            [],
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Speedanalysen kunde inte läsas.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingExisting(false);
        }
      }
    }

    void loadExisting();

    return () => {
      cancelled = true;
    };
  }, [activeDate]);

  const validation =
    useMemo(
      () =>
        document
          ? validateSpeedAnalysisDocument(
              document,
            )
          : {
              errors: [],
              warnings: [],
            },
      [document],
    );

  const existingInteresting =
    useMemo(
      () =>
        existingMarkers.filter(
          isInterestingSpeedMarker,
        ),
      [existingMarkers],
    );

  const existingGroups =
    useMemo(
      () =>
        groupedByLeg(
          existingInteresting,
        ),
      [existingInteresting],
    );

  async function parseFile(
    file:
      File | undefined,
  ) {
    if (!file) {
      return;
    }

    setParsing(true);
    setError("");
    setMessage("");
    setDocument(null);

    try {
      const {
        parseSpeedAnalysisPdf,
      } = await import(
        "./parser"
      );

      const parsed =
        await parseSpeedAnalysisPdf(
          file,
        );

      setDocument(
        parsed,
      );

      const parsedValidation =
        validateSpeedAnalysisDocument(
          parsed,
        );

      setMessage(
        parsedValidation.errors.length
          ? `PDF-filen lästes, men ${parsedValidation.errors.length} kontrollfel måste granskas före import.`
          : `PDF-filen lästes: ${parsed.runners.length} hästar och åtta ${parsed.product}-avdelningar.`,
      );
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "PDF-filen kunde inte läsas.",
      );
    } finally {
      setParsing(false);
    }
  }

  function updateMetadata(
    patch:
      Partial<
        Pick<
          SpeedAnalysisDocument,
          | "product"
          | "raceDate"
          | "trackName"
        >
      >,
  ) {
    setDocument(
      (current) =>
        current
          ? {
              ...current,
              ...patch,

              trackKey:
                normalizeTrackKey(
                  patch.trackName ??
                  current.trackName,
                ),
            }
          : current,
    );
  }

  function updateRunner(
    legNumber: number,
    runnerNumber: number,
    patch:
      Partial<
        SpeedAnalysisRunner
      >,
  ) {
    setDocument(
      (current) =>
        current
          ? {
              ...current,

              runners:
                current.runners.map(
                  (runner) =>
                    runner.legNumber ===
                      legNumber &&
                    runner.runnerNumber ===
                      runnerNumber
                      ? {
                          ...runner,
                          ...patch,

                          normalizedHorseName:
                            patch.horseName !==
                            undefined
                              ? normalizeHorseName(
                                  patch.horseName,
                                )
                              : runner.normalizedHorseName,
                        }
                      : runner,
                ),
            }
          : current,
    );
  }

  function setOwnLeader(
    legNumber: number,
    runnerNumber: number | null,
  ) {
    setDocument(
      (current) =>
        current
          ? {
              ...current,

              runners:
                current.runners.map(
                  (runner) =>
                    runner.legNumber ===
                    legNumber
                      ? {
                          ...runner,

                          ownProbableLeader:
                            runnerNumber !==
                              null &&
                            runner.runnerNumber ===
                              runnerNumber,
                        }
                      : runner,
                ),
            }
          : current,
    );
  }

  async function saveImport() {
    if (!document) {
      return;
    }

    const currentValidation =
      validateSpeedAnalysisDocument(
        document,
      );

    if (
      currentValidation.errors.length
    ) {
      setError(
        "Importen stoppades. Rätta kontrollfelen först.",
      );

      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await saveSpeedAnalysisDocument(
        document,
      );

      const markers =
        await loadSpeedAnalysisMarkersByDate(
          document.raceDate,
        );

      setExistingMarkers(
        markers,
      );

      onImportSaved(
        document.raceDate,
      );

      setMessage(
        `${document.product} ${document.trackName} ${document.raceDate} är sparad. Markeringarna visas nu bredvid hästarna i loppvyn.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Importen kunde inte sparas.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tab-section speed-analysis-panel">
      <header className="speed-analysis-header">
        <div>
          <p className="speed-analysis-kicker">
            SPEEDANALYSEN
          </p>

          <h2>
            Importera V85/V86-PDF
          </h2>

          <p>
            PDF-filen läses lokalt i webbläsaren.
            Själva filen sparas inte. Endast bana,
            datum, hästar, färger, spetsmarkering
            och ranking lagras.
          </p>
        </div>

        <label className="speed-analysis-upload">
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={
              parsing ||
              saving
            }
            onChange={
              (event) => {
                const file =
                  event.currentTarget
                    .files?.[0];

                event.currentTarget.value =
                  "";

                void parseFile(
                  file,
                );
              }
            }
          />

          {parsing
            ? "Läser PDF…"
            : "Välj PDF"}
        </label>
      </header>

      {error ? (
        <div className="speed-analysis-message is-error">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="speed-analysis-message">
          {message}
        </div>
      ) : null}

      {document ? (
        <section className="speed-analysis-preview">
          <div className="speed-analysis-preview-heading">
            <div>
              <span>
                FÖRHANDSKONTROLL
              </span>

              <strong>
                Kontrollera innan import
              </strong>
            </div>

            <button
              type="button"
              disabled={
                saving ||
                validation.errors.length >
                  0
              }
              onClick={
                () =>
                  void saveImport()
              }
            >
              {saving
                ? "Sparar…"
                : "Godkänn och spara"}
            </button>
          </div>

          <div className="speed-analysis-metadata">
            <label>
              Produkt

              <select
                value={
                  document.product
                }
                onChange={
                  (event) =>
                    updateMetadata({
                      product:
                        event.target
                          .value as
                          SpeedAnalysisDocument["product"],
                    })
                }
              >
                <option value="V85">
                  V85
                </option>

                <option value="V86">
                  V86
                </option>
              </select>
            </label>

            <label>
              Datum

              <input
                type="date"
                value={
                  document.raceDate
                }
                onChange={
                  (event) =>
                    updateMetadata({
                      raceDate:
                        event.target
                          .value,
                    })
                }
              />
            </label>

            <label>
              Bana

              <input
                value={
                  document.trackName
                }
                onChange={
                  (event) =>
                    updateMetadata({
                      trackName:
                        event.target
                          .value,
                    })
                }
              />
            </label>

            <div className="speed-analysis-source">
              <span>Källfil</span>
              <strong>
                {document.sourceFilename}
              </strong>
            </div>
          </div>

          <div className="speed-analysis-summary">
            <article>
              <span>Avdelningar</span>
              <strong>
                {
                  new Set(
                    document.runners.map(
                      (runner) =>
                        runner.legNumber,
                    ),
                  ).size
                }
              </strong>
            </article>

            <article>
              <span>Hästar</span>
              <strong>
                {document.runners.length}
              </strong>
            </article>

            <article>
              <span>BOT grön</span>
              <strong>
                {countGreen(
                  document,
                  "botColor",
                )}
              </strong>
            </article>

            <article>
              <span>S1000 grön</span>
              <strong>
                {countGreen(
                  document,
                  "s1000Color",
                )}
              </strong>
            </article>

            <article>
              <span>S500 grön</span>
              <strong>
                {countGreen(
                  document,
                  "s500Color",
                )}
              </strong>
            </article>

            <article>
              <span>PDF-spets</span>
              <strong>
                {
                  document.runners.filter(
                    (runner) =>
                      runner.probableLeader,
                  ).length
                }
              </strong>
            </article>

            <article>
              <span>Egna spetsval</span>
              <strong>
                {
                  document.runners.filter(
                    (runner) =>
                      runner.ownProbableLeader,
                  ).length
                }
              </strong>
            </article>
          </div>

          {validation.errors.length ? (
            <div className="speed-analysis-validation is-error">
              <strong>
                Importen är stoppad:
              </strong>

              {validation.errors.map(
                (validationError) => (
                  <span
                    key={
                      validationError
                    }
                  >
                    {validationError}
                  </span>
                ),
              )}
            </div>
          ) : (
            <div className="speed-analysis-validation is-ok">
              <strong>
                Grundkontrollen är godkänd.
              </strong>

              <span>
                Alla åtta avdelningar och minst
                40 hästar har hittats.
              </span>
            </div>
          )}

          {validation.warnings.length ? (
            <div className="speed-analysis-validation is-warning">
              <strong>
                Kontrollera:
              </strong>

              {validation.warnings.map(
                (warning) => (
                  <span
                    key={warning}
                  >
                    {warning}
                  </span>
                ),
              )}
            </div>
          ) : null}

          <div className="speed-analysis-leg-list">
            {groupedByLeg(
              document.runners,
            ).map(
              ([
                legNumber,
                runners,
              ]) => (
                <details
                  key={legNumber}
                  open={
                    legNumber === 1
                  }
                  className="speed-analysis-leg"
                >
                  <summary>
                    <strong>
                      {document.product}-
                      {legNumber}
                    </strong>

                    <span>
                      {runners.length}
                      {" "}hästar
                    </span>
                  </summary>

                  <div className="speed-analysis-own-toolbar">
                    <span>
                      PDF-spetsen är låst som originaldata.
                      Egen spets är frivillig.
                    </span>

                    <button
                      type="button"
                      disabled={
                        !runners.some(
                          (runner) =>
                            runner.ownProbableLeader,
                        )
                      }
                      onClick={
                        () =>
                          setOwnLeader(
                            legNumber,
                            null,
                          )
                      }
                    >
                      Rensa eget val
                    </button>
                  </div>

                  <div className="speed-analysis-table-wrap">
                    <table className="speed-analysis-table">
                      <thead>
                        <tr>
                          <th>Nr</th>
                          <th>Häst</th>
                          <th>PDF-spets</th>
                          <th>Egen spets</th>
                          <th>BOT</th>
                          <th>S1000</th>
                          <th>S500</th>
                          <th>Rank</th>
                        </tr>
                      </thead>

                      <tbody>
                        {runners.map(
                          (runner) => (
                            <tr
                              key={
                                `${legNumber}-${runner.runnerNumber}`
                              }
                            >
                              <td>
                                <strong>
                                  {runner.runnerNumber}
                                </strong>
                              </td>

                              <td>
                                <input
                                  className="speed-analysis-horse-input"
                                  value={
                                    runner.horseName
                                  }
                                  onChange={
                                    (event) =>
                                      updateRunner(
                                        legNumber,
                                        runner.runnerNumber,
                                        {
                                          horseName:
                                            event.target
                                              .value,
                                        },
                                      )
                                  }
                                />

                                <small>
                                  Sida
                                  {" "}
                                  {runner.sourcePage}
                                </small>
                              </td>

                              <td>
                                <div className="speed-analysis-pdf-spets">
                                  {runner.probableLeader ? (
                                    <span className="speed-analysis-badge is-spets">
                                      PDF-SPETS
                                    </span>
                                  ) : (
                                    <span className="speed-analysis-muted">
                                      –
                                    </span>
                                  )}

                                  <small>
                                    {runner.spetsText ||
                                      "–"}
                                  </small>
                                </div>
                              </td>

                              <td>
                                <label className="speed-analysis-own-choice">
                                  <input
                                    type="radio"
                                    name={
                                      `own-speed-leader-${legNumber}`
                                    }
                                    checked={
                                      runner.ownProbableLeader
                                    }
                                    onChange={
                                      () =>
                                        setOwnLeader(
                                          legNumber,
                                          runner.runnerNumber,
                                        )
                                    }
                                  />

                                  <span>
                                    Egen spets
                                  </span>
                                </label>
                              </td>

                              {(
                                [
                                  [
                                    "botColor",
                                    "botText",
                                  ],
                                  [
                                    "s1000Color",
                                    "s1000Text",
                                  ],
                                  [
                                    "s500Color",
                                    "s500Text",
                                  ],
                                ] as const
                              ).map(
                                ([
                                  colorKey,
                                  textKey,
                                ]) => (
                                  <td
                                    key={
                                      colorKey
                                    }
                                    className={
                                      colorClass(
                                        runner[colorKey],
                                      )
                                    }
                                  >
                                    <select
                                      value={
                                        runner[colorKey]
                                      }
                                      onChange={
                                        (event) =>
                                          updateRunner(
                                            legNumber,
                                            runner.runnerNumber,
                                            {
                                              [colorKey]:
                                                event.target
                                                  .value as
                                                  SpeedCellColor,
                                            },
                                          )
                                      }
                                    >
                                      {COLOR_OPTIONS.map(
                                        (option) => (
                                          <option
                                            key={
                                              option.value
                                            }
                                            value={
                                              option.value
                                            }
                                          >
                                            {option.label}
                                          </option>
                                        ),
                                      )}
                                    </select>

                                    <small>
                                      {runner[textKey] ||
                                        "–"}
                                    </small>
                                  </td>
                                ),
                              )}

                              <td>
                                <input
                                  className="speed-analysis-rank-input"
                                  type="number"
                                  min="1"
                                  max="20"
                                  value={
                                    runner.rankPosition ??
                                    ""
                                  }
                                  placeholder={
                                    runner.rankText ||
                                    "–"
                                  }
                                  onChange={
                                    (event) =>
                                      updateRunner(
                                        legNumber,
                                        runner.runnerNumber,
                                        {
                                          rankPosition:
                                            event.target
                                              .value
                                              ? Number(
                                                  event.target
                                                    .value,
                                                )
                                              : null,
                                        },
                                      )
                                  }
                                />
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              ),
            )}
          </div>
        </section>
      ) : null}

      <section className="speed-analysis-existing">
        <div className="speed-analysis-preview-heading">
          <div>
            <span>
              SPARAD SPEEDANALYS
            </span>

            <strong>
              {activeDate}
            </strong>
          </div>

          <small>
            {loadingExisting
              ? "Läser…"
              : `${existingInteresting.length} markerade hästar`}
          </small>
        </div>

        {existingGroups.length ? (
          <div className="speed-analysis-existing-grid">
            {existingGroups.map(
              ([
                legNumber,
                markers,
              ]) => (
                <article
                  key={legNumber}
                  className="speed-analysis-existing-card"
                >
                  <h3>
                    {markers[0]?.product}-
                    {legNumber}
                  </h3>

                  {markers.map(
                    (marker) => (
                      <div
                        key={
                          marker.id ??
                          `${marker.legNumber}-${marker.runnerNumber}`
                        }
                        className="speed-analysis-existing-runner"
                      >
                        <div>
                          <strong>
                            {marker.runnerNumber}.
                            {" "}
                            {marker.horseName}
                          </strong>

                          <small>
                            {marker.trackName}
                          </small>
                        </div>

                        {markerBadges(
                          marker,
                        )}
                      </div>
                    ),
                  )}
                </article>
              ),
            )}
          </div>
        ) : (
          <p className="speed-analysis-empty">
            Ingen Speedanalys är sparad för valt datum.
          </p>
        )}
      </section>
    </section>
  );
}
