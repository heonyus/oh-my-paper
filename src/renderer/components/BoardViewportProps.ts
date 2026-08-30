import type { PdfOutlineEntry } from "../lib/pdfOutline"
import type { AiRequestRunner, BoardCard, BoardTool, DocumentRecord, Viewport } from "../types"
import type { PreparedSummary } from "./PdfColumn"

export type BoardViewportProps = {
  readonly document: DocumentRecord
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
  readonly onMinimapVisibleChange: (visible: boolean) => void
}
