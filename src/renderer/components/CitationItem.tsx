import { BookOpen, ChevronDown, ExternalLink, Pin } from "lucide-react"
import { type FormEvent, type JSX, useId, useState } from "react"
import type { CitationAssessmentResult } from "../../shared/citationAssessment"
import { citationAssessmentResultSchema } from "../../shared/citationAssessment"
import type { RankedCitation } from "../lib/citationTriage"
import { useTranslator } from "../lib/locale"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { citationMessages } from "../messages/citations"
import type { AiDeltaHandler } from "../types"
import { ChatComposer } from "./ChatComposer"
import type { CitationAnalysisState } from "./citationPanelTypes"
import { MarkdownContent } from "./MarkdownContent"

/** Headings longer than this (title plus byline) start collapsed behind a 펼쳐보기 toggle. */
const collapsedHeadingCharacters = 220

const scoreParts = [
  { key: "dependency", maximum: 30 },
  { key: "methodological", maximum: 25 },
  { key: "conceptual", maximum: 20 },
  { key: "evidentiary", maximum: 15 },
  { key: "contextSufficiency", maximum: 10 },
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
  const t = useTranslator(citationMessages)
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
      setAnswer(t("citation.askFailed"))
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
              <span>{headingExpanded ? t("citation.collapse") : t("citation.expand")}</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {ranked ? (
          <span className="reading-tier" data-tier={ranked.tier}>
            {t(`citation.tier.${ranked.tier}`)}
          </span>
        ) : null}
      </header>
      <div className="citation-item-meta">
        <span>{t("citation.contexts", { count: entry.contexts.length })}</span>
        {complete ? (
          <span>
            {t("citation.identityMatch", { percent: Math.round(complete.match.score * 100) })}
          </span>
        ) : null}
        {ranked ? <span>{t("citation.readingScore", { score: ranked.score })}</span> : null}
      </div>
      {complete && sourceUrl ? (
        <button
          type="button"
          className="citation-source-link"
          onClick={() => void window.ohmypaper.openExternal({ url: sourceUrl })}
        >
          <ExternalLink size={14} /> {t("citation.openSource")}
        </button>
      ) : null}
      {!state || state.status === "error" ? (
        <div className="citation-item-actions">
          <button type="button" onClick={onAnalyze}>
            <BookOpen size={14} /> {t("citation.analyze")}
          </button>
          {state?.status === "error" ? (
            <span className="insight-error">{state.message}</span>
          ) : null}
        </div>
      ) : null}
      {state?.status === "loading" ? (
        <p className="insight-muted">{t("citation.analyzing")}</p>
      ) : null}
      {complete && result ? (
        <div className="citation-assessment">
          <section
            className="citation-score"
            aria-label={t("citation.readingScoreLabel", { score: result.score })}
          >
            <div className="citation-score-head">
              <strong className="citation-score-total">{result.score}/100</strong>
              <span className="citation-score-tier">{t(`citation.tier.${result.tier}`)}</span>
            </div>
            <span className="citation-score-track" aria-hidden="true">
              <span className="citation-score-fill" style={{ width: `${result.score}%` }} />
            </span>
            <dl className="citation-score-breakdown">
              {scoreParts.map((part) => (
                <div className="citation-score-row" key={part.key}>
                  <dt className="citation-score-label">{t(`citation.score.${part.key}`)}</dt>
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
            <p className="citation-sections">
              {t("citation.sections", { sections: result.recommendedSections.join(", ") })}
            </p>
          ) : null}
          <div className="citation-item-actions">
            <button type="button" onClick={() => onSave(result)}>
              <Pin size={14} /> {t("citation.save")}
            </button>
          </div>
          <ChatComposer
            label={t("citation.askLabel", { title: entry.title })}
            submitLabel={t("citation.askSubmit")}
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
