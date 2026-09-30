import { ChevronDown } from "lucide-react"
import { type JSX, useId, useState } from "react"
import { useTranslator } from "../lib/locale"
import { libraryMessages } from "../messages/library"

/** Overviews longer than this start collapsed to a few lines. */
const collapsedOverviewCharacters = 320

export function LibraryDocumentOverview({ overview }: { readonly overview: string }): JSX.Element {
  const t = useTranslator(libraryMessages)
  const [expanded, setExpanded] = useState(false)
  const textId = useId()
  const long = overview.length > collapsedOverviewCharacters
  return (
    <div className="library-detail-overview">
      <h3>{t("overview.title")}</h3>
      <p id={textId} data-clamped={long && !expanded}>
        {overview}
      </p>
      {long ? (
        <button
          type="button"
          className="library-overview-toggle"
          aria-expanded={expanded}
          aria-controls={textId}
          aria-label={t(expanded ? "overview.collapseLabel" : "overview.expandLabel")}
          onClick={() => setExpanded(!expanded)}
        >
          <span>{t(expanded ? "overview.collapse" : "overview.expand")}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
