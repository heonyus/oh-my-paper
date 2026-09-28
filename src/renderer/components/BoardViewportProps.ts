import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import type { PreparedSummary } from "../lib/pdfDocumentFeatures"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import type { AiRequestRunner, BoardCard, BoardTool, DocumentRecord, Viewport } from "../types"

export type BoardViewportProps = {
  readonly document: DocumentRecord
  readonly evidenceFocus?: EvidenceNavigationTarget | null
  readonly onDismissEvidence?: () => void
  readonly viewport: Viewport
  readonly cards: readonly BoardCard[]
  readonly onViewportChange: (viewport: Viewport) => void
  readonly onCardsChange: (cards: readonly BoardCard[]) => void
  readonly onCardsPreview: (cards: readonly BoardCard[]) => void
  readonly onDocumentLoaded: (summary: PreparedSummary) => void
  readonly onPageActive: (page: number) => void
  readonly currentPage: number
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onRegisterPageJump?: ((jump: (page: number) => void) => void) | undefined
  readonly onAiRequest: AiRequestRunner
  readonly tool: BoardTool
  readonly onToolChange: (tool: BoardTool) => void
  readonly minimapVisible: boolean
  /** Screen width the research sidebar covers on the right of the board. */
  readonly rightOcclusion?: number | undefined
  readonly onMinimapVisibleChange: (visible: boolean) => void
}
