import type { FixtureEntry } from "./manifest"

type FixtureDefinition = Omit<FixtureEntry, "byteLength" | "sha256">

export const fixtureDefinitions: readonly FixtureDefinition[] = [
  {
    id: "structured-document",
    fileName: "structured-document.pdf",
    classes: [
      "multi-column-reading-order",
      "split-headings",
      "numeric-citations",
      "author-year-citations",
      "merged-cell-table",
      "multipart-figure-chart",
      "equations",
    ],
    parseExpectation: "valid",
    pageCount: 3,
    pages: [
      {
        number: 1,
        width: 600,
        height: 800,
        textLength: 256,
        objects: [
          { id: "p1-heading-split", kind: "heading" },
          { id: "p1-left-column", kind: "paragraph" },
          { id: "p1-right-column", kind: "paragraph" },
          { id: "p1-numeric-citation", kind: "citation-occurrence" },
          { id: "p1-author-year-citation", kind: "citation-occurrence" },
        ],
        sourceRanges: [
          { id: "p1-heading", start: 0, end: 32, text: "Split Heading: Spatial Evidence" },
          { id: "p1-numeric", start: 64, end: 96, text: "prior work [3, 5-7]" },
          { id: "p1-author-year", start: 128, end: 180, text: "(Rivera and Chen, 2024)" },
        ],
      },
      {
        number: 2,
        width: 600,
        height: 800,
        textLength: 320,
        objects: [
          { id: "p2-table", kind: "table" },
          { id: "p2-merged-cell", kind: "table-cell" },
          { id: "p2-figure", kind: "figure" },
          { id: "p2-chart", kind: "chart" },
          { id: "p2-display-equation", kind: "equation" },
        ],
        sourceRanges: [
          { id: "p2-table-caption", start: 8, end: 60, text: "Table 1. Merged cell test" },
          { id: "p2-figure-caption", start: 72, end: 105, text: "Figure 1. Multipart chart" },
          { id: "p2-equation", start: 160, end: 198, text: "E(x) = sum_i (x_i - mu_i)^2" },
        ],
      },
      {
        number: 3,
        width: 600,
        height: 800,
        textLength: 288,
        objects: [
          { id: "p3-inline-equation", kind: "equation" },
          { id: "p3-multiline-equation", kind: "equation" },
          { id: "p3-citation-reference", kind: "citation-reference" },
        ],
        sourceRanges: [
          { id: "p3-inline", start: 16, end: 31, text: "f(x)=x^2+1" },
          { id: "p3-multiline", start: 80, end: 150, text: "a_1 + a_2 = b\na_2 + a_3 = c" },
          { id: "p3-reference", start: 208, end: 260, text: "[3] Rivera, Synthetic Methods" },
        ],
      },
    ],
  },
  {
    id: "scanned-mixed-document",
    fileName: "scanned-mixed-document.pdf",
    classes: ["scanned-image-only", "mixed-text-image"],
    parseExpectation: "valid",
    pageCount: 2,
    pages: [
      {
        number: 1,
        width: 600,
        height: 800,
        textLength: 0,
        objects: [
          { id: "p1-scan", kind: "image" },
          { id: "p1-ocr-region", kind: "ocr-block" },
        ],
        sourceRanges: [],
      },
      {
        number: 2,
        width: 600,
        height: 800,
        textLength: 140,
        objects: [
          { id: "p2-image", kind: "image" },
          { id: "p2-text", kind: "paragraph" },
        ],
        sourceRanges: [
          { id: "p2-mixed-text", start: 0, end: 40, text: "Text beside a synthetic scan" },
        ],
      },
    ],
  },
  {
    id: "malformed-document",
    fileName: "malformed-document.pdf",
    classes: ["malformed-pdf"],
    parseExpectation: "malformed",
    pageCount: 0,
    pages: [],
  },
  {
    id: "encrypted-document",
    fileName: "encrypted-document.pdf",
    classes: ["encrypted-password"],
    parseExpectation: "encrypted",
    pageCount: 0,
    pages: [],
  },
] as const
