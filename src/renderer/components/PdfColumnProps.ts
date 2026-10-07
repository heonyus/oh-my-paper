import type { PreparedSummary } from "../lib/pdfDocumentFeatures"
import type { PdfFindRuntime } from "../lib/pdfFindRuntime"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import type { PdfRetrievalRuntime } from "../lib/pdfRetrievalRuntime"
import type { DetectedStructure } from "../lib/structureDetector"
import type { DocumentRecord } from "../types"

export type PdfColumnProps = {
  readonly document: DocumentRecord
  readonly zoom: number
  readonly onLoaded: (summary: PreparedSummary) => void
  readonly onPageActive: (page: number) => void
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onRegisterPageJump?: ((jump: (page: number) => void) => void) | undefined
  readonly onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined
  readonly onStructureTrigger?: ((structure: DetectedStructure) => void) | undefined
  readonly onRetrievalReady?: ((runtime: PdfRetrievalRuntime | null) => void) | undefined
  readonly onFindReady?: ((runtime: PdfFindRuntime | null) => void) | undefined
  readonly onScaleCommitted?: ((zoom: number) => void) | undefined
}
