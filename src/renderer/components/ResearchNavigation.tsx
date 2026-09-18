import { ChevronDown, Settings } from "lucide-react"
import { type JSX, useId } from "react"
import type { WorkspaceViewMode } from "../lib/knowledgeTypes"

const destinations = [
  { mode: "search", label: "탐색", accessibleLabel: "논문 검색" },
  { mode: "knowledge", label: "노트와 지식", accessibleLabel: "지식" },
  { mode: "graph", label: "연결", accessibleLabel: "연결" },
  { mode: "reader", label: "리더", accessibleLabel: "리더" },
  { mode: "compare", label: "비교", accessibleLabel: "비교" },
  { mode: "project", label: "프로젝트", accessibleLabel: "프로젝트" },
] satisfies readonly {
  readonly mode: WorkspaceViewMode
  readonly label: string
  readonly accessibleLabel: string
}[]

export function ResearchNavigation(props: {
  readonly active: "library" | "documents"
  readonly viewMode: WorkspaceViewMode
  readonly onViewModeChange: (mode: WorkspaceViewMode) => void
  readonly onLibrary: () => void
  readonly onSettings: () => void
  readonly onDataExchange: () => void
  readonly onPropose: () => void
}): JSX.Element {
  const menuId = useId()
  const memoryActive = props.active !== "library" && props.viewMode === "memory"
  const closeMenu = (): void => document.getElementById(menuId)?.hidePopover()
  const navigate = (mode: WorkspaceViewMode): void => props.onViewModeChange?.(mode)
  return (
    <nav className="left-rail research-navigation" aria-label="주 탐색">
      <button
        type="button"
        className={props.active === "library" ? "active" : undefined}
        aria-label="라이브러리"
        aria-current={props.active === "library" ? "page" : undefined}
        onClick={props.onLibrary}
      >
        라이브러리
      </button>
      {destinations.map(({ mode, label, accessibleLabel }) => (
        <button
          key={mode}
          type="button"
          aria-label={accessibleLabel}
          className={props.active !== "library" && props.viewMode === mode ? "active" : undefined}
          aria-current={props.active !== "library" && props.viewMode === mode ? "page" : undefined}
          onClick={() => navigate(mode)}
        >
          {label}
        </button>
      ))}
      <div className="research-navigation-utilities">
        <button
          type="button"
          popoverTarget={menuId}
          className={`research-navigation-more${memoryActive ? " active" : ""}`}
          aria-current={memoryActive ? "page" : undefined}
        >
          더 보기 <ChevronDown size={14} aria-hidden="true" />
        </button>
        <div id={menuId} popover="auto" className="research-navigation-menu">
          <button
            type="button"
            aria-current={memoryActive ? "page" : undefined}
            onClick={() => {
              closeMenu()
              navigate("memory")
            }}
          >
            메모리
          </button>
          {props.onDataExchange ? (
            <button
              type="button"
              onClick={() => {
                closeMenu()
                props.onDataExchange?.()
              }}
            >
              데이터 가져오기·내보내기
            </button>
          ) : null}
          {props.onPropose ? (
            <button
              type="button"
              onClick={() => {
                closeMenu()
                props.onPropose?.()
              }}
            >
              AI 연결 제안
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="rail-settings"
          aria-label="설정"
          onClick={props.onSettings}
        >
          <Settings size={18} aria-hidden="true" />
          <span>설정</span>
        </button>
      </div>
    </nav>
  )
}
