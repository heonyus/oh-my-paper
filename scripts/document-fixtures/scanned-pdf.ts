import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { buildSyntheticPng } from "./image-png"

export async function buildScannedMixedPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.setTitle("Synthetic Scanned and Mixed Document")
  document.setAuthor("Synthetic Fixture Generator")
  document.setSubject("Image-only and mixed page test")
  document.setCreator("Scourgify Synthetic Fixtures")
  document.setCreationDate(new Date("2026-01-01T00:00:00.000Z"))
  document.setModificationDate(new Date("2026-01-01T00:00:00.000Z"))
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const image = await document.embedPng(buildSyntheticPng())
  const first = document.addPage([600, 800])
  first.drawImage(image, { x: 60, y: 560, width: 480, height: 180 })
  const second = document.addPage([600, 800])
  second.drawText("Text beside a synthetic scan", {
    x: 36,
    y: 720,
    size: 14,
    font: regular,
    color: rgb(0.1, 0.1, 0.1),
  })
  second.drawImage(image, { x: 36, y: 500, width: 360, height: 216 })
  return document.save({ useObjectStreams: false })
}
