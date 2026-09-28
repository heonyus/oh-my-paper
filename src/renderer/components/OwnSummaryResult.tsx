import type { JSX } from "react"
import {
  OWN_SUMMARY_LINES,
  type OwnSummary,
  type OwnSummaryLine,
  type OwnSummaryVerdict,
} from "../../shared/ownSummary"
import type { SourceCitation } from "../lib/chatCitations"

export const ownSummaryLineLabels: Readonly<Record<OwnSummaryLine, string>> = {
  problem: "문제",
  method: "방법",
  result: "결과",
}

const verdictLabels: Readonly<Record<OwnSummaryVerdict, string>> = {
  match: "맞음",
  missing: "빠짐",
  diverges: "어긋남",
  unverifiable: "확인 불가",
}

/** The reader's submitted lines, each with its check against the paper when one exists. */
export function OwnSummaryResult({
  summary,
  onNavigateToSource,
}: {
  readonly summary: OwnSummary
  readonly onNavigateToSource?: ((citation: SourceCitation) => void) | undefined
}): JSX.Element {
  return (
    <ol className="own-summary-lines">
      {OWN_SUMMARY_LINES.map((line) => {
        const text = summary.lines[line].trim()
        const item = summary.check?.items.find((candidate) => candidate.line === line)
        const page = item?.page ?? null
        const quote = item?.quote ?? null
        return (
          <li key={line}>
            <div className="own-summary-line-head">
              <span>{ownSummaryLineLabels[line]}</span>
              {item ? (
                <span className="own-summary-verdict" data-verdict={item.verdict}>
                  {verdictLabels[item.verdict]}
                </span>
              ) : null}
            </div>
            {text ? <p>{text}</p> : <p className="insight-muted">떠올리지 못함</p>}
            {item ? <p className="own-summary-note">{item.note}</p> : null}
            {page !== null && quote !== null ? (
              <button
                type="button"
                className="own-summary-source"
                aria-label={`${ownSummaryLineLabels[line]} 근거 원문 ${page}쪽으로 이동`}
                disabled={!onNavigateToSource}
                onClick={() => onNavigateToSource?.({ page, quote })}
              >
                <span>p.{page}</span> “{quote}”
              </button>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
