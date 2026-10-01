import {
  Hand,
  Languages,
  ListTree,
  LogOut,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type { JSX } from "react"
import leafMarkUrl from "../../../assets/branding/ohmypaper-leaf-mark.png"
import { useTranslator } from "../lib/locale"
import {
  toggleAutomaticPageTranslation,
  usePageTranslationSession,
} from "../lib/pageTranslationToggle"
import { zoomViewportAt } from "../lib/viewport"
import { chromeMessages } from "../messages/chrome"
import type { BoardTool, DocumentId, DocumentRecord, Viewport } from "../types"

export type WebAccount = {
  readonly name: string
  readonly onSignOut?: () => void
}

type TopbarProps = {
  readonly documents: readonly DocumentRecord[]
  readonly activeDocumentId: DocumentId | null
  readonly onDocumentChange: (id: DocumentId) => void
  readonly viewport: Viewport
  readonly onViewportChange: (viewport: Viewport) => void
  readonly tool: BoardTool
  readonly onToolChange: (tool: BoardTool) => void
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onUndo: () => void
  readonly onRedo: () => void
  readonly outlineOpen: boolean
  readonly onToggleOutline: () => void
}

export function Topbar({
  documents,
  activeDocumentId,
  onDocumentChange,
  viewport,
  onViewportChange,
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  outlineOpen,
  onToggleOutline,
}: TopbarProps): JSX.Element {
  const t = useTranslator(chromeMessages)
  const pageTranslation = usePageTranslationSession()
  function changeZoom(delta: number): void {
    const board = document.querySelector<HTMLElement>(".board-viewport")
    const focalPoint = board
      ? { x: board.clientWidth / 2, y: board.clientHeight / 2 }
      : { x: 0, y: 0 }
    onViewportChange(zoomViewportAt(viewport, focalPoint, viewport.zoom + delta))
  }

  return (
    <header className="topbar reader-toolbar">
      <label className="reader-document-picker">
        <span>{t("topbar.documentPicker")}</span>
        <select
          value={activeDocumentId ?? ""}
          disabled={documents.length === 0}
          onChange={(event) => {
            const document = documents.find((item) => item.id === event.target.value)
            if (document) onDocumentChange(document.id)
          }}
        >
          <option value="" disabled>
            {t("topbar.noDocument")}
          </option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset
        className="reader-tools"
        disabled={!activeDocumentId}
        aria-label={t("topbar.tools")}
      >
        <button
          type="button"
          className={outlineOpen ? "active" : undefined}
          aria-label={t(outlineOpen ? "outline.close" : "outline.open")}
          aria-pressed={outlineOpen}
          onClick={onToggleOutline}
        >
          <ListTree size={17} />
        </button>
        <div className="tool-cluster">
          <button
            type="button"
            className={tool === "select" ? "active" : undefined}
            aria-label={t("topbar.select")}
            onClick={() => onToolChange("select")}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            type="button"
            className={tool === "pan" ? "active" : undefined}
            aria-label={t("topbar.pan")}
            onClick={() => onToolChange("pan")}
          >
            <Hand size={16} />
          </button>
        </div>
        <div className="tool-cluster">
          <button type="button" aria-label={t("topbar.undo")} onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={16} />
          </button>
          <button type="button" aria-label={t("topbar.redo")} onClick={onRedo} disabled={!canRedo}>
            <Redo2 size={16} />
          </button>
        </div>
        <div className="zoom-cluster">
          <button type="button" onClick={() => changeZoom(-0.1)} aria-label={t("topbar.zoomOut")}>
            <ZoomOut size={16} />
          </button>
          <output>{Math.round(viewport.zoom * 100)}%</output>
          <button type="button" onClick={() => changeZoom(0.1)} aria-label={t("topbar.zoomIn")}>
            <ZoomIn size={16} />
          </button>
        </div>
        <button
          type="button"
          className="topbar-translation-action"
          data-active={pageTranslation.auto}
          aria-label={t(
            pageTranslation.auto ? "topbar.autoTranslateOff" : "topbar.autoTranslateOn",
          )}
          aria-pressed={pageTranslation.auto}
          onClick={toggleAutomaticPageTranslation}
        >
          <Languages size={16} />
          <span>{t("topbar.autoTranslate")}</span>
          <small className="topbar-translation-state">{pageTranslation.auto ? "ON" : "OFF"}</small>
        </button>
      </fieldset>
    </header>
  )
}

function TopbarAccount({ account }: { readonly account: WebAccount }): JSX.Element {
  const t = useTranslator(chromeMessages)
  return (
    <div className="topbar-account">
      <span>{account.name}</span>
      {account.onSignOut ? (
        <button type="button" aria-label={t("topbar.signOut")} onClick={account.onSignOut}>
          <LogOut size={16} />
        </button>
      ) : null}
    </div>
  )
}

export function LibraryTopbar({
  account,
  title = "Library",
}: {
  readonly account?: WebAccount | undefined
  readonly title?: string
}): JSX.Element {
  return (
    <header className="topbar library-topbar">
      <div className="topbar-brand">
        <img className="topbar-brand-mark" src={leafMarkUrl} alt="oh-my-paper" />
        <span aria-hidden="true">oh-my-paper</span>
      </div>
      <span className="topbar-divider" />
      <strong>{title}</strong>
      {account ? <TopbarAccount account={account} /> : null}
    </header>
  )
}
