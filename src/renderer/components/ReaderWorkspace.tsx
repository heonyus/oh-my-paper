import { type ComponentProps, type JSX, useCallback } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import type { DocumentInsight } from "../../shared/schemas"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import type { PreparedSummary } from "../lib/pdfDocumentFeatures"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import type {
  AiRequestRunner,
  BoardCard,
  BoardTool,
  CardId,
  DocumentRecord,
  Workspace,
} from "../types"
import { BoardViewport } from "./BoardViewport"
import { OutlinePanel } from "./OutlinePanel"
import { ResearchSidebar } from "./ResearchSidebar"

export function ReaderWorkspace(props: {
  readonly document: DocumentRecord | null
  readonly workspace: Workspace
  readonly updateWorkspace: (workspace: Workspace) => void
  readonly updateViewport: (viewport: Workspace["viewport"]) => void
  readonly currentPage: number
  readonly setPage: (page: number) => void
  readonly updateDocumentPage: (documentId: DocumentRecord["id"], page: number) => void
  readonly cards: readonly BoardCard[]
  readonly updateCards: (cards: readonly BoardCard[]) => void
  readonly previewCards: (cards: readonly BoardCard[]) => void
  readonly tool: BoardTool
  readonly setTool: (tool: BoardTool) => void
  readonly runAi: AiRequestRunner
  readonly provider: ProviderStatus
  readonly documentReady: boolean
  readonly citations: readonly CitationIndexEntry[]
  readonly insights: readonly DocumentInsight[]
  readonly updateInsight: ComponentProps<typeof ResearchSidebar>["onInsightChange"]
  readonly jumpToCard: (id: CardId) => void
  readonly onPrepared: (summary: PreparedSummary) => void
  readonly outline: readonly PdfOutlineEntry[]
  readonly outlineOpen: boolean
  readonly closeOutline: () => void
  readonly updateOutline: (outline: readonly PdfOutlineEntry[]) => void
  readonly jumpToPage: (page: number) => void
  readonly registerPageJump: (jump: (page: number) => void) => void
  readonly evidence: EvidenceNavigationTarget | null
  readonly dismissEvidence: () => void
  readonly importPdf: () => void
}): JSX.Element {
  const { document, workspace, updateWorkspace } = props
  const onViewportChange = props.updateViewport
  const documentId = document?.id
  const onPageActive = useCallback(
    (page: number): void => {
      if (!documentId) return
      props.setPage(page)
      props.updateDocumentPage(documentId, page)
    },
    [documentId, props.setPage, props.updateDocumentPage],
  )
  return (
    <>
      {props.outlineOpen ? (
        <OutlinePanel
          width={workspace.outlineWidth}
          onWidthChange={(outlineWidth) => updateWorkspace({ ...workspace, outlineWidth })}
          currentPage={props.currentPage}
          outline={props.outline}
          onClose={props.closeOutline}
          onJump={(page) => {
            props.setPage(page)
            props.jumpToPage(page)
          }}
        />
      ) : null}
      {document ? (
        <BoardViewport
          document={document}
          evidenceFocus={props.evidence?.hash === document.hash ? props.evidence : null}
          onDismissEvidence={props.dismissEvidence}
          viewport={workspace.viewport}
          cards={props.cards}
          onViewportChange={onViewportChange}
          onCardsChange={props.updateCards}
          onCardsPreview={props.previewCards}
          onDocumentLoaded={props.onPrepared}
          onPageActive={onPageActive}
          currentPage={props.currentPage}
          onOutlineChange={props.updateOutline}
          onRegisterPageJump={props.registerPageJump}
          onAiRequest={props.runAi}
          tool={props.tool}
          onToolChange={props.setTool}
          minimapVisible={workspace.minimapVisible}
          onMinimapVisibleChange={(minimapVisible) =>
            updateWorkspace({ ...workspace, minimapVisible })
          }
        />
      ) : (
        <section className="empty-board">
          <div>
            <h1>열린 논문이 없습니다</h1>
            <button type="button" className="primary-action" onClick={props.importPdf}>
              PDF 가져오기
            </button>
          </div>
        </section>
      )}
      <ResearchSidebar
        key={document?.id ?? "no-document"}
        document={document}
        currentPage={props.currentPage}
        cards={props.cards}
        citations={props.citations}
        insights={props.insights}
        expanded={workspace.sidebarOpen}
        width={workspace.researchSidebarWidth}
        onWidthChange={(researchSidebarWidth) =>
          updateWorkspace({ ...workspace, researchSidebarWidth })
        }
        provider={props.provider}
        documentReady={props.documentReady}
        onToggle={() => updateWorkspace({ ...workspace, sidebarOpen: !workspace.sidebarOpen })}
        onJumpToCard={props.jumpToCard}
        onCardsChange={props.updateCards}
        onAiRequest={props.runAi}
        onInsightChange={props.updateInsight}
        tool={props.tool}
        onToolChange={props.setTool}
      />
    </>
  )
}
