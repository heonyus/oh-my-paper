import { ChevronDown } from "lucide-react"
import { type JSX, useId, useState } from "react"

/** Overviews longer than this start collapsed to a few lines. */
const collapsedOverviewCharacters = 320

export function LibraryDocumentOverview({ overview }: { readonly overview: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const textId = useId()
  const long = overview.length > collapsedOverviewCharacters
  return (
    <div className="library-detail-overview">
      <h3>개요</h3>
      <p id={textId} data-clamped={long && !expanded}>
        {overview}
      </p>
      {long ? (
        <button
          type="button"
          className="library-overview-toggle"
          aria-expanded={expanded}
          aria-controls={textId}
          aria-label={expanded ? "개요 접기" : "개요 전체 내용 펼치기"}
          onClick={() => setExpanded(!expanded)}
        >
          <span>{expanded ? "접기" : "더 보기"}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
