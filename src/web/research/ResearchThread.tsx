import {
  AlertCircle,
  BookOpen,
  Check,
  ExternalLink,
  Flame,
  LibraryBig,
  Loader2,
} from "lucide-react"
import type { JSX } from "react"
import { MarkdownContent } from "../../renderer/components/MarkdownContent"
import type { AgentPaper, AgentStep, AgentThread } from "../../shared/agentChat"
import type { DocumentId, DocumentRecord } from "../../shared/schemas"
import { ResearchComposer } from "./ResearchComposer"

export type PaperOpenState = "idle" | "importing" | "failed"

function stepLabel(step: AgentStep): string {
  const query = step.query ? `"${step.query}"` : ""
  switch (step.kind) {
    case "context":
      return `라이브러리 첨부 논문 ${step.found ?? 0}편 불러옴`
    case "plan":
      if (step.status === "running") return "질문 분석 · 검색 쿼리 생성 중…"
      return step.queries && step.queries.length > 0
        ? `검색 쿼리 ${step.queries.length}개 생성`
        : "검색 쿼리 준비 완료"
    case "search":
      if (step.status === "running") return `${query} — Semantic Scholar 검색 중…`
      if (step.status === "failed") return `${query} — Semantic Scholar 검색 실패`
      return `${query} — ${step.found ?? 0}편 발견`
    case "fallback":
      if (step.status === "running") return `${query} — Crossref·arXiv·OpenAlex 검색 중…`
      if (step.status === "failed") return `${query} — 보조 검색 실패`
      return `${query} — 보조 검색 ${step.found ?? 0}편`
    case "compose":
      if (step.status === "running") return "검색 결과를 근거로 답변 작성 중…"
      if (step.status === "failed") return "답변 작성 실패"
      return step.detail ? `답변 완성 · ${step.detail}` : "답변 완성"
  }
}

function StepIcon({ status }: { readonly status: AgentStep["status"] }): JSX.Element {
  if (status === "running")
    return <Loader2 size={13} className="research-step-spin" aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={13} aria-hidden="true" />
  return <Check size={13} aria-hidden="true" />
}

function AgentStepList({ steps }: { readonly steps: readonly AgentStep[] }): JSX.Element {
  return (
    <ol className="research-steps">
      {steps.map((step) => (
        <li key={step.id} className={`research-step research-step-${step.status}`}>
          <StepIcon status={step.status} />
          <span>
            {stepLabel(step)}
            {step.kind === "plan" && step.queries && step.queries.length > 0 ? (
              <span className="research-step-queries">
                {step.queries.map((query) => (
                  <code key={query}>{query}</code>
                ))}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

function PaperCard({
  paper,
  openState,
  onOpenInReader,
}: {
  readonly paper: AgentPaper
  readonly openState: PaperOpenState
  readonly onOpenInReader: (paper: AgentPaper) => void
}): JSX.Element {
  const meta = [paper.authors.slice(0, 3).join(", "), paper.year ?? "n.d.", paper.venue]
    .filter((part) => part !== "")
    .join(" · ")
  return (
    <article className="research-paper">
      <header>
        <span className="research-paper-provider">{paper.provider}</span>
        {paper.citationCount !== null ? (
          <span className="research-paper-cites">인용 {paper.citationCount}</span>
        ) : null}
      </header>
      <h4 title={paper.title}>{paper.title}</h4>
      <p>{meta}</p>
      <footer>
        <button
          type="button"
          className="research-paper-open"
          disabled={!paper.fullTextUrl || openState === "importing"}
          onClick={() => onOpenInReader(paper)}
        >
          <BookOpen size={13} aria-hidden="true" />
          {openState === "importing" ? "가져오는 중…" : "리더에서 열기"}
        </button>
        {paper.landingUrl ? (
          <a
            href={paper.landingUrl}
            target="_blank"
            rel="noreferrer"
            className="research-paper-site"
          >
            <ExternalLink size={12} aria-hidden="true" />
            원문 사이트
          </a>
        ) : null}
      </footer>
    </article>
  )
}

export function ResearchThread({
  thread,
  documents,
  attachedIds,
  sending,
  liveSteps,
  error,
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
  readonly liveSteps: readonly AgentStep[]
  readonly error: string | null
  readonly paperOpenStates: Readonly<Record<string, PaperOpenState>>
  readonly onAttach: (id: DocumentId) => void
  readonly onDetach: (id: DocumentId) => void
  readonly onSend: (question: string) => void
  readonly onOpenInReader: (paper: AgentPaper) => void
}): JSX.Element {
  const related = documents[0]?.title
  const composer = (
    <ResearchComposer
      documents={documents}
      attachedIds={attachedIds}
      sending={sending}
      onAttach={onAttach}
      onDetach={onDetach}
      onSend={onSend}
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
      <ol className="research-messages">
        {thread.messages.map((message) => (
          <li
            key={message.id ?? `${message.role}:${message.content.slice(0, 48)}`}
            className={`research-message research-${message.role}`}
          >
            {message.role === "user" ? (
              <p>{message.content}</p>
            ) : (
              <>
                {message.steps && message.steps.length > 0 ? (
                  <details className="research-trace">
                    <summary>검색 과정 {message.steps.length}단계</summary>
                    <AgentStepList steps={message.steps} />
                  </details>
                ) : null}
                <MarkdownContent source={message.content} className="research-answer" />
                {message.papers && message.papers.length > 0 ? (
                  <div className="research-papers">
                    {message.papers.map((paper) => {
                      const key = `${paper.provider}:${paper.title}`
                      return (
                        <PaperCard
                          key={key}
                          paper={paper}
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
              <p className="research-thinking">질문을 분석하는 중…</p>
            )}
          </li>
        ) : null}
        {error ? (
          <li className="research-message research-assistant" role="alert">
            <p className="research-error">{error}</p>
          </li>
        ) : null}
      </ol>
      <div className="research-thread-composer">{composer}</div>
    </div>
  )
}
