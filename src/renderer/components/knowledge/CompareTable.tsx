import { ExternalLink, Trash2 } from "lucide-react"
import type { JSX } from "react"
import type {
  DocumentVersionRecord,
  EvidenceAnchor,
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
} from "../../../shared/knowledgeSchemas"
import type { EvidenceNavigationTarget } from "../../../shared/knowledgeTypes"
import {
  metadataBoolean as readBoolean,
  metadataString as readString,
} from "../../lib/knowledgeTypes"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"

export interface CompareEvidenceRecord {
  readonly anchor: EvidenceAnchor
  readonly navigation: EvidenceNavigationTarget
  readonly versions: readonly DocumentVersionRecord[]
}

interface CompareTableProps {
  readonly nodes: readonly KnowledgeNode[]
  readonly evidenceByNode: ReadonlyMap<KnowledgeNodeId, readonly CompareEvidenceRecord[]>
  readonly onRemove: (id: KnowledgeNodeId) => void
  readonly onJumpToEvidence: ((id: EvidenceAnchorId) => void) | undefined
}

function value(value: string | null): JSX.Element {
  return value ? <span>{value}</span> : <span className="knowledge-help">확인되지 않음</span>
}

function EvidenceCell({
  node,
  evidenceByNode,
  onJumpToEvidence,
}: {
  readonly node: KnowledgeNode
  readonly evidenceByNode: ReadonlyMap<KnowledgeNodeId, readonly CompareEvidenceRecord[]>
  readonly onJumpToEvidence: ((id: EvidenceAnchorId) => void) | undefined
}): JSX.Element {
  const evidence = evidenceByNode.get(node.id) ?? []
  if (evidence.length === 0) return <span className="knowledge-help">확인되지 않음</span>
  const first = evidence[0]
  return (
    <div className="knowledge-compare-evidence-cell">
      {evidence.map((item) => (
        <button
          key={item.anchor.id}
          type="button"
          className="knowledge-link"
          onClick={() => onJumpToEvidence?.(item.anchor.id)}
        >
          p.{item.anchor.page} · {item.anchor.quote}
        </button>
      ))}
      {first ? (
        <small className="knowledge-item-meta">
          문서 {first.navigation.originalDocumentId.slice(0, 12)} · hash{" "}
          {first.navigation.hash.slice(0, 10)} ·{" "}
          {first.versions.length ? "버전 확인" : "버전 확인 필요"}
        </small>
      ) : null}
    </div>
  )
}

export function CompareTable({
  nodes,
  evidenceByNode,
  onRemove,
  onJumpToEvidence,
}: CompareTableProps): JSX.Element {
  const rows: readonly {
    readonly label: string
    readonly cell: (node: KnowledgeNode) => JSX.Element
  }[] = [
    {
      label: "유형",
      cell: (node) => <span className="knowledge-badge">{knowledgeNodeKindLabel(node.kind)}</span>,
    },
    { label: "연구 질문", cell: (node) => value(readString(node, "research_question")) },
    {
      label: "데이터·분할",
      cell: (node) => value(readString(node, "data_split") ?? readString(node, "data")),
    },
    { label: "방법", cell: (node) => value(readString(node, "method")) },
    { label: "평가 조건", cell: (node) => value(readString(node, "evaluation_conditions")) },
    {
      label: "평가 지표",
      cell: (node) => value(readString(node, "metric") ?? readString(node, "metrics")),
    },
    { label: "실험 예산", cell: (node) => value(readString(node, "budget")) },
    { label: "한계", cell: (node) => value(readString(node, "limitations")) },
    {
      label: "원문 증거",
      cell: (node) => (
        <EvidenceCell
          node={node}
          evidenceByNode={evidenceByNode}
          onJumpToEvidence={onJumpToEvidence}
        />
      ),
    },
    {
      label: "전문 검토",
      cell: (node) =>
        node.kind === "paper" ? (
          <span>
            {readBoolean(node, "isFullTextReviewed") === true
              ? "전문 검토됨"
              : "메타데이터만 확인됨 · 전문 검토 아님"}
          </span>
        ) : (
          <span className="knowledge-help">해당 없음</span>
        ),
    },
  ]
  return (
    <div className="knowledge-table-wrap">
      <table className="knowledge-table">
        <thead>
          <tr>
            <th scope="col">비교 항목</th>
            {nodes.map((node) => (
              <th scope="col" key={node.id}>
                <div className="knowledge-compare-heading">
                  <span>{node.title}</span>
                  <button
                    type="button"
                    className="knowledge-icon-btn"
                    onClick={() => onRemove(node.id)}
                    aria-label={`${node.title} 비교에서 제거`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {nodes.map((node) => (
                <td key={`${row.label}-${node.id}`}>{row.cell(node)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CompareEvidenceAside({
  evidence,
  onJumpToEvidence,
}: {
  readonly evidence: readonly CompareEvidenceRecord[]
  readonly onJumpToEvidence: ((id: EvidenceAnchorId) => void) | undefined
}): JSX.Element {
  const first = evidence[0]
  return (
    <aside className="knowledge-compare-aside" aria-label="선택한 근거">
      {" "}
      <div className="knowledge-section-title">
        <strong>선택한 근거</strong>
        <span>{evidence.length}개</span>
      </div>
      {first ? (
        <>
          <p className="knowledge-compare-source">
            {first.navigation.originalDocumentId.slice(0, 18)} · {first.anchor.page}쪽
          </p>
          <blockquote>{first.anchor.quote}</blockquote>
          {onJumpToEvidence ? (
            <button
              type="button"
              className="knowledge-btn"
              onClick={() => onJumpToEvidence(first.anchor.id)}
            >
              PDF에서 확인 <ExternalLink size={14} aria-hidden="true" />
            </button>
          ) : null}
        </>
      ) : (
        <p className="knowledge-help">원문 증거를 선택하면 이곳에 표시됩니다.</p>
      )}
      <p className="knowledge-help">확인되지 않은 조건은 빈 추정값으로 채우지 않습니다.</p>
    </aside>
  )
}
