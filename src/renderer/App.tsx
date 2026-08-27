import { FolderOpen } from "lucide-react"
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type AiRequest,
  type PreparationUpdate,
  type ProviderStatus,
  preparationSteps,
} from "../shared/ipc"
import { LeftRail, Topbar } from "./components/AppChrome"
import { BoardViewport } from "./components/BoardViewport"
import { LibraryPanel } from "./components/LibraryPanel"
import { OutlinePanel } from "./components/OutlinePanel"
import type { PreparedSummary } from "./components/PdfColumn"
import { PreparationProgress } from "./components/PreparationProgress"
import { ResearchSidebar } from "./components/ResearchSidebar"
import { SettingsModal } from "./components/SettingsModal"
import type { CitationIndexEntry } from "./lib/pdfCitationIndex"
import type { PdfOutlineEntry } from "./lib/pdfOutline"
import { applyPreparedSummary, completedPreparation } from "./lib/preparationState"
import { useBoardCardJump } from "./lib/researchSidebarActions"
import { useWorkspaceHistory } from "./lib/useWorkspaceHistory"
import type { BoardCard, BoardTool, Workspace } from "./types"

export function App(): JSX.Element {
  const { workspace, setWorkspace, resetWorkspace, undo, redo, canUndo, canRedo } =
    useWorkspaceHistory()
  const [preparation, setPreparation] = useState<PreparationUpdate[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [tool, setTool] = useState<BoardTool>("select")
  const [provider, setProvider] = useState<ProviderStatus>({
    configured: false,
    provider: "openai",
    model: "gpt-5",
  })
  const [outline, setOutline] = useState<readonly PdfOutlineEntry[]>([])
  const [citations, setCitations] = useState<readonly CitationIndexEntry[]>([])
  const pageJumpRef = useRef<(page: number) => void>(() => {})
  const registerPageJump = useCallback((jump: (page: number) => void): void => {
    pageJumpRef.current = jump
  }, [])
  const updateOutline = useCallback((next: readonly PdfOutlineEntry[]): void => {
    setOutline(next)
  }, [])
  const updateViewport = useCallback(
    (next: Workspace["viewport"]): void => {
      setWorkspace((current) => (current ? { ...current, viewport: next } : current))
    },
    [setWorkspace],
  )

  useEffect(() => {
    void window.hotebook.readWorkspace().then(resetWorkspace)
    void window.hotebook.providerStatus().then(setProvider)
    return window.hotebook.onPreparation((update) => {
      setPreparation((current) => [...current.filter((item) => item.step !== update.step), update])
    })
  }, [resetWorkspace])

  useEffect(() => {
    if (workspace) void window.hotebook.saveWorkspace(workspace)
  }, [workspace])

  useEffect(() => {
    const complete =
      preparation.length === preparationSteps.length &&
      preparation.every((update) => update.state === "complete")
    if (!complete) return
    const timer = window.setTimeout(() => setPreparation([]), 1_600)
    return () => window.clearTimeout(timer)
  }, [preparation])

  const activeDocument = useMemo(
    () =>
      workspace?.documents.find((document) => document.id === workspace.activeDocumentId) ?? null,
    [workspace],
  )
  const activeCards = useMemo(
    () => workspace?.cards.filter((card) => card.documentId === activeDocument?.id) ?? [],
    [workspace, activeDocument],
  )

  const updateCards = useCallback(
    (cards: readonly BoardCard[]): void => {
      const activeId = activeDocument?.id
      if (!activeId) return
      setWorkspace((current) => {
        if (!current) return current
        return {
          ...current,
          cards: [...current.cards.filter((card) => card.documentId !== activeId), ...cards],
        }
      })
    },
    [activeDocument?.id, setWorkspace],
  )

  const finishPreparation = useCallback(
    (summary: PreparedSummary): void => {
      const activeId = activeDocument?.id
      if (!activeId) return
      setWorkspace((current) =>
        current ? applyPreparedSummary(current, activeId, summary) : current,
      )
      setPreparation([...completedPreparation(summary)])
      setCitations(summary.citations ?? [])
    },
    [activeDocument?.id, setWorkspace],
  )

  async function importPdf(): Promise<void> {
    setPreparation([])
    setOutline([])
    setCitations([])
    const result = await window.hotebook.importDocument()
    if (!result) return
    const current = await window.hotebook.readWorkspace()
    resetWorkspace({ ...current, activeDocumentId: result.document.id })
  }

  async function runAi(request: Omit<AiRequest, "documentId">): Promise<string> {
    if (!activeDocument) throw new Error("active document is missing")
    const result = await window.hotebook.runAi({
      ...request,
      documentId: activeDocument.id,
    })
    return result.text
  }

  const jumpToCard = useBoardCardJump(activeCards, setWorkspace, setCurrentPage)

  if (!workspace) return <main className="loading-screen">Hotebook을 여는 중…</main>

  return (
    <main className="app-shell" data-outline-open={outlineOpen}>
      <Topbar
        viewport={workspace.viewport}
        onViewportChange={(viewport) => setWorkspace({ ...workspace, viewport })}
        tool={tool}
        onToolChange={setTool}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
      />
      <LeftRail
        active={libraryOpen ? "library" : "documents"}
        onLibrary={() => setLibraryOpen(true)}
        onDocuments={() => setLibraryOpen(false)}
        onSettings={() => setSettingsOpen(true)}
      />
      {outlineOpen ? (
        <OutlinePanel
          currentPage={currentPage}
          outline={outline}
          onClose={() => setOutlineOpen(false)}
          onJump={(page) => {
            setCurrentPage(page)
            pageJumpRef.current(page)
          }}
        />
      ) : null}
      {activeDocument ? (
        <BoardViewport
          document={activeDocument}
          viewport={workspace.viewport}
          cards={activeCards}
          onViewportChange={updateViewport}
          onCardsChange={updateCards}
          onDocumentLoaded={finishPreparation}
          onPageActive={setCurrentPage}
          onOutlineChange={updateOutline}
          onRegisterPageJump={registerPageJump}
          onAiRequest={runAi}
          tool={tool}
        />
      ) : (
        <section className="empty-board">
          <div>
            <FolderOpen size={30} />
            <h1>논문을 연구 보드에 펼쳐보세요</h1>
            <p>
              가져온 PDF는 기기 안에서만 먼저 준비됩니다. AI나 네트워크 요청은 자동으로 실행되지
              않습니다.
            </p>
            <button type="button" className="primary-action" onClick={() => void importPdf()}>
              PDF 가져오기
            </button>
          </div>
        </section>
      )}
      <ResearchSidebar
        document={activeDocument}
        currentPage={currentPage}
        cards={activeCards}
        citations={citations}
        expanded={workspace.sidebarOpen}
        provider={provider}
        onToggle={() => setWorkspace({ ...workspace, sidebarOpen: !workspace.sidebarOpen })}
        onJumpToCard={jumpToCard}
        onCardsChange={updateCards}
        onAiRequest={runAi}
      />
      {preparation.length > 0 ? (
        <PreparationProgress updates={preparation} onClose={() => setPreparation([])} />
      ) : null}
      {libraryOpen ? (
        <LibraryPanel
          documents={workspace.documents}
          activeId={workspace.activeDocumentId}
          onSelect={(id) => {
            setWorkspace({ ...workspace, activeDocumentId: id })
            setLibraryOpen(false)
          }}
          onImport={() => void importPdf()}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsModal
          status={provider}
          onClose={() => setSettingsOpen(false)}
          onSave={async (config) => {
            await window.hotebook.saveProviderConfig(config)
            setProvider(await window.hotebook.providerStatus())
          }}
        />
      ) : null}
    </main>
  )
}
