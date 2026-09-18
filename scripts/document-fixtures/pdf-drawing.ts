import type { PDFFont, PDFPage } from "pdf-lib"
import { rgb } from "pdf-lib"

export type FixtureFonts = {
  readonly regular: PDFFont
  readonly bold: PDFFont
  readonly mono: PDFFont
}

export function drawPageHeader(page: PDFPage, pageNumber: number, fonts: FixtureFonts): void {
  page.drawText("Synthetic Document Fixture", {
    x: 36,
    y: 770,
    size: 9,
    font: fonts.regular,
    color: rgb(0.3, 0.3, 0.3),
  })
  page.drawText(`Page ${pageNumber}`, {
    x: 540,
    y: 770,
    size: 9,
    font: fonts.regular,
    color: rgb(0.3, 0.3, 0.3),
  })
  page.drawLine({
    start: { x: 36, y: 760 },
    end: { x: 564, y: 760 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  })
}

export function drawTextLines(
  page: PDFPage,
  lines: readonly string[],
  x: number,
  y: number,
  fonts: FixtureFonts,
): void {
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * 16,
      size: 9,
      font: fonts.regular,
      color: rgb(0.12, 0.12, 0.12),
    })
  })
}

export function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  fonts: FixtureFonts,
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 0.8,
    borderColor: rgb(0.25, 0.35, 0.6),
    color: rgb(0.94, 0.96, 1),
  })
  page.drawText(label, {
    x: x + 8,
    y: y + height - 18,
    size: 9,
    font: fonts.bold,
    color: rgb(0.1, 0.2, 0.45),
  })
}
