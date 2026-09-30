import type { JSX } from "react"
import { useTranslator } from "../lib/locale"
import { citationMessages } from "../messages/citations"
import type { BoardCard } from "../types"

const scoreParts = [
  { key: "dependency", maximum: 30 },
  { key: "methodological", maximum: 25 },
  { key: "conceptual", maximum: 20 },
  { key: "evidentiary", maximum: 15 },
  { key: "contextSufficiency", maximum: 10 },
] as const

export function BoardCardCitationMeta({
  meta,
}: {
  readonly meta: NonNullable<BoardCard["sourceMeta"]>
}): JSX.Element {
  const t = useTranslator(citationMessages)
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
        <span className="citation-card-secondary">
          {t("citation.citedBy", { count: meta.citationCount })}
        </span>
      ) : null}
      {meta.assessment ? (
        <>
          <span
            className="reading-tier"
            data-tier={meta.assessment.tier}
          >{`${t(`citation.tier.${meta.assessment.tier}`)} · ${meta.assessment.score}/100`}</span>
          <dl className="citation-card-score-breakdown" aria-label={t("citation.breakdownLabel")}>
            {scoreParts.map((part) => (
              <div key={part.key}>
                <dt>{t(`citation.score.${part.key}`)}</dt>
                <dd>{`${meta.assessment?.breakdown[part.key] ?? 0}/${part.maximum}`}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  )
}
