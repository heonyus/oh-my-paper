import type { JSX } from "react"
import type { ReadingTier } from "../../shared/citationAssessment"
import type { BoardCard } from "../types"

const readingTierLabel: Readonly<Record<ReadingTier, string>> = {
  deep_read: "정독",
  skim: "훑어보기",
  abstract_only: "초록만",
  pass: "패스",
}

const scoreParts = [
  { key: "dependency", label: "현재 논문 의존도", maximum: 30 },
  { key: "methodological", label: "방법 관련성", maximum: 25 },
  { key: "conceptual", label: "개념 관련성", maximum: 20 },
  { key: "evidentiary", label: "근거 중요도", maximum: 15 },
  { key: "contextSufficiency", label: "문맥 충분성", maximum: 10 },
] as const

export function BoardCardCitationMeta({
  meta,
}: {
  readonly meta: NonNullable<BoardCard["sourceMeta"]>
}): JSX.Element {
  return (
    <div className="citation-card-meta">
      <strong>{meta.title}</strong>
      <span className="citation-card-secondary">
        {meta.authors.join(", ")}
        {meta.year ? ` · ${meta.year}` : ""}
      </span>
      {meta.venue ? <span className="citation-card-secondary">{meta.venue}</span> : null}
      {meta.doi ? <span className="citation-card-secondary">{`DOI: ${meta.doi}`}</span> : null}
      {meta.citationCount !== null ? (
        <span className="citation-card-secondary">{`인용 ${meta.citationCount}회`}</span>
      ) : null}
      {meta.assessment ? (
        <>
          <span
            className="reading-tier"
            data-tier={meta.assessment.tier}
          >{`${readingTierLabel[meta.assessment.tier]} · ${meta.assessment.score}/100`}</span>
          <dl className="citation-card-score-breakdown" aria-label="읽기 점수 구성">
            {scoreParts.map((part) => (
              <div key={part.key}>
                <dt>{part.label}</dt>
                <dd>{`${meta.assessment?.breakdown[part.key] ?? 0}/${part.maximum}`}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  )
}
