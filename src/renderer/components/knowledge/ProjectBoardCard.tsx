import { Move, Trash2 } from "lucide-react"
import type { JSX, KeyboardEvent, PointerEvent } from "react"
import type { KnowledgeNode, PlacementRecord } from "../../../shared/knowledgeSchemas"
import { metadataString } from "../../lib/knowledgeTypes"
import { MarkdownContent } from "../MarkdownContent"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"
import { normalizeKnowledgePreview } from "./NeighbourGraphParts"

export interface ProjectBoardCardProps {
  readonly node: KnowledgeNode
  readonly placement: PlacementRecord
  readonly onRemove: (id: PlacementRecord["id"]) => void
  readonly onSelect: (placement: PlacementRecord) => void
  readonly onNodeClick: (id: KnowledgeNode["id"]) => void
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void
  readonly onKeyboardMove: (event: KeyboardEvent<HTMLButtonElement>) => void
}

export function ProjectBoardCard({
  node,
  placement,
  onRemove,
  onSelect,
  onNodeClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyboardMove,
}: ProjectBoardCardProps): JSX.Element {
  const commit = metadataString(node, "commit")
  const metrics = metadataString(node, "metrics")
  const config = metadataString(node, "config")
  const hypothesis = metadataString(node, "hypothesisId")
  return (
    <article
      className="knowledge-placement"
      style={{ left: placement.x, top: placement.y, width: placement.width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="knowledge-placement-toolbar">
        <span className="knowledge-badge">{knowledgeNodeKindLabel(node.kind)}</span>
        <button
          type="button"
          className="knowledge-icon-btn"
          onClick={() => onRemove(placement.id)}
          aria-label={`${node.title} 배치 제거`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="knowledge-icon-btn"
          data-drag-handle="true"
          onKeyDown={onKeyboardMove}
          aria-label={`${node.title} 위치 키보드 이동`}
        >
          <Move size={14} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="knowledge-placement-title"
        onClick={() => onSelect(placement)}
      >
        {node.title}
      </button>
      <MarkdownContent
        className="knowledge-preview-body"
        source={normalizeKnowledgePreview(node.body || "내용 없음")}
      />
      {commit || config || metrics || hypothesis ? (
        <small className="knowledge-item-meta">
          {commit ? `commit ${commit}` : null}
          {config ? ` · 설정 ${config}` : null}
          {metrics ? ` · 지표 ${metrics}` : null}
          {hypothesis ? ` · 가설 ${hypothesis}` : null}
        </small>
      ) : null}
      <button type="button" className="knowledge-link" onClick={() => onNodeClick(node.id)}>
        노드 상세
      </button>
    </article>
  )
}
