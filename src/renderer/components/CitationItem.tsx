import { BookOpen, ChevronDown, ExternalLink, Pin } from "lucide-react"
import { type FormEvent, type JSX, useId, useState } from "react"
import type { CitationAssessmentResult, ReadingTier } from "../../shared/citationAssessment"
import { citationAssessmentResultSchema } from "../../shared/citationAssessment"
import type { RankedCitation } from "../lib/citationTriage"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import type { AiDeltaHandler } from "../types"
import { ChatComposer } from "./ChatComposer"
import type { CitationAnalysisState } from "./citationPanelTypes"
import { MarkdownContent } from "./MarkdownContent"

const tierLabels: Readonly<Record<ReadingTier, string>> = {
  deep_read: "정독",
  skim: "훑어보기",
  abstract_only: "초록만",
  pass: "패스",
}

/** Headings longer than this (title plus byline) start collapsed behind a 펼쳐보기 toggle. */
const collapsedHeadingCharacters = 220

const scoreParts = [
  { key: "dependency", label: "현재 논문 의존도", maximum: 30 },
  { key: "methodological", label: "방법 관련성", maximum: 25 },
  { key: "conceptual", label: "개념 관련성", maximum: 20 },
  { key: "evidentiary", label: "근거 중요도", maximum: 15 },
  { key: "contextSufficiency", label: "문맥 충분성", maximum: 10 },
] as const

function citationSourceUrl(state: CitationAnalysisState | undefined): string | null {
  if (state?.status !== "complete") return null
  if (state.paper.openAccessUrl) return state.paper.openAccessUrl
  if (state.paper.url) return state.paper.url
  if (state.paper.doi) return `https://doi.org/${state.paper.doi}`
  return state.paper.paperId.startsWith("https://") ? state.paper.paperId : null
}

export function CitationItem({
  entry,
  state,
  ranked,
  onAnalyze,
  onSave,
  onAsk,
}: {
  readonly entry: CitationIndexEntry
  readonly state: CitationAnalysisState | undefined
  readonly ranked: RankedCitation | undefined
  readonly onAnalyze: () => void
  readonly onSave: (assessment: CitationAssessmentResult) => void
  readonly onAsk: (question: string, onDelta?: AiDeltaHandler) => Promise<string>
}): JSX.Element {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [asking, setAsking] = useState(false)
  const [headingExpanded, setHeadingExpanded] = useState(false)
  const headingId = useId()

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true)
    setAnswer("")
    try {
      const response = await onAsk(question.trim(), (delta) =>
        setAnswer((current) => current + delta),
      )
      setAnswer(response)
      setQuestion("")
    } catch {
      setAnswer("AI 설정 또는 인용 논문 정보를 확인해주세요.")
    } finally {
      setAsking(false)
    }
  }

  const complete = state?.status === "complete" ? state : null
  const result =
    complete && ranked
      ? citationAssessmentResultSchema.parse({
          ...complete.assessment,
          score: ranked.score,
          tier: ranked.tier,
        })
      : null
  const sourceUrl = citationSourceUrl(state)
  const heading = complete?.paper.title ?? entry.title
  const year = complete?.paper.year ?? entry.year
  const byline = `${complete?.paper.authors.join(", ") || entry.authors}${year ? ` · ${year}` : ""}`
  const longHeading = heading.length + byline.length > collapsedHeadingCharacters
  return (
    <article className="citation-item" data-tier={ranked?.tier ?? "unassessed"}>
      <header>
        <span className="citation-key">[{entry.key}]</span>
        <div>
          <div
            className="citation-heading"
            id={headingId}
            data-clamped={longHeading && !headingExpanded}
          >
            <strong>{heading}</strong>
            <span>{byline}</span>
          </div>
          {longHeading ? (
            <button
              type="button"
              className="citation-heading-toggle"
              aria-expanded={headingExpanded}
              aria-controls={headingId}
              onClick={() => setHeadingExpanded(!headingExpanded)}
            >
              <span>{headingExpanded ? "접기" : "펼쳐보기"}</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {ranked ? (
          <span className="reading-tier" data-tier={ranked.tier}>
            {tierLabels[ranked.tier]}
          </span>
        ) : null}
      </header>
      <div className="citation-item-meta">
        <span>인용 문맥 {entry.contexts.length}개</span>
        {complete ? <span>신원 일치 {Math.round(complete.match.score * 100)}%</span> : null}
        {ranked ? <span>읽기 점수 {ranked.score}/100</span> : null}
      </div>
      {complete && sourceUrl ? (
        <button
          type="button"
          className="citation-source-link"
          onClick={() => void window.ohmypaper.openExternal({ url: sourceUrl })}
        >
          <ExternalLink size={14} /> 실제 논문 열기
        </button>
      ) : null}
      {!state || state.status === "error" ? (
        <div className="citation-item-actions">
          <button type="button" onClick={onAnalyze}>
            <BookOpen size={14} /> 논문 확인·판독
          </button>
          {state?.status === "error" ? (
            <span className="insight-error">{state.message}</span>
          ) : null}
        </div>
      ) : null}
      {state?.status === "loading" ? (
        <p className="insight-muted">논문 신원과 읽을 가치를 확인 중…</p>
      ) : null}
      {complete && result ? (
        <div className="citation-assessment">
          <section className="citation-score" aria-label={`읽기 점수 ${result.score}점`}>
            <div className="citation-score-head">
              <strong className="citation-score-total">{result.score}/100</strong>
              <span className="citation-score-tier">{tierLabels[result.tier]}</span>
            </div>
            <span className="citation-score-track" aria-hidden="true">
              <span className="citation-score-fill" style={{ width: `${result.score}%` }} />
            </span>
            <dl className="citation-score-breakdown">
              {scoreParts.map((part) => (
                <div className="citation-score-row" key={part.key}>
                  <dt className="citation-score-label">{part.label}</dt>
                  <dd className="citation-score-part">{`${result.breakdown[part.key]}/${part.maximum}`}</dd>
                </div>
              ))}
            </dl>
          </section>
          <MarkdownContent source={result.citationReason} />
          <MarkdownContent source={result.readingValue} />
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {result.recommendedSections.length > 0 ? (
            <p className="citation-sections">읽을 부분: {result.recommendedSections.join(", ")}</p>
          ) : null}
          <div className="citation-item-actions">
            <button type="button" onClick={() => onSave(result)}>
              <Pin size={14} /> 보드에 저장
            </button>
          </div>
          <ChatComposer
            label={`${entry.title} 질문`}
            submitLabel="인용 논문 질문 보내기"
            value={question}
            sending={asking}
            responseStarted={answer.length > 0}
            onChange={setQuestion}
            onSubmit={(event) => void submit(event)}
          />
          {answer ? <MarkdownContent className="citation-answer" source={answer} /> : null}
        </div>
      ) : null}
    </article>
  )
}
