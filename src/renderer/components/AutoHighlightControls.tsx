import { Sparkles, X } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import { JEV_DECISION_MODEL } from "../../shared/aiDecision"
import type { ProviderStatus } from "../../shared/ipc"
import {
  type AutoHighlightPassage,
  createAutoHighlightCard,
  parseAutoHighlightResponse,
} from "../lib/autoHighlight"
import {
  type AutoHighlightCandidate,
  autoHighlightSourceEvidence,
  collectAutoHighlightCandidates,
} from "../lib/autoHighlightCandidates"
import { selectJevHighlightPassages } from "../lib/autoHighlightJev"
import { cachedPaperOverviewContext } from "../lib/pdfSearch"
import type { AiRequestRunner, BoardCard, DocumentRecord } from "../types"

type RunState =
  | { readonly phase: "idle" }
  | { readonly phase: "running"; readonly source: "provider" | "jev" }
  | {
      readonly phase: "done"
      readonly created: number
      readonly missed: number
      readonly source: "provider" | "jev"
      readonly model?: string
      readonly provider?: string
    }
  | { readonly phase: "failed"; readonly message: string }

function alreadyHighlighted(cards: readonly BoardCard[], quote: string): boolean {
  const normalized = quote.replace(/\s+/gu, " ").trim().toLocaleLowerCase()
  return cards.some(
    (card) =>
      card.kind === "highlight" &&
      card.anchor.quote.replace(/\s+/gu, " ").trim().toLocaleLowerCase() === normalized,
  )
}

function createHighlightCards(
  documentId: DocumentRecord["id"],
  passages: readonly AutoHighlightPassage[],
  candidates: readonly AutoHighlightCandidate[],
  boardWorld: HTMLElement,
  existingCards: readonly BoardCard[],
): { readonly created: readonly BoardCard[]; readonly missed: number } {
  const created: BoardCard[] = []
  let missed = 0
  for (const passage of passages) {
    const candidate = passage.candidateId
      ? candidates.find((item) => item.id === passage.candidateId)
      : undefined
    if (!candidate) {
      missed += 1
      continue
    }
    if (alreadyHighlighted([...existingCards, ...created], candidate.quote)) continue
    const card = createAutoHighlightCard(documentId, passage, boardWorld, candidates)
    if (card) created.push(card)
    else missed += 1
  }
  return { created, missed }
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
  const runIdRef = useRef(0)
  const cardsRef = useRef(cards)
  useEffect(() => {
    cardsRef.current = cards
  }, [cards])
  useEffect(
    () => () => {
      runIdRef.current += 1
      abortRef.current?.abort()
    },
    [],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切换文档时重置运行状态
  useEffect(() => {
    runIdRef.current += 1
    abortRef.current?.abort()
    setState({ phase: "idle" })
  }, [doc.id])

  async function run(): Promise<void> {
    const boardWorld = window.document.querySelector<HTMLElement>(".board-world")
    const candidates = collectAutoHighlightCandidates()
    const sourceText = doc.overview || cachedPaperOverviewContext(doc.id) || doc.title
    if (!boardWorld || candidates.length === 0) {
      setState({ phase: "failed", message: "문서 텍스트를 아직 읽지 못했습니다." })
      return
    }
    const controller = new AbortController()
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    abortRef.current = controller
    setState({ phase: "running", source: "provider" })
    try {
      const response = await onAiRequest(
        {
          action: "auto_highlight",
          page: 1,
          quote: sourceText,
          before: "",
          after: "",
          paperContext: sourceText,
          sourceEvidence: autoHighlightSourceEvidence(candidates),
        },
        undefined,
        controller.signal,
      )
      if (controller.signal.aborted || runIdRef.current !== runId) return
      const passages = parseAutoHighlightResponse(response)
      if (passages.length === 0) {
        setState({ phase: "failed", message: "핵심 구절을 찾지 못했습니다." })
        return
      }
      const { created, missed } = createHighlightCards(
        doc.id,
        passages,
        candidates,
        boardWorld,
        cardsRef.current,
      )
      if (controller.signal.aborted || runIdRef.current !== runId) return
      if (created.length > 0) onCardsChange([...cardsRef.current, ...created])
      setState({ phase: "done", created: created.length, missed, source: "provider" })
    } catch (error) {
      if (controller.signal.aborted || runIdRef.current !== runId) {
        if (runIdRef.current === runId) setState({ phase: "idle" })
        return
      }
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : "자동 하이라이트에 실패했습니다.",
      })
    } finally {
      if (runIdRef.current === runId) abortRef.current = null
    }
  }

  async function runJev(): Promise<void> {
    const decideAi = window.scourgify?.decideAi
    const boardWorld = window.document.querySelector<HTMLElement>(".board-world")
    const candidates = collectAutoHighlightCandidates()
    const sourceText = doc.overview || cachedPaperOverviewContext(doc.id) || doc.title
    if (!decideAi) {
      setState({ phase: "failed", message: "Jev 후보 선택을 사용할 수 없습니다." })
      return
    }
    if (!boardWorld || candidates.length === 0) {
      setState({ phase: "failed", message: "문서 텍스트를 아직 읽지 못했습니다." })
      return
    }
    const controller = new AbortController()
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    abortRef.current = controller
    setState({ phase: "running", source: "jev" })
    try {
      const {
        passages,
        model,
        provider: decisionProvider,
      } = await selectJevHighlightPassages(sourceText, candidates, decideAi, controller.signal)
      if (controller.signal.aborted || runIdRef.current !== runId) return
      const { created, missed } = createHighlightCards(
        doc.id,
        passages,
        candidates,
        boardWorld,
        cardsRef.current,
      )
      if (controller.signal.aborted || runIdRef.current !== runId) return
      if (created.length > 0) onCardsChange([...cardsRef.current, ...created])
      setState({
        phase: "done",
        created: created.length,
        missed,
        source: "jev",
        model,
        provider: decisionProvider,
      })
    } catch (error) {
      if (controller.signal.aborted || runIdRef.current !== runId) {
        if (runIdRef.current === runId) setState({ phase: "idle" })
        return
      }
      setState({
        phase: "failed",
        message: `Jev 후보 선택 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      })
    } finally {
      if (runIdRef.current === runId) abortRef.current = null
    }
  }

  return (
    <div className="auto-highlight-controls">
      {state.phase === "running" ? (
        <>
          <span className="auto-highlight-status" role="status">
            {state.source === "jev" ? "Jev 후보를 선택하는 중…" : "핵심 구절을 찾는 중…"}
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
        <>
          <button
            type="button"
            className="auto-highlight-run"
            onClick={() => void run()}
            disabled={!provider.configured}
            aria-label="자동 하이라이트 실행"
          >
            <Sparkles size={14} /> 자동 하이라이트
          </button>
          <button
            type="button"
            className="auto-highlight-run auto-highlight-jev"
            onClick={() => void runJev()}
            disabled={!window.scourgify?.decideAi}
            aria-label="Jev로 후보 선택"
            title={
              window.scourgify?.decideAi
                ? `Jev 후보 선택 · ${JEV_DECISION_MODEL}`
                : "Jev 설정이 없습니다."
            }
          >
            Jev 후보 선택
          </button>
        </>
      )}
      {state.phase === "done" ? (
        <p className="auto-highlight-result">
          {state.source === "jev" ? `Jev · ${state.provider} · ${state.model} · ` : ""}
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
