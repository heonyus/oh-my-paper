import { ArrowLeft, ArrowRight, List, Network, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import type { JSX } from "react"
import type {
  KnowledgeNode,
  KnowledgeNodeId,
  RelationReviewState,
} from "../../../shared/knowledgeSchemas"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"
import type { GraphFilterCategory } from "./NeighbourGraphSelectors"

type GraphViewMode = "graph" | "list"

export interface NeighbourGraphToolbarProps {
  readonly allNodes: readonly KnowledgeNode[]
  readonly rootId: KnowledgeNodeId | null
  readonly rootHistory: readonly KnowledgeNodeId[]
  readonly historyIndex: number
  readonly filter: GraphFilterCategory
  readonly reviewFilter: "all" | RelationReviewState
  readonly viewMode: GraphViewMode
  readonly listCollapsed: boolean
  readonly onExploreNode: (id: KnowledgeNodeId) => void
  readonly onMoveHistory: (index: number) => void
  readonly onFilterChange: (filter: GraphFilterCategory) => void
  readonly onReviewFilterChange: (value: string) => void
  readonly onViewModeChange: (mode: GraphViewMode) => void
  readonly onListCollapsedChange: (collapsed: boolean) => void
}

export function NeighbourGraphToolbar({
  allNodes,
  rootId,
  rootHistory,
  historyIndex,
  filter,
  reviewFilter,
  viewMode,
  listCollapsed,
  onExploreNode,
  onMoveHistory,
  onFilterChange,
  onReviewFilterChange,
  onViewModeChange,
  onListCollapsedChange,
}: NeighbourGraphToolbarProps): JSX.Element {
  return (
    <>
      <header className="neighbour-graph-header">
        <div className="neighbour-graph-heading">
          <div className="neighbour-graph-eyebrow">
            <Network size={15} /> 근거 기반 연결
          </div>
          <h2>연결</h2>
          <p>선택한 항목 주변의 실제 관계와 원문 근거를 확인합니다.</p>
        </div>
        <label className="neighbour-graph-root-picker">
          <span>기준 노드</span>
          <select
            className="neighbour-graph-input"
            value={rootId ?? ""}
            onChange={(event) => {
              const id = allNodes.find((node) => node.id === event.target.value)?.id
              if (id) onExploreNode(id)
            }}
            aria-label="기준 노드 선택"
          >
            <option value="">기준 노드 선택...</option>
            {allNodes.map((node) => (
              <option key={node.id} value={node.id}>
                [{knowledgeNodeKindLabel(node.kind)}] {node.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="neighbour-graph-toolbar">
        <fieldset className="neighbour-graph-history" aria-label="탐색 기록">
          <button
            type="button"
            className="neighbour-graph-tool"
            aria-label="이전 그래프"
            disabled={historyIndex <= 0}
            onClick={() => onMoveHistory(historyIndex - 1)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            className="neighbour-graph-tool"
            aria-label="다음 그래프"
            disabled={historyIndex >= rootHistory.length - 1}
            onClick={() => onMoveHistory(historyIndex + 1)}
          >
            <ArrowRight size={15} />
          </button>
          <span>
            {rootHistory.length > 1 ? `${historyIndex + 1}/${rootHistory.length}` : "현재 탐색"}
          </span>
        </fieldset>
        <div className="neighbour-graph-filters">
          <fieldset className="neighbour-graph-tabs" aria-label="관계 종류 필터">
            {(["all", "citation", "concept", "research"] as const).map((category) => (
              <button
                key={category}
                type="button"
                className="neighbour-graph-tab"
                data-selected={filter === category}
                onClick={() => onFilterChange(category)}
              >
                {category === "all"
                  ? "전체"
                  : category === "citation"
                    ? "인용"
                    : category === "concept"
                      ? "개념"
                      : "연구 흐름"}
              </button>
            ))}
          </fieldset>
          <label className="neighbour-graph-review-filter">
            <span>검토 상태</span>
            <select
              className="neighbour-graph-input"
              value={reviewFilter}
              onChange={(event) => onReviewFilterChange(event.target.value)}
              aria-label="검토 상태 필터"
            >
              <option value="all">전체</option>
              <option value="accepted">검토됨</option>
              <option value="proposed">제안됨</option>
              <option value="needs_review">검토 필요</option>
              <option value="rejected">거절됨</option>
            </select>
          </label>
        </div>
        <fieldset className="neighbour-graph-view-switch" aria-label="그래프 보기 방식">
          <button
            type="button"
            className="neighbour-graph-tool"
            data-selected={viewMode === "graph"}
            aria-label="그래프 보기"
            aria-pressed={viewMode === "graph"}
            onClick={() => onViewModeChange("graph")}
          >
            <Network size={15} />
          </button>
          <button
            type="button"
            className="neighbour-graph-tool"
            data-selected={viewMode === "list"}
            aria-label="목록 보기"
            aria-pressed={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
          >
            <List size={15} />
          </button>
          <button
            type="button"
            className="neighbour-graph-tool"
            aria-label={listCollapsed ? "연결 목록 펼치기" : "연결 목록 접기"}
            aria-pressed={!listCollapsed}
            onClick={() => onListCollapsedChange(!listCollapsed)}
          >
            {listCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </fieldset>
      </div>
    </>
  )
}
