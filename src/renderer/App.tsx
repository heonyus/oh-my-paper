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
import { appShellStyle } from "./lib/uiFontScale"
import { useDocumentInsights } from "./lib/useDocumentInsights"
import { usePostItShortcut } from "./lib/usePostItShortcut"
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
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
  })
  const [outline, setOutline] = useState<readonly PdfOutlineEntry[]>([])
  const [citations, setCitations] = useState<readonly CitationIndexEntry[]>([])
  usePostItShortcut(setTool)
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
    void window.scourgify.readWorkspace().then(resetWorkspace)
    void window.scourgify.providerStatus().then(setProvider)
    return window.scourgify.onPreparation((update) => {
      setPreparation((current) => [...current.filter((item) => item.step !== update.step), update])
    })
  }, [resetWorkspace])

  useEffect(() => {
    if (workspace) void window.scourgify.saveWorkspace(workspace)
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
  const { insights: activeInsights, update: updateInsight } = useDocumentInsights(
    workspace,
    activeDocument?.id,
    setWorkspace,
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
    const result = await window.scourgify.importDocument()
    if (!result) return
    const current = await window.scourgify.readWorkspace()
    resetWorkspace({ ...current, activeDocumentId: result.document.id })
  }

  async function runAi(request: Omit<AiRequest, "documentId">): Promise<string> {
    if (!activeDocument) throw new Error("active document is missing")
    const result = await window.scourgify.runAi({
      ...request,
      documentId: activeDocument.id,
    })
    return result.text
  }

  const jumpToCard = useBoardCardJump(activeCards, setWorkspace, setCurrentPage)

  if (!workspace) return <main className="loading-screen">Scourgify을 여는 중…</main>

  const appStyle = appShellStyle(workspace.uiFontScale)

  return (
    <main
      className="app-shell"
      data-outline-open={outlineOpen}
      data-theme={workspace.theme}
      style={appStyle}
    >
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
          width={workspace.outlineWidth}
          onWidthChange={(width) => setWorkspace({ ...workspace, outlineWidth: width })}
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
          currentPage={currentPage}
          onOutlineChange={updateOutline}
          onRegisterPageJump={registerPageJump}
          onAiRequest={runAi}
          tool={tool}
          onToolChange={setTool}
          minimapVisible={workspace.minimapVisible}
          onMinimapVisibleChange={(minimapVisible) =>
            setWorkspace({ ...workspace, minimapVisible })
          }
        />
      ) : (
        <section className="empty-board">
          <div>
            <FolderOpen size={30} />
            <h1>논문을 연구 보드에 펼쳐보세요</h1>
            <button type="button" className="primary-action" onClick={() => void importPdf()}>
              PDF 가져오기
            </button>
          </div>
        </section>
      )}
      <ResearchSidebar
        key={activeDocument?.id ?? "no-document"}
        document={activeDocument}
        currentPage={currentPage}
        cards={activeCards}
        citations={citations}
        insights={activeInsights}
        expanded={workspace.sidebarOpen}
        width={workspace.researchSidebarWidth}
        onWidthChange={(width) => setWorkspace({ ...workspace, researchSidebarWidth: width })}
        provider={provider}
        onToggle={() => setWorkspace({ ...workspace, sidebarOpen: !workspace.sidebarOpen })}
        onJumpToCard={jumpToCard}
        onCardsChange={updateCards}
        onAiRequest={runAi}
        onInsightChange={updateInsight}
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
          fontScale={workspace.uiFontScale}
          theme={workspace.theme}
          onThemeChange={(theme) => setWorkspace({ ...workspace, theme })}
          onFontScaleChange={(uiFontScale) => setWorkspace({ ...workspace, uiFontScale })}
          onClose={() => setSettingsOpen(false)}
          onSave={async (config) => {
            await window.scourgify.saveProviderConfig(config)
            setProvider(await window.scourgify.providerStatus())
          }}
        />
      ) : null}
    </main>
  )
}
