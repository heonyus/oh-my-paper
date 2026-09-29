import { type JSX, lazy, Suspense, useState } from "react"
import { LibraryTopbar, Topbar, type WebAccount } from "./components/AppChrome"
import { AppStatusOverlays } from "./components/AppStatusOverlays"
import type { HostedCredentialSettingsProps } from "./components/HostedCredentialSettings"
import { LibraryWorkspace } from "./components/LibraryWorkspace"
import { ResearchNavigation } from "./components/ResearchNavigation"
import { WorkspaceSections } from "./components/WorkspaceSections"
import { appShellStyle } from "./lib/uiFontScale"
import { useAppWorkspace } from "./lib/useAppWorkspace"
import type { DocumentId } from "./types"

const ReaderWorkspace = lazy(() =>
  import("./components/ReaderWorkspace").then((module) => ({ default: module.ReaderWorkspace })),
)
const AppSettingsDialog = lazy(() =>
  import("./components/AppSettingsDialog").then((module) => ({
    default: module.AppSettingsDialog,
  })),
)
const DataExchangeDialog = lazy(() =>
  import("./components/DataExchangeDialog").then((module) => ({
    default: module.DataExchangeDialog,
  })),
)
const KnowledgeProposalDialog = lazy(() =>
  import("./components/KnowledgeProposalDialog").then((module) => ({
    default: module.KnowledgeProposalDialog,
  })),
)

