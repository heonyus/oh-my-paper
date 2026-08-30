import type { PDFPage } from "pdf-lib"
import { rgb } from "pdf-lib"
import { drawFixtureHeaderFooter, type FixturePageContext } from "./fixture-page-shared"

export function renderFixturePage1(page: PDFPage, context: FixturePageContext): void {
  drawFixtureHeaderFooter(page, 1, context)
  page.drawText("Scourgify: Deterministic Spatial PDF Fixture", {
    x: 50,
    y: 750,
    size: 16,
    font: context.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  page.drawText("Scourgify Research Team • Spatial Computing & Document Intelligence", {
    x: 50,
    y: 730,
    size: 9.5,
    font: context.regular,
    color: rgb(0.3, 0.3, 0.3),
  })
  page.drawRectangle({
    x: 50,
    y: 630,
    width: 495,
    height: 80,
    borderWidth: 0.75,
    borderColor: rgb(0.8, 0.8, 0.85),
    color: rgb(0.96, 0.97, 0.99),
  })
  page.drawText("Abstract", {
    x: 60,
    y: 695,
    size: 10,
    font: context.bold,
    color: rgb(0.15, 0.15, 0.15),
  })
  const abstract = [
    "Scourgify is a local-first spatial canvas engineered for rigorous scientific document reading,",
    "bidirectional card linking, and offline annotation. This deterministic multi-page fixture guarantees",
    "reproducible ingestion, robust text coordinate extraction, and structured tabular validation.",
  ]
  abstract.forEach((line, index) => {
    page.drawText(line, {
      x: 60,
      y: 678 - index * 13,
      size: 8.5,
      font: context.regular,
      color: rgb(0.2, 0.2, 0.2),
    })
  })
  page.drawText("1. Introduction and Architectural Motivation", {
    x: 50,
    y: 595,
    size: 12,
    font: context.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  const introduction = [
    "Scientific inquiry demands seamless cross-referencing between hypotheses, mathematical derivations,",
    "and tabular empirical evidence. Traditional linear PDF viewers constrain cognitive synthesis.",
    "Scourgify treats document pages as spatially addressable artifacts on an infinite vector canvas.",
    "Users excerpt verbatim passages into atomic cards, cluster findings, and preserve provenance links.",
  ]
  introduction.forEach((line, index) => {
    page.drawText(line, {
      x: 50,
      y: 575 - index * 14,
      size: 9,
      font: context.regular,
      color: rgb(0.2, 0.2, 0.2),
    })
  })
}
