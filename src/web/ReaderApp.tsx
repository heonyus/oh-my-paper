import { BookOpen, Library, Settings } from "lucide-react"
import { type JSX, lazy, Suspense, useState } from "react"
import leafMarkUrl from "../../assets/branding/scourgify-leaf-mark.png"
import { Topbar } from "../renderer/components/AppChrome"
import { AppStatusOverlays } from "../renderer/components/AppStatusOverlays"
import { LibraryHome } from "../renderer/components/LibraryHome"
import { appShellStyle } from "../renderer/lib/uiFontScale"
import { useAppWorkspace } from "../renderer/lib/useAppWorkspace"
import type { DocumentId } from "../shared/schemas"

const ReaderWorkspace = lazy(() =>
  import("../renderer/components/ReaderWorkspace").then((module) => ({
    default: module.ReaderWorkspace,
  })),
)
const AppSettingsDialog = lazy(() =>
  import("../renderer/components/AppSettingsDialog").then((module) => ({
    default: module.AppSettingsDialog,
  })),
)

export function ReaderApp(): JSX.Element {
  const app = useAppWorkspace()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const workspace = app.workspace

  if (!workspace)
    return (
      <main className="loading-screen" aria-live="polite">
        {app.bootstrapError ? (
          <div role="alert">
            <h1>보관함을 열지 못했습니다</h1>
            <p>{app.bootstrapError}</p>
            <button type="button" onClick={() => window.location.reload()}>
              다시 열기
            </button>
          </div>
        ) : (
          <p>oh-my-paper를 여는 중…</p>
        )}
      </main>
    )

  if (!app.credentialsChecked)
    return (
      <main className="loading-screen" aria-live="polite">
        <p>API 연결을 확인하는 중…</p>
      </main>
    )

  const credentialsReady = app.provider.configured && app.provider.provider === "openrouter"

  if (!credentialsReady)
    return (
      <main
        className="app-shell web-reader-shell"
        data-theme={workspace.theme}
        style={appShellStyle(workspace.uiFontScale, workspace.uiFontFamily)}
      >
        <Suspense fallback={<p role="status">API 설정을 여는 중…</p>}>
          <AppSettingsDialog
            open
            locked
            status={app.provider}
            ocrStatus={app.ocrStatus}
            workspace={workspace}
            onWorkspaceChange={app.setWorkspaceTransient}
            onProviderChange={app.setProvider}
            onOcrStatusChange={app.setOcrStatus}
            onClose={() => undefined}
          />
        </Suspense>
      </main>
    )

  function openDocument(id: DocumentId): void {
    if (!workspace) return
    const selected = workspace.documents.find((document) => document.id === id)
    if (!selected) return
    app.evidence.dismiss()
    app.setWorkspace({ ...workspace, activeDocumentId: id })
    app.setCurrentPage(selected.lastReadPage ?? 1)
    app.setDocumentReady(Boolean(selected.overview))
    app.setViewMode("reader")
    app.setLibraryOpen(false)
  }

  return (
    <main
      className="app-shell web-reader-shell"
      data-theme={workspace.theme}
      data-large-text={workspace.uiFontScale >= 1.5}
      style={appShellStyle(workspace.uiFontScale, workspace.uiFontFamily)}
    >
      <header className="web-reader-header">
        <button
          type="button"
          className="web-reader-brand"
          onClick={() => app.setLibraryOpen(true)}
          aria-label="oh-my-paper 라이브러리"
        >
          <img src={leafMarkUrl} alt="" width={30} height={30} />
          <span>oh-my-paper</span>
        </button>
        <nav aria-label="주 메뉴">
          <button
            type="button"
            aria-current={app.libraryView ? "page" : undefined}
            onClick={() => app.setLibraryOpen(true)}
          >
            <Library size={16} aria-hidden="true" />
            라이브러리
          </button>
          <button
            type="button"
            aria-current={!app.libraryView ? "page" : undefined}
            onClick={() => app.setLibraryOpen(false)}
          >
            <BookOpen size={16} aria-hidden="true" />
            리더
          </button>
        </nav>
        <button
          type="button"
          className="web-reader-settings"
          aria-label="설정"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="web-reader-main-area">
        {app.libraryView ? (
          <LibraryHome
            active={app.libraryView}
            documents={workspace.documents}
            activeId={workspace.activeDocumentId}
            onSelect={openDocument}
            recentDocumentId={app.activeDocument?.id}
            recentPage={app.activeDocument?.lastReadPage}
            onImport={() => void app.importPdf()}
            onFileDrop={(files) => void app.importDroppedPdfs(files)}
            importProgress={app.importProgress}
            analysisJobs={app.documentAnalysisJobs}
          />
        ) : (
          <section
            className="reader-workspace"
            data-outline-open={app.outlineOpen}
            aria-label="리더"
          >
            <Topbar
              documents={workspace.documents}
              activeDocumentId={app.activeDocument?.id ?? null}
              onDocumentChange={openDocument}
              viewport={workspace.viewport}
              onViewportChange={app.updateViewport}
              tool={app.tool}
              onToolChange={app.setTool}
              canUndo={app.canUndo}
              canRedo={app.canRedo}
              onUndo={app.undo}
              onRedo={app.redo}
              outlineOpen={app.outlineOpen}
              onToggleOutline={() => app.setOutlineOpen((open) => !open)}
            />
            <Suspense fallback={<p role="status">논문을 여는 중…</p>}>
              <ReaderWorkspace
                key={app.activeDocument?.id ?? "empty"}
                document={app.activeDocument}
                workspace={workspace}
                updateWorkspace={app.setWorkspaceTransient}
                updateViewport={app.updateViewport}
                currentPage={app.currentPage}
                setPage={app.setCurrentPage}
                updateDocumentPage={app.updateDocumentPage}
                cards={app.activeCards}
                updateCards={app.updateCards}
                previewCards={app.previewCards}
                citations={app.citations}
                insights={app.activeInsights}
                updateInsight={app.updateInsight}
                provider={app.provider}
                documentReady={app.documentReady}
                jumpToCard={app.jumpToCard}
                runAi={app.runAi}
                tool={app.tool}
                setTool={app.setTool}
                onPrepared={app.finishPreparation}
                outline={app.outline}
                outlineOpen={app.outlineOpen}
                closeOutline={() => app.setOutlineOpen(false)}
                updateOutline={app.updateOutline}
                jumpToPage={(page) => app.evidence.jump.current(page)}
                registerPageJump={app.evidence.registerPageJump}
                evidence={app.evidence.target}
                dismissEvidence={app.evidence.dismiss}
                importPdf={() => void app.importPdf()}
              />
            </Suspense>
          </section>
        )}
      </div>
      <AppStatusOverlays
        preparation={app.preparation}
        saveFailed={app.workspaceSaveFailed}
        bootstrapError={app.bootstrapError}
        onPreparationClose={() => app.setPreparation([])}
      />
      {settingsOpen ? (
        <Suspense fallback={<p role="status">설정을 여는 중…</p>}>
          <AppSettingsDialog
            open
            status={app.provider}
            ocrStatus={app.ocrStatus}
            workspace={workspace}
            onWorkspaceChange={app.setWorkspaceTransient}
            onProviderChange={app.setProvider}
            onOcrStatusChange={app.setOcrStatus}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      ) : null}
    </main>
  )
}
