import { type JSX, useEffect, useRef, useState } from "react"
import { ZodError } from "zod"
import type { OwnWordsCheck } from "../../shared/ownWords"
import { ownWordsText } from "../lib/ownWordsCheck"
import { flashQuoteOnPage } from "../lib/sourceQuoteFlash"
import type { BoardCard } from "../types"
import { MarkdownContent } from "./MarkdownContent"

/** The fixed body annotation cards had before they became the reader's own words. */
const LEGACY_NOTE_BODY = "이 구절에 연결된 메모입니다."

const verdictLabels: Readonly<Record<OwnWordsCheck["verdict"], string>> = {
  match: "맞음",
  missing: "빠짐",
  diverges: "어긋남",
  unverifiable: "확인 불가",
}

export function ownWordsBody(card: BoardCard): string {
  return card.body === LEGACY_NOTE_BODY ? "" : card.body
}

function checkFailure(error: unknown): string {
  if (error instanceof SyntaxError || error instanceof ZodError)
    return "대조 결과를 읽지 못했습니다. 다시 시도해주세요."
  return "대조하지 못했습니다. AI 연결을 확인한 뒤 다시 시도해주세요."
}

/**
 * A `내 말로` card: the reader writes what the selected passage says, then may check it
 * against that passage. The AI never writes into the card; it only returns a quoted verdict.
 */
export function OwnWordsCard({
  card,
  autoEdit,
  onBodyChange,
  onCheck,
  onCheckChange,
  onJump,
}: {
  readonly card: BoardCard
  readonly autoEdit: boolean
  readonly onBodyChange: (body: string) => void
  readonly onCheck?: ((card: BoardCard, signal: AbortSignal) => Promise<OwnWordsCheck>) | undefined
  readonly onCheckChange: (check: OwnWordsCheck) => void
  readonly onJump: (page: number) => void
}): JSX.Element {
  const body = ownWordsBody(card)
  const [editing, setEditing] = useState(autoEdit || body.trim() === "")
  const [draft, setDraft] = useState(body)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState({ text: "", failed: false })
  const editor = useRef<HTMLTextAreaElement>(null)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (editing) editor.current?.focus()
  }, [editing])

  function finishEditing(): void {
    if (draft !== body) onBodyChange(draft)
    if (draft.trim()) setEditing(false)
  }

  async function runCheck(): Promise<void> {
    if (!onCheck) return
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setChecking(true)
    setMessage({ text: "", failed: false })
    try {
      const check = await onCheck(card, controller.signal)
      if (!controller.signal.aborted) onCheckChange(check)
    } catch (error) {
      if (!controller.signal.aborted) setMessage({ text: checkFailure(error), failed: true })
    } finally {
      if (active.current === controller) {
        active.current = null
        setChecking(false)
      }
    }
  }

  const check = card.ownCheck
  const stale = check !== undefined && check.text !== ownWordsText(card)
  const quote = check?.quote ?? null
  return (
    <div className="own-words">
      {editing ? (
        <textarea
          ref={editor}
          className="post-it-editor own-words-editor"
          aria-label="내 말로 쓴 내용"
          value={draft}
          placeholder="이 구절이 말하는 것을 내 말로 적어보세요"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.currentTarget.blur()
            } else if (event.key === "Escape" && body.trim()) {
              setDraft(body)
              setEditing(false)
            }
          }}
        />
      ) : (
        <div className="card-markdown">
          <MarkdownContent source={body} />
        </div>
      )}
      {check ? (
        <section className="own-words-check" aria-label="원문 대조 결과" data-stale={stale}>
          <span className="own-summary-verdict" data-verdict={check.verdict}>
            {verdictLabels[check.verdict]}
          </span>
          <p>{check.note}</p>
          {quote ? (
            <button
              type="button"
              className="own-summary-source"
              aria-label={`근거 원문 ${card.anchor.page}쪽으로 이동`}
              onClick={() => {
                onJump(card.anchor.page)
                flashQuoteOnPage(card.anchor.page, quote)
              }}
            >
              <span>p.{card.anchor.page}</span> “{quote}”
            </button>
          ) : null}
          {stale ? <p className="own-words-stale">고친 문장은 아직 대조하지 않았습니다.</p> : null}
        </section>
      ) : null}
      <p className="own-summary-status" role="status" data-failed={!checking && message.failed}>
        {checking ? "선택한 구절과 대조하는 중" : message.text}
      </p>
      {!editing ? (
        <div className="own-words-actions">
          <button
            type="button"
            className="source-link"
            disabled={checking || !onCheck}
            onClick={() => void runCheck()}
          >
            {check && !stale ? "다시 대조" : "원문과 대조"}
          </button>
          <button
            type="button"
            className="source-link"
            disabled={checking}
            onClick={() => {
              setDraft(body)
              setEditing(true)
            }}
          >
            고쳐 쓰기
          </button>
        </div>
      ) : null}
    </div>
  )
}
