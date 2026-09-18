import { type JSX, useState } from "react"
import type { KnowledgeNode } from "../../../shared/knowledgeSchemas"
import type { CreateRelationInput } from "../../../shared/knowledgeTypes"
import { captureNoteFragment } from "../../lib/captureNoteFragment"

export function NoteFragmentAction({
  node,
  body,
  selection,
  nodes,
  saveBody,
  createRelation,
  onSaved,
}: {
  readonly node: KnowledgeNode
  readonly body: string
  readonly selection: { readonly from: number; readonly to: number }
  readonly nodes: readonly KnowledgeNode[]
  readonly saveBody: (body: string) => Promise<KnowledgeNode>
  readonly createRelation: (input: CreateRelationInput) => Promise<void>
  readonly onSaved: (body: string) => void
}): JSX.Element | null {
  const [targetId, setTargetId] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const target = nodes.find((candidate) => candidate.id === targetId)
  const quote = body.slice(selection.from, selection.to)

  if (!quote.trim()) return null

  async function link(): Promise<void> {
    if (!target || pending) return
    setPending(true)
    setMessage("")
    try {
      const prepared = await captureNoteFragment(node.id, body, selection)
      const saved = await saveBody(prepared.body)
      onSaved(saved.body)
      await createRelation({
        sourceId: saved.id,
        targetId: target.id,
        sourceEndpoint: { kind: "note-fragment", anchor: prepared.anchor },
        targetEndpoint: { kind: "node", nodeId: target.id },
        predicate: "relates_to",
        reviewState: "accepted",
        provenance: { source: "user", model: null, extractorVersion: null },
      })
      setMessage("선택한 구절을 연결했습니다.")
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "구절을 연결하지 못했습니다.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="knowledge-card" aria-label="선택한 구절 연결">
      <p className="knowledge-help">{quote.slice(0, 180)}</p>
      <div className="knowledge-actions">
        <select
          className="knowledge-input"
          aria-label="구절 연결 대상"
          value={targetId}
          disabled={pending}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">연결할 항목 선택</option>
          {nodes
            .filter((item) => item.id !== node.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
        </select>
        <button
          className="knowledge-btn"
          type="button"
          disabled={pending || !quote || !target}
          onClick={() => void link()}
        >
          {pending ? "연결 중…" : "선택한 구절 연결"}
        </button>
      </div>
      {message ? (
        <p className="knowledge-help" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
