import { detectPdfFeatures } from "./pdfFeatureDetection"
import type { PdfLayoutWorkerPool } from "./pdfLayoutWorkerPool"
import {
  capturePageOverlayInput,
  completePageOverlay,
  type PageOverlayState,
} from "./pdfOverlayAnalysis"
import type { BibliographyMap } from "./structureDetector"

export async function analyzePageOverlayInWorker(
  pool: PdfLayoutWorkerPool,
  pageNumber: number,
  pageDiv: HTMLElement,
  bibliography: BibliographyMap,
): Promise<PageOverlayState | null> {
  const captured = capturePageOverlayInput(pageNumber, pageDiv)
  if (!captured) return null
  const detected = await pool.analyze(captured.input).catch(() => detectPdfFeatures(captured.input))
  if (!pageDiv.isConnected) return null
  return completePageOverlay(pageDiv, bibliography, captured, detected)
}
