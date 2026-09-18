import { FilePlus2 } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type {
  DocumentVersionRecord,
  EvidenceAnchor,
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
} from "../../../shared/knowledgeSchemas"
import type { EvidenceNavigationTarget } from "../../../shared/knowledgeTypes"
import type { KnowledgeClientOps } from "../../lib/knowledgeTypes"
import { CompareEvidenceAside, type CompareEvidenceRecord, CompareTable } from "./CompareTable"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"
import "./knowledge.css"

export interface CompareViewProps {
  readonly clientOps: KnowledgeClientOps
  readonly onJumpToEvidence?: (anchorId: EvidenceAnchorId) => void
  readonly isVisible?: boolean
}

function isEvidenceRecord(value: CompareEvidenceRecord | null): value is CompareEvidenceRecord {
  return value !== null
}

export function CompareView({
  clientOps,
  onJumpToEvidence,
  isVisible = true,
}: CompareViewProps): JSX.Element {
  const [allNodes, setAllNodes] = useState<readonly KnowledgeNode[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly KnowledgeNodeId[]>([])
  const [evidenceByNode, setEvidenceByNode] = useState<
    ReadonlyMap<KnowledgeNodeId, readonly CompareEvidenceRecord[]>
  >(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const listGeneration = useRef(0)
  const evidenceGeneration = useRef(0)

  useEffect(() => {
    if (!isVisible) return
    const request = ++listGeneration.current
    setLoading(true)
    setError(null)
    void clientOps
      .findNodes()
      .then((nodes) => {
        if (listGeneration.current === request) {
          setAllNodes(nodes)
          setSelectedNodeIds((current) =>
            current.filter((id) => nodes.some((node) => node.id === id)),
          )
          setRefreshToken(request)
          setLoading(false)
        }
      })
      .catch((cause: unknown) => {
        if (listGeneration.current === request) {
          setError(cause instanceof Error ? cause.message : "비교 대상을 불러오지 못했습니다.")
          setLoading(false)
        }
      })
  }, [clientOps, isVisible])

  const comparedNodes = selectedNodeIds
    .map((id) => allNodes.find((node) => node.id === id))
    .filter((node): node is KnowledgeNode => Boolean(node))
  useEffect(() => {
    void refreshToken
    const request = ++evidenceGeneration.current
    setError(null)
    if (selectedNodeIds.length === 0) {
      setEvidenceByNode(new Map())
      return
    }
    void Promise.all(
      selectedNodeIds.map(async (nodeId) => {
        const relations = await clientOps.findRelations({ nodeId })
        const anchorIds = Array.from(new Set(relations.flatMap((relation) => relation.evidenceIds)))
        const evidence = await Promise.all(
          anchorIds.map(async (anchorId): Promise<CompareEvidenceRecord | null> => {
            const anchor: EvidenceAnchor | null = await clientOps.getEvidenceAnchor(anchorId)
            if (!anchor) return null
            const navigation: EvidenceNavigationTarget | null =
              await clientOps.getEvidenceNavigation(anchor.id)
            if (!navigation) return null
            const versions: readonly DocumentVersionRecord[] = await clientOps.getDocVersionsByHash(
              navigation.hash,
            )
            return { anchor, navigation, versions }
          }),
        )
        return { nodeId, evidence: evidence.filter(isEvidenceRecord) }
      }),
    )
      .then((records) => {
        if (evidenceGeneration.current !== request) return
        const next = new Map<KnowledgeNodeId, readonly CompareEvidenceRecord[]>()
        records.forEach((record) => {
          next.set(record.nodeId, record.evidence)
        })
        setEvidenceByNode(next)
      })
      .catch((cause: unknown) => {
        if (evidenceGeneration.current === request)
          setError(cause instanceof Error ? cause.message : "원문 증거를 불러오지 못했습니다.")
      })
  }, [clientOps, refreshToken, selectedNodeIds])

  const addNode = (id: KnowledgeNodeId): void => {
    if (selectedNodeIds.length < 4 && !selectedNodeIds.includes(id))
      setSelectedNodeIds([...selectedNodeIds, id])
  }
  const removeNode = (id: KnowledgeNodeId): void =>
    setSelectedNodeIds(selectedNodeIds.filter((selectedId) => selectedId !== id))
  const selectedEvidence = comparedNodes
    .flatMap((node) => evidenceByNode.get(node.id) ?? [])
    .slice(0, 1)

  return (
    <div className="knowledge-shell knowledge-compare-view">
      <header className="knowledge-header knowledge-compare-header">
        <div className="knowledge-heading-block">
          <h2>연구 조건 비교</h2>
          <p>같은 조건인지 확인하고 원문으로 돌아갑니다.</p>
        </div>
        <label className="knowledge-select-label">
          비교 항목 추가
          <select
            className="knowledge-input"
            value=""
            disabled={selectedNodeIds.length >= 4 || loading}
            onChange={(event) => {
              const node = allNodes.find((candidate) => candidate.id === event.target.value)
              if (node) addNode(node.id)
            }}
            aria-label="비교할 노드 추가"
          >
            <option value="">논문·주장 추가...</option>
            {allNodes
              .filter((node) => !selectedNodeIds.includes(node.id))
              .map((node) => (
                <option key={node.id} value={node.id}>
                  [{knowledgeNodeKindLabel(node.kind)}] {node.title}
                </option>
              ))}
          </select>
        </label>
      </header>
      {error ? (
        <p className="knowledge-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="knowledge-btn"
            onClick={() => setSelectedNodeIds([...selectedNodeIds])}
          >
            다시 시도
          </button>
        </p>
      ) : null}
      {comparedNodes.length > 0 ? (
        <div className="knowledge-compare-layout">
          <main className="knowledge-compare-main">
            <div className="knowledge-compare-chip-row">
              {comparedNodes.map((node) => (
                <span className="knowledge-compare-chip" key={node.id}>
                  {node.title}
                  <button
                    type="button"
                    aria-label={`${node.title} 비교에서 제거`}
                    onClick={() => removeNode(node.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="knowledge-compare-limit">{comparedNodes.length}/4 선택</span>
            </div>
            <CompareTable
              nodes={comparedNodes}
              evidenceByNode={evidenceByNode}
              onRemove={removeNode}
              onJumpToEvidence={onJumpToEvidence}
            />
            <p className="knowledge-compare-note">
              ⓘ 확인되지 않은 조건은 빈 추정값으로 채워지지 않습니다.
            </p>
          </main>
          <CompareEvidenceAside evidence={selectedEvidence} onJumpToEvidence={onJumpToEvidence} />
        </div>
      ) : (
        <section className="knowledge-pane knowledge-detail-pane knowledge-compare-empty">
          <FilePlus2 size={28} aria-hidden="true" />
          <p>비교할 주장이나 논문을 선택하세요.</p>
          <span>선택한 항목의 관계에 연결된 원문과 알려진 평가 조건만 표시합니다.</span>
        </section>
      )}
    </div>
  )
}
