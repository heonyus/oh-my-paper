import { type JSX, useEffect, useState } from "react"
import type {
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
} from "../../shared/knowledgeSchemas"
import "./knowledge/knowledge.css"

export function KnowledgeProposalDialog({
  onClose,
  onJumpToEvidence,
}: {
  readonly onClose: () => void
  readonly onJumpToEvidence: (id: EvidenceAnchorId) => void
}): JSX.Element {
  const [nodes, setNodes] = useState<readonly KnowledgeNode[]>([])
  const [selected, setSelected] = useState<readonly KnowledgeNode[]>([])
  const [query, setQuery] = useState("")
  const [relations, setRelations] = useState<readonly KnowledgeRelation[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const api = window.ohmypaper.knowledge
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void window.ohmypaper.knowledge
        .findNodes({ search: query, limit: 100 })
        .then((items) => {
          if (current) setNodes(items)
        })
        .catch((error: unknown) => {
          if (current) setMessage(String(error))
        })
    }, 180)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])
  const title = (id: KnowledgeNodeId): string =>
    selected.find((node) => node.id === id)?.title ?? id
  async function generate(): Promise<void> {
    setBusy(true)
    setMessage("")
    setRelations([])
    try {
      const result = await api.proposeRelations(selected.map((node) => node.id))
      setRelations(result)
      setMessage(
        result.length
          ? `${result.length}개 제안 · 검토 후 결정하세요.`
          : "현재 근거로 제안할 연결이 없습니다.",
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "제안 실패")
    } finally {
      setBusy(false)
    }
  }
  async function review(
    relation: KnowledgeRelation,
    state: "accepted" | "rejected",
  ): Promise<void> {
    setBusy(true)
    try {
      const updated = await api.updateRelation({ id: relation.id, reviewState: state })
      setRelations((items) => items.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <section
        className="settings-modal data-exchange-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI 연결 제안"
      >
        <div className="settings-content">
          <header className="settings-content-head">
            <h2>AI 연결 제안</h2>
            <button
              type="button"
              className="settings-btn-secondary"
              disabled={busy}
              onClick={onClose}
            >
              닫기
            </button>
          </header>
          <div className="settings-content-body knowledge-pane">
            <p>
              선택한 2–12개 항목의 제목·본문 일부와 연결된 원문 근거를 현재 AI 연결로 보냅니다.
              결과는 제안으로 저장하며, 승인 전에는 확정된 관계가 아닙니다.
            </p>
            <label className="knowledge-row">
              지식 검색
              <input
                className="knowledge-input"
                value={query}
                disabled={busy}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p>
              선택 {selected.length}/12 · {selected.map((node) => node.title).join(", ") || "없음"}
            </p>
            <ul className="proposal-node-list">
              {nodes.map((node) => {
                const checked = selected.some((item) => item.id === node.id)
                return (
                  <li key={node.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy || (!checked && selected.length === 12)}
                        onChange={() =>
                          setSelected((items) =>
                            checked
                              ? items.filter((item) => item.id !== node.id)
                              : [...items, node],
                          )
                        }
                      />
                      {node.title}
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="knowledge-actions">
              <button
                type="button"
                disabled={busy || selected.length < 2}
                onClick={() => void generate()}
              >
                선택한 근거로 제안 생성
              </button>
              {busy ? (
                <button
                  type="button"
                  onClick={() =>
                    void api.cancelProposal().catch((error: unknown) => setMessage(String(error)))
                  }
                >
                  생성 취소
                </button>
              ) : null}
            </div>
            {message ? <p role="status">{message}</p> : null}
            <ul className="knowledge-relation-list">
              {relations.map((relation) => (
                <li className="knowledge-card" key={relation.id}>
                  <p>
                    {title(relation.sourceId)} → {relation.predicate} → {title(relation.targetId)}
                  </p>
                  <p>
                    {relation.reviewState === "proposed"
                      ? "검토 전"
                      : relation.reviewState === "accepted"
                        ? "승인됨"
                        : "거절됨"}{" "}
                    · {relation.provenance.model}
                  </p>
                  <div className="knowledge-actions">
                    {relation.evidenceIds.map((id, index) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() => {
                          onClose()
                          onJumpToEvidence(id)
                        }}
                      >
                        근거 {index + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy || relation.reviewState !== "proposed"}
                      onClick={() => void review(relation, "accepted")}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={busy || relation.reviewState !== "proposed"}
                      onClick={() => void review(relation, "rejected")}
                    >
                      거절
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
