import { FolderKanban, Plus } from "lucide-react"
import type { JSX } from "react"
import type {
  BoardId,
  BoardRecord,
  KnowledgeNode,
  KnowledgeNodeId,
  PlacementRecord,
} from "../../../shared/knowledgeSchemas"
import { metadataString } from "../../lib/knowledgeTypes"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"

export function ProjectBoardHeader({
  board,
  boards,
  allNodes,
  selectedAddNodeId,
  newBoardTitle,
  onBoardSelect,
  onNewBoardTitleChange,
  onCreateBoard,
  onAddNodeSelect,
  onAddPlacement,
}: {
  readonly board: BoardRecord | null
  readonly boards: readonly BoardRecord[]
  readonly allNodes: readonly KnowledgeNode[]
  readonly selectedAddNodeId: KnowledgeNodeId | null
  readonly newBoardTitle: string
  readonly onBoardSelect: (id: BoardId) => void
  readonly onNewBoardTitleChange: (value: string) => void
  readonly onCreateBoard: () => void
  readonly onAddNodeSelect: (id: KnowledgeNodeId | null) => void
  readonly onAddPlacement: () => void
}): JSX.Element {
  return (
    <header className="knowledge-header knowledge-project-header">
      <div className="knowledge-heading-block">
        <h2>프로젝트</h2>
        {board?.description ? <p>{board.description}</p> : null}
      </div>
      <div className="knowledge-board-actions">
        <select
          className="knowledge-input"
          value={board?.id ?? ""}
          onChange={(event) => {
            const selected = boards.find((candidate) => candidate.id === event.target.value)
            if (selected) onBoardSelect(selected.id)
          }}
          aria-label="프로젝트 보드 선택"
        >
          {boards.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
        <input
          className="knowledge-input"
          value={newBoardTitle}
          onChange={(event) => onNewBoardTitleChange(event.target.value)}
          placeholder="새 프로젝트 이름"
          aria-label="새 프로젝트 이름"
        />
        <button type="button" className="knowledge-btn" onClick={onCreateBoard}>
          <Plus size={15} aria-hidden="true" /> 만들기
        </button>
        <select
          className="knowledge-input"
          value={selectedAddNodeId ?? ""}
          onChange={(event) =>
            onAddNodeSelect(allNodes.find((node) => node.id === event.target.value)?.id ?? null)
          }
          aria-label="보드에 배치할 노드 선택"
        >
          <option value="">기존 지식 배치...</option>
          {allNodes.map((node) => (
            <option key={node.id} value={node.id}>
              [{knowledgeNodeKindLabel(node.kind)}] {node.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="knowledge-btn knowledge-btn-primary"
          disabled={!selectedAddNodeId}
          onClick={onAddPlacement}
        >
          배치 추가
        </button>
      </div>
    </header>
  )
}

export function ProjectBoardList({
  boards,
  selectedId,
  onSelect,
  onFocusNew,
}: {
  readonly boards: readonly BoardRecord[]
  readonly selectedId: BoardId | null
  readonly onSelect: (id: BoardId) => void
  readonly onFocusNew: () => void
}): JSX.Element {
  return (
    <aside className="knowledge-project-list">
      <div className="knowledge-section-title">
        <strong>보드 목록</strong>
        <span>{boards.length}개</span>
      </div>
      {boards.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className="knowledge-project-list-item"
          data-active={candidate.id === selectedId}
          onClick={() => onSelect(candidate.id)}
        >
          <FolderKanban size={16} aria-hidden="true" />
          <span>{candidate.title}</span>
        </button>
      ))}
      <button type="button" className="knowledge-project-new" onClick={onFocusNew}>
        <Plus size={16} aria-hidden="true" /> 새 프로젝트
      </button>
    </aside>
  )
}

export function ProjectBoardDetail({
  node,
  placement,
  onClose,
  onRemove,
}: {
  readonly node: KnowledgeNode | undefined
  readonly placement: PlacementRecord | null
  readonly onClose: () => void
  readonly onRemove: (id: PlacementRecord["id"]) => void
}): JSX.Element {
  if (!node || !placement)
    return (
      <aside className="knowledge-project-detail" aria-label="선택한 항목">
        <p className="knowledge-empty">보드에서 항목을 선택하면 상세 정보가 표시됩니다.</p>
      </aside>
    )
  return (
    <aside className="knowledge-project-detail" aria-label="선택한 항목">
      <div className="knowledge-section-title">
        <strong>선택한 항목</strong>
        <button
          type="button"
          className="knowledge-icon-btn"
          onClick={onClose}
          aria-label="선택한 항목 닫기"
        >
          ×
        </button>
      </div>
      <span className="knowledge-badge">{knowledgeNodeKindLabel(node.kind)}</span>
      <h3>{node.title}</h3>
      <p>{node.body || "내용 없음"}</p>
      <div className="knowledge-project-fields">
        <span>
          데이터 버전 <b>{metadataString(node, "dataVersion") ?? "미지정"}</b>
        </span>
        <span>
          코드 버전 <b>{metadataString(node, "commit") ?? "미지정"}</b>
        </span>
        <span>
          평가 설정 <b>{metadataString(node, "config") ?? "확인되지 않음"}</b>
        </span>
        <span>
          결과 <b>{metadataString(node, "metrics") ?? "아직 없음"}</b>
        </span>
      </div>
      <button
        type="button"
        className="knowledge-btn knowledge-btn-danger"
        onClick={() => onRemove(placement.id)}
      >
        보드에서 제거
      </button>
      <p className="knowledge-help">지식 항목 자체는 유지됩니다.</p>
    </aside>
  )
}
