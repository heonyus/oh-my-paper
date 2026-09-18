import { ExternalLink, FileText, FlaskConical, HelpCircle, Lightbulb, Network } from "lucide-react"
import type { JSX } from "react"
import type {
  EvidenceAnchor,
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
} from "../../../shared/knowledgeSchemas"
import type { NodeNeighbourGraph } from "../../../shared/knowledgeTypes"
import { MarkdownContent } from "../MarkdownContent"
import {
  knowledgeNodeKindLabel,
  relationPredicateLabel,
  relationReviewStateLabel,
} from "./knowledgeLabels"

export function normalizeKnowledgePreview(source: string): string {
  return source
    .replace(/\[\[[^|\]\n]+\|([^\]\n]+)\]\]/gu, "$1")
    .replace(/\[\[[^\]\n]+\]\]/gu, "연결된 지식")
}

export function nodeIcon(kind: KnowledgeNode["kind"]): JSX.Element {
  if (kind === "question") return <HelpCircle size={16} aria-hidden="true" />
  if (kind === "hypothesis" || kind === "experiment")
    return <FlaskConical size={16} aria-hidden="true" />
  if (kind === "concept" || kind === "claim") return <Lightbulb size={16} aria-hidden="true" />
  return <FileText size={16} aria-hidden="true" />
}

function otherNodeId(relation: KnowledgeRelation, rootId: KnowledgeNodeId): KnowledgeNodeId {
  return relation.sourceId === rootId ? relation.targetId : relation.sourceId
}

export function GraphList({
  graph,
  relations,
  selectedNodeId,
  onNodeClick,
  onEvidenceClick,
  expanded = false,
}: {
  readonly graph: NodeNeighbourGraph
  readonly relations: readonly KnowledgeRelation[]
  readonly selectedNodeId: KnowledgeNodeId
  readonly onNodeClick: (id: KnowledgeNodeId) => void
  readonly onEvidenceClick: ((id: EvidenceAnchorId) => void) | undefined
  readonly expanded?: boolean
}): JSX.Element {
  return (
    <section
      className={`neighbour-graph-list${expanded ? " neighbour-graph-list-expanded" : ""}`}
      aria-label="연결 목록"
    >
      <div className="neighbour-graph-section-title">
        <strong>{expanded ? "전체 관계" : "연결 목록"}</strong>
        <span>{relations.length}개</span>
      </div>
      <ul className="neighbour-graph-relation-list">
        {relations.length === 0 ? (
          <li className="neighbour-graph-empty">필터에 맞는 관계가 없습니다.</li>
        ) : (
          relations.map((relation) => {
            const otherNode = graph.nodes.find(
              (node) => node.id === otherNodeId(relation, graph.rootNode.id),
            )
            const evidenceId = relation.evidenceIds[0]
            return (
              <li key={relation.id} className="neighbour-graph-relation-card">
                <div className="neighbour-graph-relation-title">
                  <span className="neighbour-graph-icon-box">
                    {otherNode ? nodeIcon(otherNode.kind) : <FileText size={16} />}
                  </span>
                  <button
                    type="button"
                    className="neighbour-graph-link"
                    data-selected={otherNode?.id === selectedNodeId}
                    onClick={() => otherNode && onNodeClick(otherNode.id)}
                  >
                    {otherNode?.title ?? "대상 노드 없음"}
                  </button>
                </div>
                <div className="neighbour-graph-relation-meta">
                  <span>
                    {relation.sourceId === graph.rootNode.id ? "나가는 관계" : "들어오는 관계"}
                  </span>
                  <span>{relationPredicateLabel(relation.predicate)}</span>
                  <span data-review-state={relation.reviewState}>
                    {relationReviewStateLabel(relation.reviewState)}
                  </span>
                </div>
                {evidenceId && onEvidenceClick ? (
                  <button
                    type="button"
                    className="neighbour-graph-evidence-link"
                    onClick={() => onEvidenceClick(evidenceId)}
                  >
                    원문 근거 열기 <ExternalLink size={13} />
                  </button>
                ) : null}
              </li>
            )
          })
        )}
      </ul>
    </section>
  )
}

export function GraphDetail({
  root,
  evidence,
  proposals,
  isRootSelection,
  onEvidenceClick,
  onOpenNode,
  onExploreNode,
}: {
  readonly root: KnowledgeNode
  readonly evidence: readonly EvidenceAnchor[]
  readonly proposals: readonly KnowledgeRelation[]
  readonly isRootSelection: boolean
  readonly onEvidenceClick: ((id: EvidenceAnchorId) => void) | undefined
  readonly onOpenNode: (id: KnowledgeNodeId) => void
  readonly onExploreNode: (id: KnowledgeNodeId) => void
}): JSX.Element {
  return (
    <aside className="neighbour-graph-detail" aria-label="선택한 항목 상세">
      <div className="neighbour-graph-detail-topline">
        <span className="neighbour-graph-eyebrow">
          <Network size={14} /> 선택한 항목
        </span>
        <span className="neighbour-graph-badge">{knowledgeNodeKindLabel(root.kind)}</span>
      </div>
      <h3>선택 · {root.title}</h3>
      <MarkdownContent
        className="neighbour-graph-detail-body knowledge-preview-body"
        source={normalizeKnowledgePreview(root.body || "내용이 기록되지 않았습니다.")}
      />
      <div className="neighbour-graph-detail-actions">
        <button
          type="button"
          className="neighbour-graph-primary"
          onClick={() => onOpenNode(root.id)}
        >
          지식에서 열기
        </button>
        <button
          type="button"
          className="neighbour-graph-secondary"
          disabled={isRootSelection}
          onClick={() => onExploreNode(root.id)}
        >
          {isRootSelection ? "현재 탐색 기준" : "이 항목 주변 탐색"}
        </button>
      </div>
      <div className="neighbour-graph-divider" />
      <section>
        <div className="neighbour-graph-section-title">
          <strong>원문 근거</strong>
          <span>{evidence.length}개</span>
        </div>
        {evidence.length === 0 ? (
          <p className="neighbour-graph-help">연결된 원문 근거가 없습니다.</p>
        ) : (
          <ul className="neighbour-graph-evidence-list">
            {evidence.map((anchor) => (
              <li key={anchor.id}>
                <span>p.{anchor.page}</span>
                <p>“{anchor.quote}”</p>
                {onEvidenceClick ? (
                  <button
                    type="button"
                    className="neighbour-graph-secondary"
                    onClick={() => onEvidenceClick(anchor.id)}
                  >
                    원문 보기 <ExternalLink size={13} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="neighbour-graph-proposal-section">
        <div className="neighbour-graph-section-title">
          <strong>검토 전 제안</strong>
          <span>{proposals.length}개</span>
        </div>
        {proposals.length === 0 ? (
          <p className="neighbour-graph-help">검토가 필요한 제안이 없습니다.</p>
        ) : (
          proposals.map((relation) => (
            <div key={relation.id} className="neighbour-graph-proposal-card">
              <span>{relationPredicateLabel(relation.predicate)}</span>
              <p>연결 대상과 관계를 확인해 주세요.</p>
              <small>{relationReviewStateLabel(relation.reviewState)}</small>
            </div>
          ))
        )}
      </section>
    </aside>
  )
}
