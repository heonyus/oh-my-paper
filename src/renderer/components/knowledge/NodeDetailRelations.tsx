import { ExternalLink } from "lucide-react"
import type { JSX } from "react"
import type { NoteFragment } from "../../../shared/fragmentAnchors"
import {
  type EvidenceAnchor,
  type KnowledgeNode,
  type KnowledgeNodeId,
  type KnowledgeRelation,
  type KnowledgeRelationId,
  type RelationPredicate,
  type RelationReviewState,
  relationPredicateSchema,
  relationReviewStateSchema,
} from "../../../shared/knowledgeSchemas"
import type { CreateRelationInput, UpdateRelationInput } from "../../../shared/knowledgeTypes"
import {
  knowledgeNodeKindLabel,
  relationPredicateLabel,
  relationProvenanceSourceLabel,
  relationReviewStateLabel,
} from "./knowledgeLabels"

interface NodeDetailRelationsProps {
  readonly node: KnowledgeNode
  readonly allNodes: readonly KnowledgeNode[]
  readonly relations: readonly KnowledgeRelation[]
  readonly evidenceByRelation: ReadonlyMap<KnowledgeRelationId, readonly EvidenceAnchor[]>
  readonly onCreateRelation: (relation: CreateRelationInput) => Promise<void>
  readonly onUpdateRelation: (relation: UpdateRelationInput) => Promise<void>
  readonly onJumpToEvidence: (anchorId: EvidenceAnchor["id"]) => void
  readonly onSelectNode: (nodeId: KnowledgeNodeId) => void
  readonly onOpenFragment?: ((anchor: NoteFragment) => void) | undefined
  readonly newRelTargetId: KnowledgeNodeId | null
  readonly setNewRelTargetId: (value: KnowledgeNodeId | null) => void
  readonly newRelPredicate: RelationPredicate
  readonly setNewRelPredicate: (value: RelationPredicate) => void
}

const PREDICATES: readonly RelationPredicate[] = [
  "relates_to",
  "cites",
  "discusses",
  "interprets",
  "supported_by",
  "motivates",
  "tests",
  "refutes",
]

const REVIEW_STATES: readonly RelationReviewState[] = [
  "proposed",
  "accepted",
  "rejected",
  "needs_review",
]

function relationNode(
  relation: KnowledgeRelation,
  node: KnowledgeNode,
  nodes: readonly KnowledgeNode[],
): KnowledgeNode | null {
  const otherId = relation.sourceId === node.id ? relation.targetId : relation.sourceId
  return nodes.find((candidate) => candidate.id === otherId) ?? null
}

function parsePredicate(value: string): RelationPredicate | null {
  return relationPredicateSchema.safeParse(value).data ?? null
}

function parseReviewState(value: string): RelationReviewState | null {
  return relationReviewStateSchema.safeParse(value).data ?? null
}

