import {
  ArrowDownUp,
  BookOpen,
  Brain,
  FolderOpen,
  GitCompare,
  KanbanSquare,
  Library,
  Link2,
  Network,
  Search,
  Settings,
} from "lucide-react"
import type { JSX } from "react"
import type { WorkspaceViewMode } from "../lib/knowledgeTypes"

export function LeftRail({
  active,
  onLibrary,
  onDocuments,
  onSettings,
  onDataExchange,
  onPropose,
  viewMode,
  onViewModeChange,
}: {
  readonly active?: "library" | "documents" | undefined
  readonly onLibrary?: (() => void) | undefined
  readonly onDocuments?: (() => void) | undefined
  readonly onSettings: () => void
  readonly onDataExchange?: (() => void) | undefined
  readonly onPropose?: (() => void) | undefined
  readonly viewMode?: WorkspaceViewMode | undefined
  readonly onViewModeChange?: ((mode: WorkspaceViewMode) => void) | undefined
}): JSX.Element {
  const currentMode = viewMode ?? "reader"

  function handleModeClick(mode: WorkspaceViewMode): void {
    if (onViewModeChange) {
      onViewModeChange(mode)
    } else if (mode === "reader") {
      if (active === "library") {
        onDocuments?.()
      } else {
        onLibrary?.()
      }
    }
  }

  return (
    <nav className="left-rail" aria-label="주 탐색">
      {onViewModeChange ? (
        <>
          <button
            type="button"
            className={active === "library" ? "active" : undefined}
            onClick={onLibrary}
            aria-label="라이브러리"
            aria-current={active === "library" ? "page" : undefined}
            title="라이브러리"
          >
            <FolderOpen size={20} />
            <span className="left-rail-label">라이브러리</span>
          </button>
          <button
            type="button"
            className={active !== "library" && currentMode === "reader" ? "active" : undefined}
            onClick={() => handleModeClick("reader")}
            aria-label="읽기"
            aria-current={active !== "library" && currentMode === "reader" ? "page" : undefined}
            title="읽기"
          >
            <BookOpen size={20} />
            <span className="left-rail-label">읽기</span>
          </button>
          <button
            type="button"
            className={currentMode === "knowledge" ? "active" : undefined}
            onClick={() => handleModeClick("knowledge")}
            aria-label="지식"
            aria-current={currentMode === "knowledge" ? "page" : undefined}
            title="지식"
          >
            <Library size={20} />
            <span className="left-rail-label">지식</span>
          </button>
          <button
            type="button"
            className={currentMode === "graph" ? "active" : undefined}
            onClick={() => handleModeClick("graph")}
            aria-label="연결"
            aria-current={currentMode === "graph" ? "page" : undefined}
            title="연결"
          >
            <Network size={20} />
            <span className="left-rail-label">연결</span>
          </button>
          <button
            type="button"
            className={currentMode === "compare" ? "active" : undefined}
            onClick={() => handleModeClick("compare")}
            aria-label="비교"
            aria-current={currentMode === "compare" ? "page" : undefined}
            title="비교"
          >
            <GitCompare size={20} />
            <span className="left-rail-label">비교</span>
          </button>
          <button
            type="button"
            className={currentMode === "project" ? "active" : undefined}
            onClick={() => handleModeClick("project")}
            aria-label="프로젝트"
            aria-current={currentMode === "project" ? "page" : undefined}
            title="프로젝트"
          >
            <KanbanSquare size={20} />
            <span className="left-rail-label">프로젝트</span>
          </button>
          <span className="left-rail-divider" aria-hidden="true" />
          <button
            type="button"
            className={currentMode === "memory" ? "active" : undefined}
            onClick={() => handleModeClick("memory")}
            aria-label="메모리"
            aria-current={currentMode === "memory" ? "page" : undefined}
            title="메모리"
          >
            <Brain size={20} />
            <span className="left-rail-label">메모리</span>
          </button>
          <button
            type="button"
            className={currentMode === "search" ? "active" : undefined}
            onClick={() => handleModeClick("search")}
            aria-label="논문 검색"
            aria-current={currentMode === "search" ? "page" : undefined}
            title="논문 검색"
          >
            <Search size={20} />
            <span className="left-rail-label">검색</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={active === "library" ? "active" : undefined}
            onClick={onLibrary}
            aria-label="라이브러리"
            aria-current={active === "library" ? "page" : undefined}
            title="라이브러리"
          >
            <Library size={20} />
            <span className="left-rail-label">라이브러리</span>
          </button>
          <button
            type="button"
            className={active === "documents" ? "active" : undefined}
            onClick={onDocuments}
            aria-label="문서"
            aria-current={active === "documents" ? "page" : undefined}
            title="문서"
          >
            <FolderOpen size={20} />
            <span className="left-rail-label">문서</span>
          </button>
        </>
      )}
      {onDataExchange ? (
        <button
          type="button"
          onClick={onDataExchange}
          aria-label="데이터 가져오기·내보내기"
          title="데이터 가져오기·내보내기"
        >
          <ArrowDownUp size={20} />
          <span className="left-rail-label">가져오기· 내보내기</span>
        </button>
      ) : null}
      {onPropose ? (
        <button type="button" onClick={onPropose} aria-label="AI 연결 제안" title="AI 연결 제안">
          <Link2 size={20} />
          <span className="left-rail-label">AI 연결 제안</span>
        </button>
      ) : null}
      <button
        type="button"
        className="rail-settings"
        onClick={onSettings}
        aria-label="설정"
        title="설정"
      >
        <Settings size={20} />
        <span className="left-rail-label">설정</span>
      </button>
    </nav>
  )
}
