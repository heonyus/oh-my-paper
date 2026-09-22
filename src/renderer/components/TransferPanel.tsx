import { Link2 } from "lucide-react"
import { type JSX, useEffect, useState } from "react"
import type { KnowledgeNode, KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import type { BoardCard, DocumentRecord } from "../../shared/schemas"
import type { KnowledgeClientOps } from "../lib/knowledgeTypes"

export function TransferPanel({
  document,
  cards,
  clientOps,
  onNodeCreated,
}: {
  readonly document: DocumentRecord | null
  readonly cards: readonly BoardCard[]
  readonly clientOps: KnowledgeClientOps
  readonly onNodeCreated?: (id: KnowledgeNodeId) => void
}): JSX.Element {
  const [concepts, setConcepts] = useState<readonly KnowledgeNode[]>([])
  const [cardId, setCardId] = useState("")
  const [conceptId, setConceptId] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  const sourceCards = cards.filter((card) => card.kind !== "sticky" && card.anchor.quote.trim())

  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void clientOps
        .findNodes({ search, limit: 100 })
        .then((nodes) => {
          if (current) setConcepts(nodes)
        })
        .catch((error: unknown) => {
          if (current) setMessage(error instanceof Error ? error.message : "검색 실패")
        })
    }, 180)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [clientOps, search])

  async function transfer(): Promise<void> {
    const card = sourceCards.find((candidate) => candidate.id === cardId)
    if (!document || !card) {
      setMessage("읽기 카드와 문서를 선택하세요.")
      return
    }
    setBusy(true)
    try {
      const existing = concepts.find((candidate) => candidate.id === conceptId)
      if (conceptId && !existing) throw new Error("대상 지식을 다시 선택하세요.")
      const concept = await window.ohmypaper.knowledge.linkEvidence({
        documentId: document.id,
        hash: document.hash,
        anchor: card.anchor,
        target: existing
          ? { type: "existing", nodeId: existing.id }
          : { type: "new", kind: "concept", title: newTitle.trim() || card.title },
      })
      setMessage(`“${concept.title}”에 원문 증거를 연결했습니다.`)
      onNodeCreated?.(concept.id)
      if (!conceptId) setConcepts(await clientOps.findNodes({ search, limit: 100 }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "증거 연결에 실패했습니다.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="knowledge-card" aria-label="읽기 카드에서 개념으로 전송">
      <header className="knowledge-actions">
        <Link2 size={16} aria-hidden="true" />
        <h2>지식으로 연결</h2>
      </header>
      <p className="knowledge-help">
        선택한 카드의 페이지·인용문을 문서 버전에 고정하고 개념 관계로 저장합니다.
      </p>
      <label className="knowledge-row" htmlFor="transfer-card">
        <span>읽기 카드</span>
        <select
          id="transfer-card"
          className="knowledge-input"
          value={cardId}
          onChange={(event) => setCardId(event.target.value)}
        >
          <option value="">카드 선택...</option>
          {sourceCards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.title}
            </option>
          ))}
        </select>
      </label>
      <label className="knowledge-row">
        지식 검색
        <input
          className="knowledge-input"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setConceptId("")
          }}
        />
      </label>
      <label className="knowledge-row" htmlFor="transfer-concept">
        <span>기존 개념</span>
        <select
          id="transfer-concept"
          className="knowledge-input"
          value={conceptId}
          onChange={(event) => setConceptId(event.target.value)}
        >
          <option value="">새 개념 만들기</option>
          {concepts.map((concept) => (
            <option key={concept.id} value={concept.id}>
              {concept.title}
            </option>
          ))}
        </select>
      </label>
      {!conceptId ? (
        <label className="knowledge-row" htmlFor="transfer-new-title">
          <span>새 개념 이름</span>
          <input
            id="transfer-new-title"
            className="knowledge-input"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="개념 제목"
          />
        </label>
      ) : null}
      <button
        type="button"
        className="knowledge-btn knowledge-btn-primary"
        disabled={busy || !cardId || !document}
        onClick={() => void transfer()}
      >
        {busy ? "연결 중…" : "증거로 연결"}
      </button>
      {message ? (
        <p className="knowledge-status" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
