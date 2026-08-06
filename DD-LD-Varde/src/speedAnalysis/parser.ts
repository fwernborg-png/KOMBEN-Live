import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist";

import pdfWorkerUrl
  from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  classifySpeedCellFromRgba,
  probableLeaderBorderScoreFromRgba,
  normalizeHorseName,
  normalizeSpeedText,
  normalizeTrackKey,
  parseCompactDate,
  parseRankText,
  parseSpeedFilenameMetadata,
} from "./logic";

import type {
  SpeedAnalysisDocument,
  SpeedAnalysisProduct,
  SpeedAnalysisRunner,
} from "./types";

GlobalWorkerOptions.workerSrc =
  pdfWorkerUrl;

type LoadingTask =
  ReturnType<
    typeof getDocument
  >;

type PdfDocument =
  Awaited<
    LoadingTask["promise"]
  >;

type PdfPage =
  Awaited<
    ReturnType<
      PdfDocument["getPage"]
    >
  >;

type PositionedText = {
  text: string;

  x0: number;
  x1: number;

  top: number;
  bottom: number;

  centerX: number;
  centerY: number;
};

type ParsedSection = {
  product: SpeedAnalysisProduct;
  legNumber: number;

  x0: number;
  x1: number;

  header:
    PositionedText;
};

type RenderedPage = {
  canvas:
    HTMLCanvasElement;

  context:
    CanvasRenderingContext2D;

  pageWidth: number;
  pageHeight: number;
};

type CellBounds = {
  x0: number;
  x1: number;
};

type RawTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function isRawTextItem(
  value: unknown,
): value is RawTextItem {
  if (
    typeof value !==
      "object" ||
    value === null
  ) {
    return false;
  }

  const record =
    value as
      Record<
        string,
        unknown
      >;

  return (
    typeof record.str ===
      "string" &&
    Array.isArray(
      record.transform,
    ) &&
    record.transform.length >=
      6 &&
    typeof record.width ===
      "number" &&
    typeof record.height ===
      "number"
  );
}

async function extractTextItems(
  page: PdfPage,
): Promise<PositionedText[]> {
  const viewport =
    page.getViewport({
      scale: 1,
    });

  const content =
    await page.getTextContent();

  return content.items
    .flatMap(
      (
        value,
      ): PositionedText[] => {
        if (
          !isRawTextItem(
            value,
          )
        ) {
          return [];
        }

        const x0 =
          value.transform[4];

        const baselineY =
          value.transform[5];

        const textHeight =
          value.height > 0
            ? value.height
            : Math.hypot(
                value.transform[2],
                value.transform[3],
              );

        const bottom =
          viewport.height -
          baselineY;

        const top =
          bottom -
          textHeight;

        const text =
          value.str.trim();

        if (!text) {
          return [];
        }

        return [
          {
            text,

            x0,

            x1:
              x0 +
              value.width,

            top,
            bottom,

            centerX:
              x0 +
              value.width /
                2,

            centerY:
              top +
              textHeight /
                2,
          },
        ];
      },
    );
}

async function renderPage(
  page: PdfPage,
): Promise<RenderedPage> {
  const scale = 2;

  const baseViewport =
    page.getViewport({
      scale: 1,
    });

  const viewport =
    page.getViewport({
      scale,
    });

  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    Math.ceil(
      viewport.width,
    );

  canvas.height =
    Math.ceil(
      viewport.height,
    );

  const context =
    canvas.getContext(
      "2d",
      {
        willReadFrequently:
          true,
      },
    );

  if (!context) {
    throw new Error(
      "Webbläsaren kunde inte skapa en bildyta för PDF-filen.",
    );
  }

  await page.render({
    canvasContext:
      context,

    viewport,
  }).promise;

  return {
    canvas,
    context,

    pageWidth:
      baseViewport.width,

    pageHeight:
      baseViewport.height,
  };
}

