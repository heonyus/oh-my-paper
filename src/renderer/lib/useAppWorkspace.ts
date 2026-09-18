import { useCallback, useEffect, useMemo, useState } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"
import type { PreparationUpdate, ProviderStatus } from "../../shared/ipc"
import type { KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import type { BoardTool, Workspace } from "../types"
import type { WorkspaceViewMode } from "./knowledgeTypes"
import type { CitationIndexEntry } from "./pdfCitationIndex"
import type { PreparedSummary } from "./pdfDocumentFeatures"
import type { PdfOutlineEntry } from "./pdfOutline"
import { applyPreparedSummary, completedPreparation } from "./preparationState"
import { useBoardCardJump } from "./researchSidebarActions"
import { useActiveCards } from "./useActiveCards"
import { initialOcrProviderStatus, initialProviderStatus, useAppBootstrap } from "./useAppBootstrap"
import { useDocumentAnalysisQueue } from "./useDocumentAnalysisQueue"
import { useDocumentImportFlow } from "./useDocumentImportFlow"
import { useDocumentInsights } from "./useDocumentInsights"
import { useEvidenceNavigation } from "./useEvidenceNavigation"
import { useKnowledgeClientOps } from "./useKnowledgeClientOps"
import { usePaperAiRequest } from "./usePaperAiRequest"
import { usePostItShortcut } from "./usePostItShortcut"
import { useWorkspaceHistory } from "./useWorkspaceHistory"
import { useWorkspacePersistence } from "./useWorkspacePersistence"

export function useAppWorkspace() {
  const history = useWorkspaceHistory()
  const [preparation, setPreparation] = useState<PreparationUpdate[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [viewMode, setMode] = useState<WorkspaceViewMode>("reader")
  const setViewMode = useCallback((mode: WorkspaceViewMode): void => {
    setMode(mode)
    if (mode === "reader") setLibraryOpen(false)
  }, [])
  const [selectedKnowledgeNodeId, setSelectedKnowledgeNodeId] = useState<KnowledgeNodeId | null>(
    null,
  )
  const [documentReady, setDocumentReady] = useState(false)
  const [tool, setTool] = useState<BoardTool>("select")
  const [provider, setProvider] = useState<ProviderStatus>(initialProviderStatus)
  const [ocrStatus, setOcrStatus] = useState<DocumentOcrProviderStatus>(initialOcrProviderStatus)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const activeId = history.workspace?.activeDocumentId ?? null
  const [outline, setOutline] = useState<{
    readonly documentId: Workspace["activeDocumentId"]
    readonly entries: readonly PdfOutlineEntry[]
  } | null>(null)
  const [citations, setCitations] = useState<{
    readonly documentId: Workspace["activeDocumentId"]
    readonly entries: readonly CitationIndexEntry[]
  } | null>(null)

  usePostItShortcut(setTool)
  const workspaceSaveFailed = useWorkspacePersistence(
    history.workspace,
    history.setWorkspaceTransient,
  )
  const documentAnalysisJobs = useDocumentAnalysisQueue()
  const knowledgeClientOps = useKnowledgeClientOps()
  const openReader = useCallback(() => {
    setViewMode("reader")
    setLibraryOpen(false)
  }, [setViewMode])
  const evidence = useEvidenceNavigation({
    client: knowledgeClientOps,
    workspace: history.workspace,
    readerVisible: viewMode === "reader" && !libraryOpen,
    updateWorkspace: history.setWorkspaceTransient,
    openReader,
    setPage: setCurrentPage,
    onError: setBootstrapError,
  })
  const updateOutline = useCallback(
    (next: readonly PdfOutlineEntry[]): void => {
      setOutline({ documentId: activeId, entries: next })
    },
    [activeId],
  )
  const updateViewport = useCallback(
    (next: Workspace["viewport"]): void => {
      history.setWorkspaceTransient((current) =>
        current ? { ...current, viewport: next } : current,
      )
    },
    [history.setWorkspaceTransient],
  )

  useAppBootstrap({
    preparation,
    resetWorkspace: history.resetWorkspace,
    setPreparation,
    setProvider,
    setOcrStatus,
    setBootstrapError,
  })

  const activeDocument = useMemo(
    () =>
      history.workspace?.documents.find(
        (document) => document.id === history.workspace?.activeDocumentId,
      ) ?? null,
    [history.workspace],
  )
  useEffect(() => {
    setCurrentPage(activeDocument?.lastReadPage ?? 1)
  }, [activeDocument])
  const updateDocumentPage = useCallback(
    (documentId: Workspace["activeDocumentId"], page: number): void => {
      if (!documentId) return
      history.setWorkspaceTransient((current) => {
        if (!current) return current
        const document = current.documents.find((candidate) => candidate.id === documentId)
        if (!document) return current
        const nextPage = Math.min(Math.max(Math.trunc(page), 1), document.pageCount)
        if (document.lastReadPage === nextPage) return current
        return {
          ...current,
          documents: current.documents.map((candidate) =>
            candidate.id === documentId ? { ...candidate, lastReadPage: nextPage } : candidate,
          ),
        }
      })
    },
    [history.setWorkspaceTransient],
  )
  const {
    cards: activeCards,
    update: updateCards,
    preview: previewCards,
  } = useActiveCards(
    history.workspace,
    activeDocument?.id ?? null,
    history.setWorkspace,
    history.setWorkspaceTransient,
  )
  const { insights: activeInsights, update: updateInsight } = useDocumentInsights(
    history.workspace,
    activeDocument?.id,
    history.setWorkspace,
  )
  const runAi = usePaperAiRequest(activeDocument, activeInsights)
  const activeOverviewReady =
    Boolean(activeDocument?.overview) ||
    new Set(activeInsights.map((insight) => insight.kind)).size === 3

  const beginImport = useCallback((): void => {
    setPreparation([])
    setDocumentReady(false)
    setOutline(null)
    setCitations(null)
  }, [])
  const registerImportedDocument = useCallback(
    (next: Workspace, document: Workspace["documents"][number]): void => {
      history.resetWorkspace(next)
      setDocumentReady(document.overview.length > 0)
    },
    [history.resetWorkspace],
  )
  const {
    progress: importProgress,
    importPdf,
    importDroppedPdfs,
  } = useDocumentImportFlow({ onStart: beginImport, onImported: registerImportedDocument })

  const finishPreparation = useCallback(
    (summary: PreparedSummary): void => {
      const activeId = activeDocument?.id
      if (!activeId) return
      history.setWorkspace((current) =>
        current ? applyPreparedSummary(current, activeId, summary) : current,
      )
      setDocumentReady(true)
      if (!activeDocument.overview) setPreparation([...completedPreparation(summary)])
      setCitations({ documentId: activeId, entries: summary.citations ?? [] })
      evidence.onPrepared()
    },
    [activeDocument?.id, activeDocument?.overview, history.setWorkspace, evidence.onPrepared],
  )
  const jumpToCard = useBoardCardJump(activeCards, history.setWorkspace, setCurrentPage)

  return {
    ...history,
    preparation,
    setPreparation,
    currentPage,
    setCurrentPage,
    updateDocumentPage,
    outlineOpen,
    setOutlineOpen,
    libraryOpen,
    setLibraryOpen,
    viewMode,
    setViewMode,
    selectedKnowledgeNodeId,
    setSelectedKnowledgeNodeId,
    documentReady,
    setDocumentReady,
    tool,
    setTool,
    provider,
    setProvider,
    ocrStatus,
    setOcrStatus,
    bootstrapError,
    outline: outline?.documentId === activeId ? outline.entries : [],
    citations: citations?.documentId === activeId ? citations.entries : [],
    workspaceSaveFailed,
    documentAnalysisJobs,
    knowledgeClientOps,
    evidence,
    activeDocument,
    activeCards,
    updateCards,
    previewCards,
    activeInsights,
    updateInsight,
    runAi,
    activeOverviewReady,
    importProgress,
    importPdf,
    importDroppedPdfs,
    finishPreparation,
    jumpToCard,
    updateOutline,
    updateViewport,
    readerMode: viewMode === "reader",
    libraryView: viewMode === "reader" && libraryOpen,
  } as const
}
