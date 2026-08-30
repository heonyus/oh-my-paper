import {
  FolderOpen,
  Hand,
  Library,
  ListTree,
  MousePointer2,
  Redo2,
  Settings,
  StickyNote,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type { JSX } from "react"
import wordmarkUrl from "../../../assets/branding/scourgify-wordmark-v1.png"
import { zoomViewportAt } from "../lib/viewport"
import type { BoardTool, Viewport } from "../types"

type TopbarProps = {
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
  function changeZoom(delta: number): void {
    const board = document.querySelector<HTMLElement>(".board-viewport")
    const focalPoint = board
      ? { x: board.clientWidth / 2, y: board.clientHeight / 2 }
      : { x: 0, y: 0 }
    onViewportChange(zoomViewportAt(viewport, focalPoint, viewport.zoom + delta))
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img className="topbar-wordmark" src={wordmarkUrl} alt="Scourgify" />
      </div>
      <span className="topbar-divider" />
      <span>Research Board</span>
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
        <button
          type="button"
          className={tool === "sticky" ? "active" : undefined}
          aria-label="포스트잇 도구"
          aria-keyshortcuts="N"
          onClick={() => onToolChange("sticky")}
        >
          <StickyNote size={16} />
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
    </header>
  )
}

export function LeftRail({
  active,
  onLibrary,
  onDocuments,
  onSettings,
}: {
  readonly active: "library" | "documents"
  readonly onLibrary: () => void
  readonly onDocuments: () => void
  readonly onSettings: () => void
}): JSX.Element {
  return (
    <nav className="left-rail" aria-label="주 탐색">
      <button
        type="button"
        className={active === "library" ? "active" : undefined}
        onClick={onLibrary}
        aria-label="라이브러리"
        title="라이브러리"
      >
        <Library size={20} />
      </button>
      <button
        type="button"
        className={active === "documents" ? "active" : undefined}
        onClick={onDocuments}
        aria-label="문서"
        title="문서"
      >
        <FolderOpen size={20} />
      </button>
      <button
        type="button"
        className="rail-settings"
        onClick={onSettings}
        aria-label="설정"
        title="설정"
      >
        <Settings size={20} />
      </button>
    </nav>
  )
}