function sampleRgba(
  rendered:
    RenderedPage,
  args: {
    x0: number;
    x1: number;

    y0: number;
    y1: number;
  },
): Uint8ClampedArray {
  const scaleX =
    rendered.canvas.width /
    rendered.pageWidth;

  const scaleY =
    rendered.canvas.height /
    rendered.pageHeight;

  const sourceX =
    Math.max(
      0,
      Math.floor(
        args.x0 *
        scaleX,
      ),
    );

  const sourceY =
    Math.max(
      0,
      Math.floor(
        args.y0 *
        scaleY,
      ),
    );

  const sourceWidth =
    Math.max(
      1,
      Math.min(
        rendered.canvas.width -
          sourceX,
        Math.ceil(
          (
            args.x1 -
            args.x0
          ) *
          scaleX,
        ),
      ),
    );

  const sourceHeight =
    Math.max(
      1,
      Math.min(
        rendered.canvas.height -
          sourceY,
        Math.ceil(
          (
            args.y1 -
            args.y0
          ) *
          scaleY,
        ),
      ),
    );

  return rendered.context
    .getImageData(
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    )
    .data;
}

function detectSections(
  items:
    PositionedText[],
  pageWidth: number,
): ParsedSection[] {
  const headers =
    items
      .map(
        (item) => {
          const match =
            item.text.match(
              /^(V85|V86)-([1-8])$/i,
            );

          if (!match) {
            return null;
          }

          return {
            item,

            product:
              match[1]
                .toUpperCase() as
                SpeedAnalysisProduct,

            legNumber:
              Number(
                match[2],
              ),
          };
        },
      )
      .filter(
        (
          value,
        ): value is {
          item:
            PositionedText;

          product:
            SpeedAnalysisProduct;

          legNumber:
            number;
        } =>
          value !== null,
      )
      .sort(
        (a, b) =>
          a.item.x0 -
          b.item.x0,
      );

  if (
    !headers.length
  ) {
    return [];
  }

  if (
    headers.length === 1
  ) {
    return [
      {
        product:
          headers[0].product,

        legNumber:
          headers[0].legNumber,

        x0: 0,
        x1:
          pageWidth,

        header:
          headers[0].item,
      },
    ];
  }

  const sectionWidth =
    pageWidth /
    headers.length;

  return headers.map(
    (
      header,
      index,
    ) => ({
      product:
        header.product,

      legNumber:
        header.legNumber,

      x0:
        sectionWidth *
        index,

      x1:
        sectionWidth *
        (
          index + 1
        ),

      header:
        header.item,
    }),
  );
}

function findColumnHeader(
  items:
    PositionedText[],
  section:
    ParsedSection,
  target: string,
): PositionedText | null {
  const normalizedTarget =
    normalizeSpeedText(
      target,
    );

  const candidates =
    items.filter(
      (item) =>
        item.centerX >=
          section.x0 &&
        item.centerX <
          section.x1 &&
        item.top >=
          section.header.bottom -
            4 &&
        item.top <=
          section.header.bottom +
            75 &&
        normalizeSpeedText(
          item.text,
        ) ===
          normalizedTarget,
    );

  return candidates.sort(
    (a, b) =>
      a.top -
        b.top ||
      a.x0 -
        b.x0,
  )[0] ?? null;
}

function rowEndY(
  items:
    PositionedText[],
  section:
    ParsedSection,
  startY: number,
  pageHeight: number,
): number {
  const omItem =
    items
      .filter(
        (item) =>
          item.x0 >=
            section.x0 &&
          item.x0 <=
            section.x0 +
              105 &&
          item.top >
            startY &&
          normalizeSpeedText(
            item.text,
          ) === "om",
      )
      .sort(
        (a, b) =>
          a.top -
          b.top,
      )[0];

  return (
    omItem?.top ??
    pageHeight *
      0.78
  );
}

function quantizeX(
  value: number,
): number {
  return (
    Math.round(
      value /
      2,
    ) *
    2
  );
}

