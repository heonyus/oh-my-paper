import type { ComponentProps, JSX } from "react"
import { useTranslator } from "../lib/locale"
import type { CitationIndexEntry } from "../lib/pdfCitationIndex"
import { researchMessages } from "../messages/research"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { CitationPanel } from "./CitationPanel"
import { ScholarSearchPanel } from "./ScholarSearchPanel"

export type RelatedPapersView = "references" | "find"

/**
 * Other papers, from two sides: the references this paper cites, read one by one, and a search
 * for papers related to it. Only the chosen side is mounted, so nothing is searched unasked.
 */
export function RelatedPapersPanel({
  document,
  citations,
  view,
  onViewChange,
  onAiRequest,
  onSaveAssessment,
}: {
  readonly document: DocumentRecord
  readonly citations: readonly CitationIndexEntry[]
  readonly view: RelatedPapersView
  readonly onViewChange: (view: RelatedPapersView) => void
  readonly onAiRequest: AiRequestRunner
  readonly onSaveAssessment: ComponentProps<typeof CitationPanel>["onSave"]
}): JSX.Element {
  const t = useTranslator(researchMessages)
  const views: readonly { readonly id: RelatedPapersView; readonly count?: number }[] = [
    { id: "references", count: citations.length },
    { id: "find" },
  ]
  return (
    <div className="related-papers">
      <fieldset className="sidebar-segments" aria-label={t("papers.views")}>
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => onViewChange(item.id)}
          >
            {t(item.id === "references" ? "papers.references" : "papers.find")}
            {item.count ? <small>{item.count}</small> : null}
          </button>
        ))}
      </fieldset>
      {view === "references" ? (
        <CitationPanel
          document={document}
          citations={citations}
          onAiRequest={onAiRequest}
          onSave={onSaveAssessment}
        />
      ) : (
        <ScholarSearchPanel key={document.id} document={document} citations={citations} />
      )}
    </div>
  )
}
