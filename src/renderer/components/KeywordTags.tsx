import { type JSX, useId, useState } from "react"
import type { KeywordEntry } from "../lib/keywordEntries"
import { MarkdownContent } from "./MarkdownContent"

/** The keyword dictionary as tags; choosing a tag shows its definition below the row. */
export function KeywordTags({
  entries,
}: {
  readonly entries: readonly KeywordEntry[]
}): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null)
  const definitionId = useId()
  const entry = selected === null ? undefined : entries[selected]
  return (
    <div className="keyword-tags">
      <ul className="keyword-tag-list">
        {entries.map((keyword, index) => (
          <li key={keyword.term}>
            <button
              type="button"
              aria-pressed={selected === index}
              aria-controls={definitionId}
              onClick={() => setSelected(selected === index ? null : index)}
            >
              {keyword.term}
            </button>
          </li>
        ))}
      </ul>
      <div id={definitionId} className="keyword-definition" aria-live="polite">
        {entry ? <MarkdownContent source={entry.definition} /> : null}
      </div>
    </div>
  )
}