export function App({
  platform = "desktop",
  account,
  hostedCredentials,
}: {
  readonly platform?: "desktop" | "web"
  readonly account?: WebAccount | undefined
  readonly hostedCredentials?: HostedCredentialSettingsProps | undefined
}): JSX.Element {
  const app = useAppWorkspace()
  const workspace = app.workspace
  const {
    preparation,
    currentPage,
    setCurrentPage,
    updateDocumentPage,
    outlineOpen,
    setOutlineOpen,
    viewMode,
    selectedKnowledgeNodeId,
    documentReady,
    tool,
    provider,
    ocrStatus,
    bootstrapError,
    outline,
    citations,
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
    noteOpen,
    setNoteOpen,
    readerNote,
    updateReaderNote,
    runAi,
    importProgress,
    importPdf,
    importDroppedPdfs,
    finishPreparation,
    jumpToCard,
    updateOutline,
    updateViewport,
    readerMode,
    libraryView,
  } = app
  const jumpToEvidence = evidence.navigate
  const pageJumpRef = evidence.jump
  const registerPageJump = evidence.registerPageJump
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dataExchangeOpen, setDataExchangeOpen] = useState(false)
  const [proposalOpen, setProposalOpen] = useState(false)

  if (!workspace) return <main className="loading-screen">oh-my-paper를 여는 중…</main>

  if (!app.credentialsChecked)
    return <main className="loading-screen">API 연결을 확인하는 중…</main>

  const credentialsReady = provider.configured

  if (!credentialsReady)
    return (
      <main
        className="app-shell"
        data-theme={workspace.theme}
        style={appShellStyle(workspace.uiFontScale, workspace.uiFontFamily)}
      >
        <Suspense fallback={<p role="status">API 설정을 여는 중…</p>}>
          <AppSettingsDialog
            open
            locked
            status={provider}
            ocrStatus={ocrStatus}
            workspace={workspace}
            onWorkspaceChange={app.setWorkspaceTransient}
            onProviderChange={app.setProvider}
            onOcrStatusChange={app.setOcrStatus}
            onClose={() => undefined}
          />
        </Suspense>
      </main>
    )

  const openDocument = (id: DocumentId): void => {
    const selected = workspace.documents.find((document) => document.id === id)
    if (!selected) return
    evidence.dismiss()
    app.setWorkspace({ ...workspace, activeDocumentId: id })
    setCurrentPage(selected.lastReadPage ?? 1)
    app.setDocumentReady(Boolean(selected.overview))
    app.setViewMode("reader")
    app.setLibraryOpen(false)
  }

  return (
    <main
      className="app-shell"
      data-navigation="research"
      data-theme={workspace.theme}
      data-large-text={workspace.uiFontScale >= 1.5}
      style={appShellStyle(workspace.uiFontScale, workspace.uiFontFamily)}
    >
      <LibraryTopbar account={account} />
      <ResearchNavigation
        active={libraryView ? "library" : "documents"}
        viewMode={viewMode}
        onViewModeChange={(next) => {
          app.setViewMode(next)
          if (next !== "reader") setOutlineOpen(false)
        }}
        onLibrary={() => {
          evidence.dismiss()
          app.setViewMode("reader")
          app.setLibraryOpen(true)
        }}
        onSettings={() => setSettingsOpen(true)}
        onDataExchange={() => setDataExchangeOpen(true)}
        onPropose={() => setProposalOpen(true)}
      />
      <div style={{ display: libraryView ? "contents" : "none" }}>
        <LibraryWorkspace
          clientOps={knowledgeClientOps}
          active={libraryView}
          onOpenNode={
            platform === "web"
              ? undefined
              : (id) => {
                  app.setSelectedKnowledgeNodeId(id)
                  app.setViewMode("knowledge")
                }
          }
          onOpenGraph={() => app.setViewMode("graph")}
          onOpenSearch={() => app.setViewMode("search")}
          documents={workspace.documents}
          activeId={workspace.activeDocumentId}
          recentDocumentId={activeDocument?.id}
          recentPage={activeDocument?.lastReadPage}
          onImport={() => void importPdf()}
          onFileDrop={(files) => void importDroppedPdfs(files)}
          importLabel={platform === "web" ? "PDF 업로드 및 분석" : "PDF 가져오기"}
          importProgress={importProgress}
          analysisJobs={documentAnalysisJobs}
          onRetryAnalysis={(id) => void window.ohmypaper.retryDocumentAnalysis(id)}
          onSelect={openDocument}
        />
      </div>
      <WorkspaceSections
        mode={viewMode}
        clientOps={knowledgeClientOps}
        nodeId={selectedKnowledgeNodeId}
        onNodeSelect={app.setSelectedKnowledgeNodeId}
        onNavigate={app.setViewMode}
        onEvidence={jumpToEvidence}
        document={activeDocument}
        cards={activeCards}
      />
      {readerMode && !libraryView ? (
        <section
          className="reader-workspace"
          data-outline-open={outlineOpen}
          data-note-open={noteOpen && Boolean(activeDocument)}
          aria-label="리더"
        >
          <Topbar
            documents={workspace.documents}
            activeDocumentId={activeDocument?.id ?? null}
            onDocumentChange={openDocument}
            viewport={workspace.viewport}
            onViewportChange={updateViewport}
            tool={tool}
            onToolChange={app.setTool}
            canUndo={app.canUndo}
            canRedo={app.canRedo}
            onUndo={app.undo}
            onRedo={app.redo}
            outlineOpen={outlineOpen}
            onToggleOutline={() => setOutlineOpen((open) => !open)}
            noteOpen={noteOpen}
            onToggleNote={() => setNoteOpen((open) => !open)}
          />
          <Suspense fallback={<p role="status">논문을 여는 중…</p>}>
            <ReaderWorkspace
              key={activeDocument?.id ?? "empty"}
              document={activeDocument}
              workspace={workspace}
              updateWorkspace={app.setWorkspaceTransient}
              updateViewport={updateViewport}
              currentPage={currentPage}
              setPage={setCurrentPage}
              updateDocumentPage={updateDocumentPage}
              cards={activeCards}
              updateCards={updateCards}
              previewCards={previewCards}
              citations={citations}
              insights={activeInsights}
              updateInsight={updateInsight}
              noteOpen={noteOpen}
              openNote={() => setNoteOpen(true)}
              closeNote={() => setNoteOpen(false)}
              readerNote={readerNote}
              updateReaderNote={updateReaderNote}
              provider={provider}
              documentReady={documentReady}
              jumpToCard={jumpToCard}
              runAi={runAi}
              tool={tool}
              setTool={app.setTool}
              onPrepared={finishPreparation}
              outline={outline}
              outlineOpen={outlineOpen}
              closeOutline={() => setOutlineOpen(false)}
              updateOutline={updateOutline}
              jumpToPage={(page) => pageJumpRef.current(page)}
              registerPageJump={registerPageJump}
              evidence={evidence.target}
              dismissEvidence={evidence.dismiss}
              importPdf={() => void importPdf()}
            />
          </Suspense>
        </section>
      ) : null}
      <AppStatusOverlays
        preparation={preparation}
        saveFailed={workspaceSaveFailed}
        bootstrapError={bootstrapError}
        onPreparationClose={() => app.setPreparation([])}
      />
      <Suspense fallback={<p role="status">설정을 여는 중…</p>}>
        {dataExchangeOpen ? (
          <DataExchangeDialog
            onClose={() => setDataExchangeOpen(false)}
            onNodeOpen={(id) => {
              app.setSelectedKnowledgeNodeId(id)
              app.setViewMode("knowledge")
              setDataExchangeOpen(false)
            }}
          />
        ) : null}
        {proposalOpen ? (
          <KnowledgeProposalDialog
            onClose={() => setProposalOpen(false)}
            onJumpToEvidence={jumpToEvidence}
          />
        ) : null}
        {settingsOpen ? (
          <AppSettingsDialog
            open={settingsOpen}
            status={provider}
            ocrStatus={ocrStatus}
            workspace={workspace}
            onWorkspaceChange={app.setWorkspaceTransient}
            onProviderChange={app.setProvider}
            onOcrStatusChange={app.setOcrStatus}
            onClose={() => setSettingsOpen(false)}
            appearanceOnly={false}
            hostedCredentials={platform === "web" ? hostedCredentials : undefined}
          />
        ) : null}
      </Suspense>
    </main>
  )
}
