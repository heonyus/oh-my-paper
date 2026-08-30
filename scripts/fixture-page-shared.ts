import type { PDFFont, PDFPage } from "pdf-lib"
import { rgb } from "pdf-lib"

export type FixturePageContext = {
  readonly regular: PDFFont
  readonly bold: PDFFont
  readonly mono: PDFFont
}

export function drawFixtureHeaderFooter(
  page: PDFPage,
  number: number,
  context: FixturePageContext,
): void {
  const { width } = page.getSize()
  page.drawText("Scourgify Technical Report — Deterministic Test Fixture", {
    x: 50,
    y: 800,
    size: 8.5,
    font: context.regular,
    color: rgb(0.4, 0.4, 0.4),
  })
  page.drawLine({
    start: { x: 50, y: 792 },
    end: { x: width - 50, y: 792 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  })
  page.drawText(`Page ${number} of 3`, {
    x: width / 2 - 25,
    y: 35,
    size: 8.5,
    font: context.regular,
    color: rgb(0.4, 0.4, 0.4),
  })
}