function deriveDriverStartX(
  items:
    PositionedText[],
  section:
    ParsedSection,
  rowBounds:
    Array<{
      top: number;
      bottom: number;
    }>,
  spetsHeader:
    PositionedText,
): number {
  const counts =
    new Map<
      number,
      number
    >();

  const regionStart =
    section.x0 +
    82;

  const regionEnd =
    spetsHeader.x0 -
    20;

  for (
    const bounds of
    rowBounds
  ) {
    const rowItems =
      items.filter(
        (item) =>
          item.centerY >=
            bounds.top &&
          item.centerY <
            bounds.bottom &&
          item.x0 >=
            regionStart &&
          item.x0 <
            regionEnd &&
          /[A-Za-zÅÄÖåäö]/.test(
            item.text,
          ),
      );

    for (
      const item of
      rowItems
    ) {
      const key =
        quantizeX(
          item.x0,
        );

      counts.set(
        key,
        (
          counts.get(
            key,
          ) ??
          0
        ) +
          1,
      );
    }
  }

  const minimumCluster =
    Math.max(
      2,
      Math.floor(
        rowBounds.length *
        0.25,
      ),
    );

  const candidates =
    [...counts.entries()]
      .filter(
        ([
          x,
          count,
        ]) =>
          count >=
            minimumCluster &&
          x >=
            regionStart &&
          x <
            regionEnd,
      )
      .sort(
        (a, b) =>
          b[1] -
            a[1] ||
          a[0] -
            b[0],
      );

  if (
    candidates.length
  ) {
    return candidates[0][0];
  }

  return (
    section.x0 +
    (
      spetsHeader.x0 -
      section.x0
    ) *
      0.58
  );
}

