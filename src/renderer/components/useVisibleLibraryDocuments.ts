import { useDeferredValue, useMemo } from "react"
import type { DocumentId, DocumentRecord } from "../types"
import type { LibraryFilter } from "./LibraryCollectionSidebar"
import { documentSearchText } from "./library-home-formatting"

type SearchableDocument = { readonly document: DocumentRecord; readonly text: string }

export type LibraryDocumentCriteria = {
  readonly query: string
  readonly filter: LibraryFilter
  readonly recentDocumentId: DocumentId | null | undefined
  /** Members of the selected collection, or null when no collection narrows the list. */
  readonly collectionMembers: ReadonlySet<DocumentId> | null
}

/** Newest first, each paired with its lower-cased search text. */
function searchIndex(documents: readonly DocumentRecord[]): readonly SearchableDocument[] {
  return [...documents]
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt))
    .map((document) => ({ document, text: documentSearchText(document) }))
}

function matching(
  index: readonly SearchableDocument[],
  criteria: LibraryDocumentCriteria,
): readonly DocumentRecord[] {
  const { filter, recentDocumentId, collectionMembers } = criteria
  const needle = criteria.query.trim().toLocaleLowerCase()
  return index
    .filter(({ document, text }) => {
      if (filter === "recent" && document.id !== recentDocumentId) return false
      if (filter !== "all" && filter !== "recent" && document.kind !== filter) return false
      if (collectionMembers && !collectionMembers.has(document.id)) return false
      return !needle || text.includes(needle)
    })
    .map(({ document }) => document)
}

/**
 * The library rows to show. Sorting and search text are rebuilt only when the library changes;
 * a keystroke costs one linear filter, run at lower priority so typing stays responsive.
 */
export function useVisibleLibraryDocuments(
  documents: readonly DocumentRecord[],
  criteria: LibraryDocumentCriteria,
): readonly DocumentRecord[] {
  const index = useMemo(() => searchIndex(documents), [documents])
  const query = useDeferredValue(criteria.query)
  const { filter, recentDocumentId, collectionMembers } = criteria
  return useMemo(
    () => matching(index, { query, filter, recentDocumentId, collectionMembers }),
    [index, query, filter, recentDocumentId, collectionMembers],
  )
}
