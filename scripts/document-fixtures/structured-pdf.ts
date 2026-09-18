import { PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib"
import { drawBox, drawPageHeader, drawTextLines, type FixtureFonts } from "./pdf-drawing"

function pageOne(page: PDFPage, fonts: FixtureFonts): void {
  drawPageHeader(page, 1, fonts)
  page.drawText("Split Heading:", {
    x: 36,
    y: 720,
    size: 18,
    font: fonts.bold,
    color: rgb(0.08, 0.08, 0.08),
  })
  page.drawText("Spatial Evidence", {
    x: 36,
    y: 696,
    size: 18,
    font: fonts.bold,
    color: rgb(0.08, 0.08, 0.08),
  })
  drawTextLines(
    page,
    [
      "Left column preserves reading order across a narrow synthetic layout.",
      "It contains prior work [3, 5-7] and a short inline f(x)=x^2+1.",
      "The layout is deliberately deterministic for source-range tests.",
    ],
    36,
    650,
    fonts,
  )
  drawTextLines(
    page,
    [
      "Right column contains a separate evidence thread.",
      "A reference such as (Rivera and Chen, 2024) stays local.",
      "No external publication text is included in this fixture.",
    ],
    316,
    650,
    fonts,
  )
}

function pageTwo(page: PDFPage, fonts: FixtureFonts): void {
  drawPageHeader(page, 2, fonts)
  page.drawText("Tables, Figures, and Display Equations", {
    x: 36,
    y: 720,
    size: 15,
    font: fonts.bold,
    color: rgb(0.08, 0.08, 0.08),
  })
  page.drawText("Table 1. Merged cell test", {
    x: 36,
    y: 686,
    size: 10,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  drawBox(page, 36, 550, 250, 112, "Merged header cell", fonts)
  page.drawLine({
    start: { x: 36, y: 604 },
    end: { x: 286, y: 604 },
    thickness: 0.6,
    color: rgb(0.3, 0.3, 0.4),
  })
  page.drawLine({
    start: { x: 160, y: 550 },
    end: { x: 160, y: 604 },
    thickness: 0.6,
    color: rgb(0.3, 0.3, 0.4),
  })
  page.drawText("A", { x: 70, y: 575, size: 10, font: fonts.regular })
  page.drawText("B", { x: 205, y: 575, size: 10, font: fonts.regular })
  page.drawText("Figure 1. Multipart chart", {
    x: 320,
    y: 686,
    size: 10,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.1),
  })
  drawBox(page, 320, 596, 110, 66, "Panel A", fonts)
  drawBox(page, 440, 596, 110, 66, "Panel B", fonts)
  page.drawText("E(x) = sum_i (x_i - mu_i)^2", {
    x: 36,
    y: 480,
    size: 11,
    font: fonts.mono,
    color: rgb(0.08, 0.15, 0.35),
  })
  drawTextLines(
    page,
    [
      "A display equation remains a distinct object.",
      "Panel ownership is recorded separately from its caption.",
    ],
    36,
    445,
    fonts,
  )
}

function pageThree(page: PDFPage, fonts: FixtureFonts): void {
  drawPageHeader(page, 3, fonts)
  page.drawText("Equation Edge Cases and References", {
    x: 36,
    y: 720,
    size: 15,
    font: fonts.bold,
    color: rgb(0.08, 0.08, 0.08),
  })
  page.drawText("Inline: f(x)=x^2+1", { x: 36, y: 680, size: 10, font: fonts.regular })
  page.drawText("a_1 + a_2 = b", {
    x: 36,
    y: 630,
    size: 11,
    font: fonts.mono,
    color: rgb(0.08, 0.15, 0.35),
  })
  page.drawText("a_2 + a_3 = c", {
    x: 36,
    y: 610,
    size: 11,
    font: fonts.mono,
    color: rgb(0.08, 0.15, 0.35),
  })
  drawTextLines(
    page,
    [
      "The multiline expression above is one logical fixture object.",
      "Reference entry: [3] Rivera, Synthetic Methods",
      "The author name is synthetic and not a personal document.",
    ],
    36,
    555,
    fonts,
  )
}

export async function buildStructuredPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.setTitle("Synthetic Structured Document")
  document.setAuthor("Synthetic Fixture Generator")
  document.setSubject("Deterministic document structure test")
  document.setCreator("Scourgify Synthetic Fixtures")
  document.setCreationDate(new Date("2026-01-01T00:00:00.000Z"))
  document.setModificationDate(new Date("2026-01-01T00:00:00.000Z"))
  const fonts: FixtureFonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
  }
  const pageSize: [number, number] = [600, 800]
  const first = document.addPage(pageSize)
  pageOne(first, fonts)
  const second = document.addPage(pageSize)
  pageTwo(second, fonts)
  const third = document.addPage(pageSize)
  pageThree(third, fonts)
  return document.save({ useObjectStreams: false })
}