function extractTextInCell(
  items:
    PositionedText[],
  bounds:
    CellBounds,
  rowTop: number,
  rowBottom: number,
): string {
  return items
    .filter(
      (item) =>
        item.centerX >=
          bounds.x0 &&
        item.centerX <
          bounds.x1 &&
        item.centerY >=
          rowTop &&
        item.centerY <
          rowBottom,
    )
    .sort(
      (a, b) =>
        a.x0 -
        b.x0,
    )
    .map(
      (item) =>
        item.text,
    )
    .join(" ")
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function speedCellBounds(
  bot:
    PositionedText,
  s1000:
    PositionedText,
  s500:
    PositionedText,
): {
  bot: CellBounds;
  s1000: CellBounds;
  s500: CellBounds;
} {
  const botCenter =
    bot.centerX;

  const s1000Center =
    s1000.centerX;

  const s500Center =
    s500.centerX;

  const botToS1000 =
    s1000Center -
    botCenter;

  const s1000ToS500 =
    s500Center -
    s1000Center;

  return {
    bot: {
      x0:
        botCenter -
        botToS1000 /
          2,

      x1:
        (
          botCenter +
          s1000Center
        ) /
        2,
    },

    s1000: {
      x0:
        (
          botCenter +
          s1000Center
        ) /
        2,

      x1:
        (
          s1000Center +
          s500Center
        ) /
        2,
    },

    s500: {
      x0:
        (
          s1000Center +
          s500Center
        ) /
        2,

      x1:
        s500Center +
        s1000ToS500 /
          2,
    },
  };
}

function parseSection(
  items:
    PositionedText[],
  rendered:
    RenderedPage,
  section:
    ParsedSection,
  pageNumber: number,
  warnings: string[],
): SpeedAnalysisRunner[] {
  const spetsHeader =
    findColumnHeader(
      items,
      section,
      "Spets",
    );

  const botHeader =
    findColumnHeader(
      items,
      section,
      "BOT",
    );

  const s1000Header =
    findColumnHeader(
      items,
      section,
      "S1000",
    );

  const s500Header =
    findColumnHeader(
      items,
      section,
      "S500",
    );

  const rankHeader =
    findColumnHeader(
      items,
      section,
      "Rank",
    );

  if (
    !spetsHeader ||
    !botHeader ||
    !s1000Header ||
    !s500Header ||
    !rankHeader
  ) {
    warnings.push(
      `${section.product}-${section.legNumber}: samtliga tabellrubriker kunde inte hittas på sida ${pageNumber}.`,
    );

    return [];
  }

  const tableStartY =
    Math.max(
      spetsHeader.bottom,
      botHeader.bottom,
      s1000Header.bottom,
      s500Header.bottom,
      rankHeader.bottom,
    ) +
    1;

  const tableEndY =
    rowEndY(
      items,
      section,
      tableStartY,
      rendered.pageHeight,
    );

  const numberItems =
    items
      .map(
        (item) => {
          const numeric =
            Number(
              item.text,
            );

          return {
            item,
            numeric,
          };
        },
      )
      .filter(
        (
          candidate,
        ): candidate is {
          item:
            PositionedText;

          numeric:
            number;
        } =>
          Number.isInteger(
            candidate.numeric,
          ) &&
          candidate.numeric >=
            1 &&
          candidate.numeric <=
            20 &&
          candidate.item.x0 >=
            section.x0 +
              8 &&
          candidate.item.x0 <=
            section.x0 +
              58 &&
          candidate.item.centerY >
            tableStartY &&
          candidate.item.centerY <
            tableEndY,
      )
      .sort(
        (a, b) =>
          a.item.centerY -
            b.item.centerY,
      );

  const uniqueNumbers =
    new Map<
      number,
      PositionedText
    >();

  for (
    const candidate of
    numberItems
  ) {
    if (
      !uniqueNumbers.has(
        candidate.numeric,
      )
    ) {
      uniqueNumbers.set(
        candidate.numeric,
        candidate.item,
      );
    }
  }

  const rows =
    [...uniqueNumbers.entries()]
      .map(
        ([
          runnerNumber,
          numberItem,
        ]) => ({
          runnerNumber,
          numberItem,
        }),
      )
      .sort(
        (a, b) =>
          a.numberItem.centerY -
          b.numberItem.centerY,
      );

  if (
    rows.length < 3
  ) {
    warnings.push(
      `${section.product}-${section.legNumber}: bara ${rows.length} startnummer hittades på sida ${pageNumber}.`,
    );

    return [];
  }

  const rowBounds =
    rows.map(
      (
        row,
        index,
      ) => {
        const previousCenter =
          rows[index - 1]
            ?.numberItem
            .centerY;

        const nextCenter =
          rows[index + 1]
            ?.numberItem
            .centerY;

        const top =
          previousCenter ===
          undefined
            ? tableStartY
            : (
                previousCenter +
                row.numberItem
                  .centerY
              ) /
              2;

        const bottom =
          nextCenter ===
          undefined
            ? Math.min(
                tableEndY,
                row.numberItem
                  .centerY +
                  (
                    row.numberItem
                      .centerY -
                    (
                      previousCenter ??
                      tableStartY
                    )
                  ) /
                    2,
              )
            : (
                row.numberItem
                  .centerY +
                nextCenter
              ) /
              2;

        return {
          top,
          bottom,
        };
      },
    );

  const driverStartX =
    deriveDriverStartX(
      items,
      section,
      rowBounds,
      spetsHeader,
    );

  const leaderScores =
    new Map<number, number>();

  const cells =
    speedCellBounds(
      botHeader,
      s1000Header,
      s500Header,
    );

  const spetsBounds = {
    x0:
      spetsHeader.x0 -
      4,

    x1:
      spetsHeader.x1 +
      7,
  };

  const rankBounds = {
    x0:
      rankHeader.x0 -
      10,

    x1:
      rankHeader.x1 +
      11,
  };

  const parsedRows =
    rows.map(
      (
        row,
        index,
      ) => {
      const bounds =
        rowBounds[index];

      const horseName =
        items
          .filter(
            (item) =>
              item.centerY >=
                bounds.top &&
              item.centerY <
                bounds.bottom &&
              item.x0 >
                row.numberItem.x1 +
                  1 &&
              item.centerX <
                driverStartX -
                  1,
          )
          .sort(
            (a, b) =>
              a.x0 -
              b.x0,
          )
          .map(
            (item) =>
              item.text,
          )
          .join(" ")
          .replace(
            /\s+/g,
            " ",
          )
          .trim();

      const safeHorseName =
        horseName ||
        `Häst ${row.runnerNumber}`;

      if (!horseName) {
        warnings.push(
          `${section.product}-${section.legNumber}, nummer ${row.runnerNumber}: hästnamnet kunde inte läsas säkert.`,
        );
      }

      const botText =
        extractTextInCell(
          items,
          cells.bot,
          bounds.top,
          bounds.bottom,
        );

      const s1000Text =
        extractTextInCell(
          items,
          cells.s1000,
          bounds.top,
          bounds.bottom,
        );

      const s500Text =
        extractTextInCell(
          items,
          cells.s500,
          bounds.top,
          bounds.bottom,
        );

      const rankText =
        extractTextInCell(
          items,
          rankBounds,
          bounds.top,
          bounds.bottom,
        );

      const spetsText =
        extractTextInCell(
          items,
          spetsBounds,
          bounds.top,
          bounds.bottom,
        );

      const insetTop =
        bounds.top +
        1;

      const insetBottom =
        Math.max(
          insetTop + 1,
          bounds.bottom -
            1,
        );

      const botColor =
        classifySpeedCellFromRgba(
          sampleRgba(
            rendered,
            {
              x0:
                cells.bot.x0 +
                1,

              x1:
                cells.bot.x1 -
                1,

              y0:
                insetTop,

              y1:
                insetBottom,
            },
          ),
        );

      const s1000Color =
        classifySpeedCellFromRgba(
          sampleRgba(
            rendered,
            {
              x0:
                cells.s1000.x0 +
                1,

              x1:
                cells.s1000.x1 -
                1,

              y0:
                insetTop,

              y1:
                insetBottom,
            },
          ),
        );

      const s500Color =
        classifySpeedCellFromRgba(
          sampleRgba(
            rendered,
            {
              x0:
                cells.s500.x0 +
                1,

              x1:
                cells.s500.x1 -
                1,

              y0:
                insetTop,

              y1:
                insetBottom,
            },
          ),
        );

      const leaderScore =
        probableLeaderBorderScoreFromRgba(
          sampleRgba(
            rendered,
            {
              x0:
                spetsBounds.x0 -
                2,

              x1:
                spetsBounds.x1 +
                2,

              y0:
                Math.max(
                  tableStartY,
                  bounds.top +
                    1,
                ),

              y1:
                Math.min(
                  tableEndY,
                  bounds.bottom -
                    1,
                ),
            },
          ),
        );

      leaderScores.set(
        row.runnerNumber,
        leaderScore,
      );

      return {
        legNumber:
          section.legNumber,

        runnerNumber:
          row.runnerNumber,

        horseName:
          safeHorseName,

        normalizedHorseName:
          normalizeHorseName(
            safeHorseName,
          ),

        spetsText,

        botText,
        s1000Text,
        s500Text,

        botColor,
        s1000Color,
        s500Color,

        probableLeader:
          false,

        rankPosition:
          parseRankText(
            rankText,
          ),

        rankText,

        sourcePage:
          pageNumber,
      };
    },
  );

  const leaderCandidate =
    [...leaderScores.entries()]
      .sort(
        (a, b) =>
          b[1] -
          a[1],
      )[0] ??
    null;

  const leaderRunnerNumber =
    leaderCandidate &&
    leaderCandidate[1] >=
      0.006
      ? leaderCandidate[0]
      : null;

  return parsedRows.map(
    (runner) => ({
      ...runner,

      probableLeader:
        runner.runnerNumber ===
        leaderRunnerNumber,

      ownProbableLeader:
        false,
    }),
  );
}

function extractMetadata(
  firstPageItems:
    PositionedText[],
  filename: string,
): {
  product:
    SpeedAnalysisProduct | null;

  raceDate: string | null;

  trackName: string;
} {
  const filenameMetadata =
    parseSpeedFilenameMetadata(
      filename,
    );

  const topItems =
    firstPageItems.filter(
      (item) =>
        item.top <
        105,
    );

  const productItem =
    topItems.find(
      (item) =>
        /^(V85|V86)$/i.test(
          item.text,
        ),
    );

  const product =
    productItem
      ? (
          productItem.text
            .toUpperCase() as
            SpeedAnalysisProduct
        )
      : filenameMetadata.product;

  const compactDateItem =
    topItems.find(
      (item) =>
        /^\d{6}$/.test(
          item.text,
        ),
    );

  const raceDate =
    compactDateItem
      ? parseCompactDate(
          compactDateItem.text,
        )
      : filenameMetadata.raceDate;

  const trackCandidates =
    topItems
      .filter(
        (item) =>
          item.x0 >
            550 &&
          /[A-Za-zÅÄÖåäö]/.test(
            item.text,
          ) &&
          !/^(V85|V86)$/i.test(
            item.text,
          ) &&
          normalizeSpeedText(
            item.text,
          ) !==
            "speedanalysen",
      )
      .sort(
        (a, b) =>
          (
            b.bottom -
            b.top
          ) -
            (
              a.bottom -
              a.top
            ) ||
          a.x0 -
            b.x0,
      );

  const trackName =
    trackCandidates[0]
      ?.text
      .trim() ||
    filenameMetadata.trackName;

  return {
    product,
    raceDate,
    trackName,
  };
}

export async function parseSpeedAnalysisPdf(
  file: File,
): Promise<SpeedAnalysisDocument> {
  if (
    file.type &&
    file.type !==
      "application/pdf" &&
    !file.name
      .toLowerCase()
      .endsWith(
        ".pdf",
      )
  ) {
    throw new Error(
      "Filen måste vara en PDF.",
    );
  }

  const bytes =
    new Uint8Array(
      await file.arrayBuffer(),
    );

  const loadingTask =
    getDocument({
      data: bytes,

      isEvalSupported:
        false,
    });

  const pdf =
    await loadingTask.promise;

  const parserWarnings:
    string[] = [];

  try {
    const firstPage =
      await pdf.getPage(1);

    const firstPageItems =
      await extractTextItems(
        firstPage,
      );

    firstPage.cleanup();

    const metadata =
      extractMetadata(
        firstPageItems,
        file.name,
      );

    const runners:
      SpeedAnalysisRunner[] = [];

    const detectedProducts =
      new Set<
        SpeedAnalysisProduct
      >();

    for (
      let pageNumber = 2;
      pageNumber <=
        pdf.numPages;
      pageNumber += 1
    ) {
      const page =
        await pdf.getPage(
          pageNumber,
        );

      const items =
        await extractTextItems(
          page,
        );

      const baseViewport =
        page.getViewport({
          scale: 1,
        });

      const sections =
        detectSections(
          items,
          baseViewport.width,
        );

      if (
        !sections.length
      ) {
        page.cleanup();
        continue;
      }

      const rendered =
        await renderPage(
          page,
        );

      for (
        const section of
        sections
      ) {
        detectedProducts.add(
          section.product,
        );

        runners.push(
          ...parseSection(
            items,
            rendered,
            section,
            pageNumber,
            parserWarnings,
          ),
        );
      }

      page.cleanup();
    }

    if (
      !runners.length
    ) {
      throw new Error(
        "Inga V85- eller V86-tabeller kunde läsas ur PDF-filen.",
      );
    }

    const detectedProduct =
      detectedProducts.size ===
      1
        ? [...detectedProducts][0]
        : null;

    const product =
      detectedProduct ??
      metadata.product;

    if (!product) {
      throw new Error(
        "Det gick inte att avgöra om PDF-filen gäller V85 eller V86.",
      );
    }

    if (
      metadata.product &&
      detectedProduct &&
      metadata.product !==
        detectedProduct
    ) {
      parserWarnings.push(
        `Omslaget anger ${metadata.product}, medan loppsidorna anger ${detectedProduct}. Loppsidorna används.`,
      );
    }

    const raceDate =
      metadata.raceDate ??
      "";

    const trackName =
      metadata.trackName.trim();

    const deduplicated =
      new Map<
        string,
        SpeedAnalysisRunner
      >();

    for (
      const runner of
      runners
    ) {
      deduplicated.set(
        `${runner.legNumber}:${runner.runnerNumber}`,
        runner,
      );
    }

    return {
      product,

      raceDate,

      trackName,

      trackKey:
        normalizeTrackKey(
          trackName,
        ),

      sourceFilename:
        file.name,

      pageCount:
        pdf.numPages,

      runners:
        [...deduplicated.values()]
          .sort(
            (a, b) =>
              a.legNumber -
                b.legNumber ||
              a.runnerNumber -
                b.runnerNumber,
          ),

      parserWarnings,
    };
  } finally {
    await pdf.destroy();
  }
}
