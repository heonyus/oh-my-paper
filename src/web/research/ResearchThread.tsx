import { Flame, LibraryBig, Telescope } from "lucide-react"
import { type JSX, useLayoutEffect, useRef } from "react"
import { MarkdownContent } from "../../renderer/components/MarkdownContent"
import type { AgentMode, AgentPaper, AgentStep, AgentThread } from "../../shared/agentChat"
import type { DocumentId, DocumentRecord } from "../../shared/schemas"
import { ResearchComposer } from "./ResearchComposer"
import { type PaperOpenState, paperKey, ResearchPaperCard } from "./ResearchPaperCard"
import { AgentStepList } from "./ResearchSteps"

export type { PaperOpenState } from "./ResearchPaperCard"

const deepExample = "LLM이 긴 문서를 RAG 없이 기억하게 하는 연구들 정리해줘"
/** Follow new steps only while the reader is already at the bottom of the thread. */
const stickToBottomPx = 160

export function ResearchThread({
  thread,
  documents,
  attachedIds,
  sending,
  mode,
  onModeChange,
  onCancel,
  liveSteps,
  error,
  cancelled,
  paperOpenStates,
  onAttach,
  onDetach,
  onSend,
  onOpenInReader,
}: {
  readonly thread: AgentThread | null
  readonly documents: readonly DocumentRecord[]
  readonly attachedIds: readonly DocumentId[]
  readonly sending: boolean
  readonly mode: AgentMode
  readonly onModeChange: (mode: AgentMode) => void
  readonly onCancel: () => void
  readonly liveSteps: readonly AgentStep[]
  readonly error: string | null
  readonly cancelled: boolean
  readonly paperOpenStates: Readonly<Record<string, PaperOpenState>>
  readonly onAttach: (id: DocumentId) => void
  readonly onDetach: (id: DocumentId) => void
  readonly onSend: (question: string, mode?: AgentMode) => void
  readonly onOpenInReader: (paper: AgentPaper) => void
}): JSX.Element {
  const related = documents[0]?.title
  const messagesRef = useRef<HTMLOListElement>(null)
  const pinnedRef = useRef(true)
  const messageCount = thread?.messages.length ?? 0

  useLayoutEffect(() => {
    if (sending) pinnedRef.current = true
  }, [sending])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when steps or messages are added
  useLayoutEffect(() => {
    const list = messagesRef.current
    if (list && pinnedRef.current) list.scrollTop = list.scrollHeight
  }, [liveSteps.length, messageCount, sending])
  const composer = (
    <ResearchComposer
      documents={documents}
      attachedIds={attachedIds}
      sending={sending}
      mode={mode}
      onModeChange={onModeChange}
      onAttach={onAttach}
      onDetach={onDetach}
      onSend={(question) => onSend(question)}
      onCancel={onCancel}
    />
  )

  if (!thread) {
    return (
      <div className="research-hero">
        <h1>무엇을 배우고 싶으세요?</h1>
        {composer}
        <div className="research-suggestions">
          <button
            type="button"
            className="research-suggestion"
            onClick={() => onSend("최신 LLM 메모리 시스템 연구 동향을 정리해줘")}
          >
            <Flame size={14} aria-hidden="true" />
            <strong>Trending</strong>
            <span>"최신 LLM 메모리 시스템 연구 동향을 정리해줘"</span>
          </button>
          <button
            type="button"
            className="research-suggestion"
            onClick={() => onSend(deepExample, "deep")}
          >
            <Telescope size={14} aria-hidden="true" />
            <strong>딥리서치</strong>
            <span>"{deepExample}"</span>
          </button>
          <button
            type="button"
            className="research-suggestion"
            disabled={!related}
            onClick={() => onSend(`"${related ?? ""}"와 관련된 최신 연구를 찾아줘`)}
          >
            <LibraryBig size={14} aria-hidden="true" />
            <strong>관련 연구</strong>
            <span>
              {related
                ? `"${related}" 관련 최신 논문`
                : "라이브러리에 논문을 추가하면 추천이 생깁니다"}
            </span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="research-thread">
      <ol
        className="research-messages"
        ref={messagesRef}
        onScroll={(event) => {
          const list = event.currentTarget
          pinnedRef.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < stickToBottomPx
        }}
      >
        {thread.messages.map((message) => (
          <li
            key={message.id ?? `${message.role}:${message.content.slice(0, 48)}`}
            className={`research-message research-${message.role}`}
          >
            {message.role === "user" ? (
              <p>{message.content}</p>
            ) : (
              <>
                {message.mode === "deep" ? (
                  <p className="research-mode-badge">
                    <Telescope size={12} aria-hidden="true" /> 딥리서치 보고서
                  </p>
                ) : null}
                {message.steps && message.steps.length > 0 ? (
                  <details className="research-trace">
                    <summary>검색 과정 {message.steps.length}단계</summary>
                    <AgentStepList steps={message.steps} />
                  </details>
                ) : null}
                <MarkdownContent source={message.content} className="research-answer" />
                {message.papers && message.papers.length > 0 ? (
                  <div className="research-papers">
                    {message.papers.map((paper: AgentPaper, index) => {
                      const key = paperKey(paper)
                      return (
                        <ResearchPaperCard
                          key={key}
                          paper={paper}
                          index={index + 1}
                          openState={paperOpenStates[key] ?? "idle"}
                          onOpenInReader={onOpenInReader}
                        />
                      )
                    })}
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
        {sending ? (
          <li className="research-message research-assistant" aria-live="polite">
            {liveSteps.length > 0 ? (
              <AgentStepList steps={liveSteps} />
            ) : (
              <p className="research-thinking">
                {mode === "deep" ? "딥리서치를 시작하는 중…" : "질문을 분석하는 중…"}
              </p>
            )}
          </li>
        ) : null}
        {error ? (
          <li className="research-message research-assistant" role="alert">
            <p className="research-error">{error}</p>
          </li>
        ) : null}
        {cancelled ? (
          <li className="research-message research-assistant" role="status">
            <p className="research-thinking">
              검색을 취소했습니다. 질문을 다시 보내면 처음부터 찾습니다.
            </p>
          </li>
        ) : null}
      </ol>
      <div className="research-thread-composer">{composer}</div>
    </div>
  )
}
