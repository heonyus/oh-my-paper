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
import leafMarkUrl from "../../../assets/branding/scourgify-leaf-mark.png"
import {
  toggleAutomaticPageTranslation,
  usePageTranslationSession,
} from "../lib/pageTranslationToggle"
import { zoomViewportAt } from "../lib/viewport"
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
        <span>읽는 논문</span>
        <select
          value={activeDocumentId ?? ""}
          disabled={documents.length === 0}
          onChange={(event) => {
            const document = documents.find((item) => item.id === event.target.value)
            if (document) onDocumentChange(document.id)
          }}
        >
          <option value="" disabled>
            열린 논문 없음
          </option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="reader-tools" disabled={!activeDocumentId} aria-label="논문 읽기 도구">
        <button
          type="button"
          className={outlineOpen ? "active" : undefined}
          aria-label={outlineOpen ? "목차 닫기" : "목차 열기"}
          aria-pressed={outlineOpen}
          onClick={onToggleOutline}
        >
          <ListTree size={17} />
        </button>
        <div className="tool-cluster">
          <button
            type="button"
            className={tool === "select" ? "active" : undefined}
            aria-label="선택 도구"
            onClick={() => onToolChange("select")}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            type="button"
            className={tool === "pan" ? "active" : undefined}
            aria-label="이동 도구"
            onClick={() => onToolChange("pan")}
          >
            <Hand size={16} />
          </button>
        </div>
        <div className="tool-cluster">
          <button type="button" aria-label="실행 취소" onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={16} />
          </button>
          <button type="button" aria-label="다시 실행" onClick={onRedo} disabled={!canRedo}>
            <Redo2 size={16} />
          </button>
        </div>
        <div className="zoom-cluster">
          <button type="button" onClick={() => changeZoom(-0.1)} aria-label="축소">
            <ZoomOut size={16} />
          </button>
          <output>{Math.round(viewport.zoom * 100)}%</output>
          <button type="button" onClick={() => changeZoom(0.1)} aria-label="확대">
            <ZoomIn size={16} />
          </button>
        </div>
        <button
          type="button"
          className="topbar-translation-action"
          data-active={pageTranslation.auto}
          aria-label={pageTranslation.auto ? "자동 번역 끄기" : "자동 번역 켜기"}
          aria-pressed={pageTranslation.auto}
          onClick={toggleAutomaticPageTranslation}
        >
          <Languages size={16} />
          <span>자동 번역</span>
          <small className="topbar-translation-state">{pageTranslation.auto ? "ON" : "OFF"}</small>
        </button>
      </fieldset>
    </header>
  )
}

function TopbarAccount({ account }: { readonly account: WebAccount }): JSX.Element {
  return (
    <div className="topbar-account">
      <span>{account.name}</span>
      {account.onSignOut ? (
        <button type="button" aria-label="로그아웃" onClick={account.onSignOut}>
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
        <img className="topbar-brand-mark" src={leafMarkUrl} alt="Scourgify" />
        <span aria-hidden="true">Scourgify</span>
      </div>
      <span className="topbar-divider" />
      <strong>{title}</strong>
      {account ? <TopbarAccount account={account} /> : null}
    </header>
  )
}