export function NodeDetailRelations({
  node,
  allNodes,
  relations,
  evidenceByRelation,
  onCreateRelation,
  onUpdateRelation,
  onJumpToEvidence,
  onSelectNode,
  onOpenFragment,
  newRelTargetId,
  setNewRelTargetId,
  newRelPredicate,
  setNewRelPredicate,
}: NodeDetailRelationsProps): JSX.Element {
  const uniqueRelations = Array.from(
    new Map(relations.map((relation) => [relation.id, relation])).values(),
  )

  async function addRelation(): Promise<void> {
    if (!newRelTargetId) return
    try {
      await onCreateRelation({
        sourceId: node.id,
        targetId: newRelTargetId,
        predicate: newRelPredicate,
        provenance: { source: "user", model: null, extractorVersion: null },
        reviewState: "accepted",
      })
      setNewRelTargetId(null)
    } catch (cause) {
      if (cause instanceof Error) return
      throw cause
    }
  }

  return (
    <section aria-label="연결 및 백링크">
      <h2 className="knowledge-detail-title">연결 및 백링크</h2>
      {uniqueRelations.length === 0 ? (
        <p className="knowledge-help">아직 연결된 관계가 없습니다.</p>
      ) : (
        <ul className="knowledge-relation-list">
          {uniqueRelations.map((relation) => {
            const otherNode = relationNode(relation, node, allNodes)
            const direction = relation.sourceId === node.id ? "나감" : "들어옴"
            const evidence = evidenceByRelation.get(relation.id) ?? []
            return (
              <li key={relation.id} className="knowledge-relation">
                <div className="knowledge-relation-actions">
                  <span className="knowledge-badge">{direction}</span>
                  <span className="knowledge-badge">
                    {relationPredicateLabel(relation.predicate)}
                  </span>
                  <span className="knowledge-status">
                    출처: {relationProvenanceSourceLabel(relation.provenance.source)}
                  </span>
                  {otherNode ? (
                    <button
                      type="button"
                      className="knowledge-link"
                      onClick={() => onSelectNode(otherNode.id)}
                    >
                      {otherNode.title}
                    </button>
                  ) : (
                    <span className="knowledge-status">대상 노드를 찾을 수 없음</span>
                  )}
                </div>
                {[
                  { side: "source", endpoint: relation.sourceEndpoint },
                  { side: "target", endpoint: relation.targetEndpoint },
                ].map(({ endpoint, side }) => {
                  if (endpoint?.kind !== "note-fragment") return null
                  return (
                    <button
                      key={side}
                      type="button"
                      className="knowledge-link"
                      onClick={() => onOpenFragment?.(endpoint.anchor)}
                    >
                      노트 구절 · {endpoint.anchor.quote}
                    </button>
                  )
                })}
                {evidence.length > 0 ? (
                  <ul className="knowledge-relation-list">
                    {evidence.map((anchor) => (
                      <li key={anchor.id} className="knowledge-help">
                        <button
                          type="button"
                          className="knowledge-link"
                          onClick={() => onJumpToEvidence(anchor.id)}
                        >
                          <ExternalLink size={12} aria-hidden="true" /> p.{anchor.page} ·{" "}
                          {anchor.quote}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="knowledge-help">연결된 원문 증거 없음</p>
                )}
                <div className="knowledge-relation-actions">
                  <label>
                    검토 상태
                    <select
                      className="knowledge-input"
                      value={relation.reviewState}
                      onChange={(event) => {
                        const reviewState = parseReviewState(event.target.value)
                        if (reviewState) void onUpdateRelation({ id: relation.id, reviewState })
                      }}
                      aria-label={`${otherNode?.title ?? "관계"} 검토 상태`}
                    >
                      {REVIEW_STATES.map((state) => (
                        <option key={state} value={state}>
                          {relationReviewStateLabel(state)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <details className="knowledge-relation-create">
        <summary>연결 추가</summary>
        <div className="knowledge-relation-create-body knowledge-relation-actions">
          <label>
            <span>연결 방식</span>
            <select
              className="knowledge-input"
              value={newRelPredicate}
              onChange={(event) => {
                const predicate = parsePredicate(event.target.value)
                if (predicate) setNewRelPredicate(predicate)
              }}
              aria-label="관계 종류"
            >
              {PREDICATES.map((predicate) => (
                <option key={predicate} value={predicate}>
                  {relationPredicateLabel(predicate)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>연결할 지식</span>
            <select
              className="knowledge-input"
              value={newRelTargetId ?? ""}
              onChange={(event) => {
                const target = allNodes.find((candidate) => candidate.id === event.target.value)
                setNewRelTargetId(target?.id ?? null)
              }}
              aria-label="대상 노드 선택"
            >
              <option value="">연결할 지식 선택...</option>
              {allNodes
                .filter((candidate) => candidate.id !== node.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    [{knowledgeNodeKindLabel(candidate.kind)}] {candidate.title}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="knowledge-btn knowledge-btn-primary"
            disabled={!newRelTargetId}
            onClick={() => void addRelation()}
          >
            연결 추가
          </button>
        </div>
      </details>
    </section>
  )
}
