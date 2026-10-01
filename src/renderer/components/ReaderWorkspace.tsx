import { type ComponentProps, type JSX, useCallback, useEffect, useMemo, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import type { ReaderNote } from "../../shared/readerNote"
import type { DocumentInsight } from "../../shared/schemas"
import { researchSidebarLayout } from "../../shared/uiLayout"
import type { SourceCitation } from "../lib/chatCitations"
import { useTranslator } from "../lib/locale"
import { earlierNoteParagraphs } from "../lib/noteTutor"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import type { PreparedSummary } from "../lib/pdfDocumentFeatures"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import { flashQuoteOnPage } from "../lib/sourceQuoteFlash"
import type { RegisterLiveNote } from "../lib/useReaderNote"
import { readerMessages } from "../messages/reader"
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
import type { PendingNoteQuote } from "./readerNote/noteQuote"
import { ReaderNotePane } from "./readerNote/ReaderNotePane"

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
  readonly runAi: AiRequestRunner
  readonly provider: ProviderStatus
  readonly documentReady: boolean
  readonly citations: readonly CitationIndexEntry[]
  readonly insights: readonly DocumentInsight[]
  readonly updateInsight: ComponentProps<typeof ResearchSidebar>["onInsightChange"]
  readonly noteOpen: boolean
  readonly openNote: () => void
  readonly closeNote: () => void
  readonly readerNote: ReaderNote | undefined
  readonly updateReaderNote: (markdown: string) => void
  readonly registerLiveNote?: RegisterLiveNote | undefined
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
  const t = useTranslator(readerMessages)
  const { document, workspace, updateWorkspace } = props
  const onViewportChange = props.updateViewport
  const documentId = document?.id
  const pageCount = document?.pageCount ?? 0
  const { setPage, jumpToPage } = props
  const navigateToSource = useCallback(
    (citation: SourceCitation): void => {
      if (citation.page > pageCount) return
      setPage(citation.page)
      jumpToPage(citation.page)
      if (citation.quote) flashQuoteOnPage(citation.page, citation.quote)
    },
    [pageCount, setPage, jumpToPage],
  )
  const [pendingQuote, setPendingQuote] = useState<PendingNoteQuote | null>(null)
  const openNote = props.openNote
  const sendToNote = useCallback(
    (page: number, quote: string): void => {
      setPendingQuote({ id: crypto.randomUUID(), page, quote })
      openNote()
    },
    [openNote],
  )
  const clearPendingQuote = useCallback(() => setPendingQuote(null), [])
  // The note lives in the research sidebar, so opening it opens a collapsed sidebar.
  const noteWanted = props.noteOpen && Boolean(document)
  useEffect(() => {
    if (noteWanted && !workspace.sidebarOpen) updateWorkspace({ ...workspace, sidebarOpen: true })
  }, [noteWanted, workspace, updateWorkspace])
  const earlierNotes = useMemo(
    () =>
      documentId
        ? earlierNoteParagraphs(
            workspace.readerNotes,
            new Map(workspace.documents.map((item) => [item.id, item.title])),
            documentId,
          )
        : [],
    [workspace.readerNotes, workspace.documents, documentId],
  )
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
          rightOcclusion={
            researchSidebarLayout.railWidth +
            (workspace.sidebarOpen ? workspace.researchSidebarWidth : 0)
          }
          onAiRequest={props.runAi}
          tool={props.tool}
          minimapVisible={workspace.minimapVisible}
          onMinimapVisibleChange={(minimapVisible) =>
            updateWorkspace({ ...workspace, minimapVisible })
          }
          onQuoteToNote={sendToNote}
        />
      ) : (
        <section className="empty-board">
          <div>
            <h1>{t("workspace.empty")}</h1>
            <button type="button" className="primary-action" onClick={props.importPdf}>
              {t("workspace.import")}
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
        onNavigateToSource={navigateToSource}
        noteOpen={Boolean(document) && props.noteOpen}
        onNoteOpenChange={(open) => (open ? props.openNote() : props.closeNote())}
        notePane={
          document ? (
            <ReaderNotePane
              document={document}
              note={props.readerNote}
              currentPage={props.currentPage}
              earlierNotes={earlierNotes}
              onAiRequest={props.runAi}
              onChange={props.updateReaderNote}
              onClose={props.closeNote}
              onNavigateToSource={navigateToSource}
              pendingQuote={pendingQuote}
              onPendingQuoteHandled={clearPendingQuote}
              registerLiveNote={props.registerLiveNote}
            />
          ) : null
        }
      />
    </>
  )
}
