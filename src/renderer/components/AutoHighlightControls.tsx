import { Sparkles, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import { createAutoHighlightCard, parseAutoHighlightResponse } from "../lib/autoHighlight"
import { cachedPaperOverviewContext } from "../lib/pdfSearch"
import type { AiRequestRunner, BoardCard, DocumentRecord } from "../types"

type RunState =
  | { readonly phase: "idle" }
  | { readonly phase: "running" }
  | { readonly phase: "done"; readonly created: number; readonly missed: number }
  | { readonly phase: "failed"; readonly message: string }

function alreadyHighlighted(cards: readonly BoardCard[], quote: string): boolean {
  const normalized = quote.replace(/\s+/gu, " ").trim().toLocaleLowerCase()
  return cards.some(
    (card) =>
      card.kind === "highlight" &&
      card.anchor.quote.replace(/\s+/gu, " ").trim().toLocaleLowerCase() === normalized,
  )
}

export function AutoHighlightControls({
  document: doc,
  cards,
  provider,
  onCardsChange,
  onAiRequest,
}: {
  readonly document: DocumentRecord
  readonly cards: readonly BoardCard[]
  readonly provider: ProviderStatus
  readonly onCardsChange: (cards: readonly BoardCard[]) => void
  readonly onAiRequest: AiRequestRunner
}): JSX.Element {
  const [state, setState] = useState<RunState>({ phase: "idle" })
  const abortRef = useRef<AbortController | null>(null)
  const cardsRef = useRef(cards)
  useEffect(() => {
    cardsRef.current = cards
  }, [cards])
  useEffect(() => () => abortRef.current?.abort(), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切换文档时重置运行状态
  useEffect(() => {
    setState({ phase: "idle" })
  }, [doc.id])

  async function run(): Promise<void> {
    const boardWorld = window.document.querySelector<HTMLElement>(".board-world")
    const sourceText = doc.overview || cachedPaperOverviewContext(doc.id)
    if (!boardWorld || !sourceText.trim()) {
      setState({ phase: "failed", message: "문서 텍스트를 아직 읽지 못했습니다." })
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setState({ phase: "running" })
    try {
      const response = await onAiRequest(
        {
          action: "auto_highlight",
          page: 1,
          quote: sourceText,
          before: "",
          after: "",
        },
        undefined,
        controller.signal,
      )
      const passages = parseAutoHighlightResponse(response)
      if (passages.length === 0) {
        setState({ phase: "failed", message: "핵심 구절을 찾지 못했습니다." })
        return
      }
      const created: BoardCard[] = []
      let missed = 0
      for (const passage of passages) {
        if (alreadyHighlighted(cardsRef.current, passage.quote)) continue
        const card = createAutoHighlightCard(doc.id, passage, boardWorld)
        if (card) {
          created.push(card)
        } else {
          missed += 1
        }
      }
      if (created.length > 0) onCardsChange([...cardsRef.current, ...created])
      setState({ phase: "done", created: created.length, missed })
    } catch (error) {
      if (controller.signal.aborted) {
        setState({ phase: "idle" })
        return
      }
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : "자동 하이라이트에 실패했습니다.",
      })
    } finally {
      abortRef.current = null
    }
  }

  return (
    <div className="auto-highlight-controls">
      {state.phase === "running" ? (
        <>
          <span className="auto-highlight-status" role="status">
            핵심 구절을 찾는 중…
          </span>
          <button
            type="button"
            className="auto-highlight-cancel"
            onClick={() => abortRef.current?.abort()}
            aria-label="자동 하이라이트 취소"
          >
            <X size={14} /> 취소
          </button>
        </>
      ) : (
        <button
          type="button"
          className="auto-highlight-run"
          onClick={() => void run()}
          disabled={!provider.configured}
          aria-label="자동 하이라이트 실행"
        >
          <Sparkles size={14} /> 자동 하이라이트
        </button>
      )}
      {state.phase === "done" ? (
        <p className="auto-highlight-result">
          {state.created > 0
            ? `${state.created}개 핵심 구절을 표시했습니다.`
            : "새로 표시할 핵심 구절이 없습니다."}
          {state.missed > 0 ? ` ${state.missed}개 구절의 위치는 찾지 못했습니다.` : ""}
        </p>
      ) : null}
      {state.phase === "failed" ? (
        <p className="auto-highlight-result" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
