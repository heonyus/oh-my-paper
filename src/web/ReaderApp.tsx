import { BookOpen, CircleHelp, Library, NotebookPen, Settings, Sparkles } from "lucide-react"
import { type JSX, lazy, Suspense, useEffect, useRef, useState } from "react"
import leafMarkUrl from "../../assets/branding/ohmypaper-leaf-mark.png"
import { Topbar } from "../renderer/components/AppChrome"
import { AppStatusOverlays } from "../renderer/components/AppStatusOverlays"
import { LibraryHome } from "../renderer/components/LibraryHome"
import { NoteCardOverlays } from "../renderer/components/noteCard/NoteCardOverlays"
import { createPinnedNoteCard } from "../renderer/lib/board"
import { useLocale, useTranslator } from "../renderer/lib/locale"
import { noteCardTarget } from "../renderer/lib/noteCard"
import { prefetchWhenIdle } from "../renderer/lib/prefetchWhenIdle"
import { appShellStyle } from "../renderer/lib/uiFontScale"
import { useAppWorkspace } from "../renderer/lib/useAppWorkspace"
import { useNoteCard } from "../renderer/lib/useNoteCard"
import { noteMessages } from "../renderer/messages/note"
import { analysedPaperCount } from "../shared/documentAnalysis"
import { LOOSE_NOTE_ID } from "../shared/readerNote"
import { type DocumentId, documentIdSchema } from "../shared/schemas"
import { webMessages } from "./messages"
import { StarInvite } from "./star/StarInvite"
import { FeatureTips } from "./tips/FeatureTips"
import { TipsGallery } from "./tips/TipsGallery"
import { useWelcome } from "./useWelcome"
import { WebOnboarding } from "./WebOnboarding"

const ReaderWorkspace = lazy(() =>
  import("../renderer/components/ReaderWorkspace").then((module) => ({
    default: module.ReaderWorkspace,
  })),
)
const loadSettingsDialog = () => import("../renderer/components/AppSettingsDialog")
const AppSettingsDialog = lazy(() =>
  loadSettingsDialog().then((module) => ({ default: module.AppSettingsDialog })),
)
const ResearchView = lazy(() =>
  import("./research/ResearchView").then((module) => ({
    default: module.ResearchView,
  })),
)

