import { BookOpen, ExternalLink, MessageSquareText, Pin } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { CitationAssessmentResult, ReadingTier } from "../../shared/citationAssessment"
import { citationAssessmentResultSchema } from "../../shared/citationAssessment"
import type { RankedCitation } from "../lib/citationTriage"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import type { CitationAnalysisState } from "./citationPanelTypes"

const tierLabels: Readonly<Record<ReadingTier, string>> = {
  deep_read: "정독",
  skim: "훑어보기",
  abstract_only: "초록만",
  pass: "패스",
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
  readonly onAsk: (question: string) => Promise<string>
}): JSX.Element {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [asking, setAsking] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true)
    try {
      setAnswer(await onAsk(question.trim()))
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
  const sourceUrl = complete?.paper.openAccessUrl ?? complete?.paper.url
  return (
    <article className="citation-item" data-tier={ranked?.tier ?? "unassessed"}>
      <header>
        <span className="citation-key">[{entry.key}]</span>
        <div>
          <strong>{complete?.paper.title ?? entry.title}</strong>
          <span>
            {complete?.paper.authors.join(", ") || entry.authors}
            {(complete?.paper.year ?? entry.year) ? ` · ${complete?.paper.year ?? entry.year}` : ""}
          </span>
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
        {ranked ? <span>읽기 점수 {ranked.score}</span> : null}
      </div>
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
          <p>{result.citationReason}</p>
          <p>{result.readingValue}</p>
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {result.recommendedSections.length > 0 ? (
            <p className="citation-sections">읽을 부분: {result.recommendedSections.join(", ")}</p>
          ) : null}
          <div className="citation-item-actions">
            {sourceUrl ? (
              <button
                type="button"
                onClick={() => void window.scourgify.openExternal({ url: sourceUrl })}
              >
                <ExternalLink size={14} /> 논문 열기
              </button>
            ) : null}
            <button type="button" onClick={() => onSave(result)}>
              <Pin size={14} /> 보드에 저장
            </button>
          </div>
          <form className="citation-question" onSubmit={(event) => void submit(event)}>
            <input
              aria-label={`${entry.title} 질문`}
              value={question}
              onChange={(event) => setQuestion(event.currentTarget.value)}
              placeholder="이 논문이 왜 필요한지 질문하세요"
            />
            <button
              type="submit"
              disabled={!question.trim() || asking}
              aria-label="인용 논문 질문 보내기"
            >
              <MessageSquareText size={14} />
            </button>
          </form>
          {answer ? <p className="citation-answer">{answer}</p> : null}
        </div>
      ) : null}
    </article>
  )
}
