import { type JSX, useEffect, useRef, useState } from "react"
import {
  type FragmentLocation,
  locateNoteFragment,
  type NoteFragment,
} from "../../../shared/fragmentAnchors"
import type { KnowledgeNode } from "../../../shared/knowledgeSchemas"

const CONTEXT_LENGTH = 180
const OH_MY_PAPER_BLOCK_COMMENT =
  /<!-- ohmypaper:block:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} -->/gi

function hideBookkeepingComments(text: string): string {
  return text.replace(OH_MY_PAPER_BLOCK_COMMENT, "")
}

function fragmentContext(body: string, location: FragmentLocation | null, quote: string) {
  if (location?.status !== "resolved") {
    return { before: "", quote, after: "", clippedBefore: false, clippedAfter: false }
  }
  const start = Math.max(0, location.from - CONTEXT_LENGTH)
  const end = Math.min(body.length, location.to + CONTEXT_LENGTH)
  return {
    before: hideBookkeepingComments(body.slice(start, location.from)),
    quote: body.slice(location.from, location.to),
    after: hideBookkeepingComments(body.slice(location.to, end)),
    clippedBefore: start > 0,
    clippedAfter: end < body.length,
  }
}

export function NoteFragmentSource({
  node,
  anchor,
  onClose,
}: {
  readonly node: KnowledgeNode
  readonly anchor: NoteFragment
  readonly onClose: () => void
}): JSX.Element {
  const input = useRef<HTMLTextAreaElement>(null)
  const [location, setLocation] = useState<FragmentLocation | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  useEffect(() => {
    let current = true
    setLocation(null)
    void crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(node.body))
      .then((digest) => {
        if (!current) return
        const revision = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")
        const result = locateNoteFragment(anchor, { text: node.body, revision })
        setLocation(result)
      })
      .catch(() => {
        if (current) setLocation({ status: "needs_repair", reason: "missing" })
      })
    return () => {
      current = false
    }
  }, [node.body, anchor])
  useEffect(() => {
    if (!sourceOpen || location?.status !== "resolved" || !input.current) return
    input.current.focus()
    input.current.setSelectionRange(location.from, location.to)
    input.current.scrollIntoView({ block: "nearest" })
  }, [location, sourceOpen])
  const context = fragmentContext(node.body, location, anchor.quote)
  return (
    <section className="knowledge-card" aria-label="연결된 노트 구절">
      <div className="knowledge-actions">
        <strong>원문 구절</strong>
        <button type="button" className="knowledge-btn" onClick={onClose}>
          구절 보기 닫기
        </button>
      </div>
      <section className="knowledge-fragment-context" aria-label="연결된 구절 문맥">
        {context.clippedBefore ? "…" : null}
        {context.before}
        <mark>{context.quote}</mark>
        {context.after}
        {context.clippedAfter ? "…" : null}
      </section>
      <p className="knowledge-help" role="status">
        {!location
          ? "현재 본문과 대조 중…"
          : location.status === "resolved"
            ? sourceOpen
              ? "현재 원문에서 연결된 구절을 선택했습니다."
              : "현재 본문에서 연결 위치를 확인했습니다."
            : "연결 위치 확인 필요 · 본문이 삭제되거나 구절이 여러 곳에 있습니다."}
      </p>
      <details
        className="knowledge-source-details"
        onToggle={(event) => setSourceOpen(event.currentTarget.open)}
      >
        <summary>마크다운 원문 및 위치</summary>
        <textarea
          ref={input}
          className="knowledge-textarea"
          value={node.body}
          readOnly
          rows={8}
          aria-label="연결된 구절의 현재 마크다운 원문"
        />
      </details>
    </section>
  )
}