export function ReaderApp(): JSX.Element {
  const app = useAppWorkspace()
  const t = useTranslator(webMessages)
  const tNote = useTranslator(noteMessages)
  const { locale } = useLocale()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)
  // The first-run welcome plays the clips one by one; the header's 사용법 opens the overview.
  const [tipsFromStart, setTipsFromStart] = useState(false)
  const welcome = useWelcome()
  const [openImportUrl] = useState(() => {
    const current = new URL(window.location.href)
    return current.pathname === "/open" ? current.searchParams.get("url") : null
  })
  const [openDocumentId] = useState(() => new URL(window.location.href).searchParams.get("doc"))
  const [openImportState, setOpenImportState] = useState<"idle" | "loading" | "done" | "failed">(
    "idle",
  )
  const openDocumentHandled = useRef(false)
  const workspace = app.workspace
  const credentialsReady = app.provider.configured
  const libraryVisible = !researchOpen && app.libraryView
  const [looseNoteOpen, setLooseNoteOpen] = useState(false)
  // A note card goes to the paper on screen; from the library or research, to the loose note.
  const noteCard = useNoteCard(
    noteCardTarget(!researchOpen && !app.libraryView ? app.activeDocument : null, app.currentPage),
    app.appendToNote,
    (target, text, at) => {
      if (target.documentId !== app.activeDocument?.id) return
      app.updateCards([
        ...app.activeCards,
        createPinnedNoteCard(target.documentId, target.page, at, text, locale),
      ])
    },
    Boolean(workspace) && credentialsReady && welcome.state === "seen",
  )

  // 설정 opens at once: its code is fetched while the app is idle, not on the first click.
  useEffect(() => prefetchWhenIdle(loadSettingsDialog), [])

  useEffect(() => {
    if (!openImportUrl || !workspace || !credentialsReady || openImportState !== "idle") return
    let cancelled = false
    setOpenImportState("loading")
    window.ohmypaper
      .importDocumentUrl(openImportUrl)
      .then(async (result) => {
        window.history.replaceState(null, "", "/")
        if (cancelled) return
        if (result) {
          const fresh = await window.ohmypaper.readWorkspace()
          app.setWorkspace({ ...fresh, activeDocumentId: result.document.id })
        }
        if (!cancelled) setOpenImportState("done")
      })
      .catch(() => {
        if (!cancelled) setOpenImportState("failed")
      })
    return () => {
      cancelled = true
    }
  }, [openImportUrl, workspace, credentialsReady, openImportState, app.setWorkspace])

  useEffect(() => {
    if (openDocumentHandled.current || !openDocumentId || !workspace) return
    openDocumentHandled.current = true
    window.history.replaceState(null, "", "/")
    const imported = documentIdSchema.safeParse(openDocumentId)
    if (!imported.success) return
    const selected = workspace.documents.find((document) => document.id === imported.data)
    if (!selected) return
    app.setWorkspace({ ...workspace, activeDocumentId: imported.data })
  }, [openDocumentId, workspace, app.setWorkspace])

  if (!workspace)
    return (
      <main className="loading-screen" aria-live="polite">
        {app.bootstrapError ? (
          <div role="alert">
            <h1>{t("shell.openFailed")}</h1>
            <p>{app.bootstrapError}</p>
            <button type="button" onClick={() => window.location.reload()}>
              {t("shell.reopen")}
            </button>
          </div>
        ) : (
          <p>{t("shell.opening")}</p>
        )}
      </main>
    )

  if (!app.credentialsChecked)
    return (
      <main className="loading-screen" aria-live="polite">
        <p>{t("shell.checkingAi")}</p>
      </main>
    )

  if (credentialsReady && welcome.state === "loading")
    return (
      <main className="loading-screen" aria-live="polite">
        <p>{t("shell.opening")}</p>
      </main>
    )

  // A fresh data folder gets the intro even when the terminal wizard already connected AI, then
  // the 사용법 clips once.
  if (!credentialsReady || welcome.state === "pending")
    return (
      <WebOnboarding
        status={app.provider}
        onDone={(next) => {
          app.setProvider(next)
          if (welcome.state !== "pending") return
          welcome.finish()
          setTipsFromStart(true)
          setTipsOpen(true)
        }}
      />
    )

  if (openImportState === "loading")
    return (
      <main className="loading-screen" aria-live="polite">
        <p>{t("shell.importing")}</p>
      </main>
    )

  if (openImportState === "failed")
    return (
      <main className="loading-screen" aria-live="polite">
        <div role="alert">
          <h1>{t("shell.importFailed")}</h1>
          <p>{t("shell.importFailedDetail")}</p>
          <a href="/">{t("shell.backToLibrary")}</a>
        </div>
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
    setResearchOpen(false)
  }

  async function openImportedDocument(id: DocumentId): Promise<void> {
    const fresh = await window.ohmypaper.readWorkspace()
    app.setWorkspace({ ...fresh, activeDocumentId: id })
    app.setCurrentPage(1)
    app.setDocumentReady(false)
    app.setViewMode("reader")
    app.setLibraryOpen(false)
    setResearchOpen(false)
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
          aria-label={t("shell.brand")}
        >
          <img src={leafMarkUrl} alt="" width={30} height={30} />
          <span>oh-my-paper</span>
        </button>
        <nav aria-label={t("shell.mainMenu")}>
          <button
            type="button"
            aria-current={libraryVisible ? "page" : undefined}
            onClick={() => {
              setResearchOpen(false)
              app.setLibraryOpen(true)
            }}
          >
            <Library size={16} aria-hidden="true" />
            {t("shell.library")}
          </button>
          <button
            type="button"
            aria-current={!libraryVisible && !researchOpen ? "page" : undefined}
            onClick={() => {
              setResearchOpen(false)
              app.setLibraryOpen(false)
            }}
          >
            <BookOpen size={16} aria-hidden="true" />
            {t("shell.reader")}
          </button>
          <button
            type="button"
            aria-current={researchOpen ? "page" : undefined}
            onClick={() => setResearchOpen(true)}
          >
            <Sparkles size={16} aria-hidden="true" />
            {t("shell.research")}
          </button>
        </nav>
        <div className="web-reader-header-actions">
          <button
            type="button"
            className="web-reader-note-card"
            aria-label={tNote("card.new")}
            aria-keyshortcuts="N Alt+N"
            title={`${tNote("card.new")} (N)`}
            onClick={noteCard.open}
          >
            <NotebookPen size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="web-reader-help"
            aria-label={t("shell.help")}
            title={t("shell.help")}
            onClick={() => {
              setTipsFromStart(false)
              setTipsOpen(true)
            }}
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="web-reader-settings"
            aria-label={t("shell.settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="web-reader-main-area">
        {researchOpen ? (
          <Suspense fallback={<p role="status">{t("shell.openingResearch")}</p>}>
            <ResearchView
              workspace={workspace}
              onWorkspaceChange={(update) =>
                app.setWorkspace((current) => (current ? update(current) : current))
              }
              onOpenImportedDocument={(id) => void openImportedDocument(id)}
            />
          </Suspense>
        ) : libraryVisible ? (
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
            onDeleteDocument={app.deleteDocument}
            onOpenLooseNote={() => setLooseNoteOpen(true)}
          />
        ) : (
          <section
            className="reader-workspace"
            data-outline-open={app.outlineOpen}
            data-note-open={app.noteOpen && Boolean(app.activeDocument)}
            aria-label={t("shell.reader")}
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
              noteOpen={app.noteOpen}
              onToggleNote={() => app.setNoteOpen((open) => !open)}
            />
            <Suspense fallback={<p role="status">{t("shell.openingPaper")}</p>}>
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
                noteOpen={app.noteOpen}
                openNote={() => app.setNoteOpen(true)}
                closeNote={() => app.setNoteOpen(false)}
                readerNote={app.readerNote}
                updateReaderNote={app.updateReaderNote}
                registerLiveNote={app.registerLiveNote}
                provider={app.provider}
                documentReady={app.documentReady}
                jumpToCard={app.jumpToCard}
                runAi={app.runAi}
                tool={app.tool}
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
      <NoteCardOverlays
        state={noteCard}
        looseNote={workspace.readerNotes.find((note) => note.documentId === LOOSE_NOTE_ID)}
        looseOpen={looseNoteOpen}
        onLooseOpenChange={setLooseNoteOpen}
        onLooseChange={(markdown) => app.updateNote(LOOSE_NOTE_ID, markdown)}
        registerLiveNote={app.registerLiveNote}
        onOpenPaperNote={(id) => {
          if (id !== app.activeDocument?.id || libraryVisible || researchOpen) openDocument(id)
          app.setNoteOpen(true)
        }}
      />
      <AppStatusOverlays
        preparation={app.preparation}
        saveFailed={app.workspaceSaveFailed}
        bootstrapError={app.bootstrapError}
        onPreparationClose={() => app.setPreparation([])}
      />
      {tipsOpen ? (
        <TipsGallery
          {...(tipsFromStart ? { initialFocus: 0 } : {})}
          onClose={() => setTipsOpen(false)}
        />
      ) : (
        <FeatureTips
          view={researchOpen ? "research" : libraryVisible ? "library" : "reader"}
          hasDocument={Boolean(app.activeDocument)}
          visitKey={`${researchOpen}:${libraryVisible}:${app.activeDocument?.id ?? ""}:${app.noteOpen}`}
        />
      )}
      <StarInvite
        active={libraryVisible && !tipsOpen && !settingsOpen}
        documents={workspace.documents}
        readerNotes={workspace.readerNotes}
      />
      {settingsOpen ? (
        <Suspense fallback={<p role="status">{t("shell.openingSettings")}</p>}>
          <AppSettingsDialog
            open
            status={app.provider}
            ocrStatus={app.ocrStatus}
            documentAnalysis={{
              analysed: analysedPaperCount(app.documentAnalysisJobs, workspace.documents.length),
              total: workspace.documents.length,
            }}
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
