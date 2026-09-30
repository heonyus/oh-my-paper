import { Grid2X2, List, SortAsc } from "lucide-react"
import { type JSX, memo, useLayoutEffect, useMemo, useRef } from "react"
import { useTranslator } from "../lib/locale"
import { countKey, libraryMessages } from "../messages/library"
import type { DocumentId, DocumentRecord } from "../types"
import { LibraryDocumentRow, type LibraryDocumentRowActions } from "./LibraryDocumentRow"

export type LibraryView = "grid" | "list"

type LibraryDocumentListProps = {
  readonly documents: readonly DocumentRecord[]
  readonly selectedId: DocumentId | null
  readonly view: LibraryView
  readonly onViewChange: (view: LibraryView) => void
  readonly onPreview: (id: DocumentId) => void
  readonly onOpenReader: (id: DocumentId) => void
  readonly onRequestDelete?: ((id: DocumentId) => void) | undefined
}

/** Row actions that keep one identity for the list's lifetime and call the latest handlers. */
function useStableRowActions(props: LibraryDocumentListProps): LibraryDocumentRowActions {
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  return useMemo(
    () => ({
      preview: (id) => latest.current.onPreview(id),
      openReader: (id) => latest.current.onOpenReader(id),
      requestDelete: (id) => latest.current.onRequestDelete?.(id),
    }),
    [],
  )
}

export const LibraryDocumentList = memo(function LibraryDocumentList(
  props: LibraryDocumentListProps,
): JSX.Element {
  const { documents, selectedId, view, onViewChange, onRequestDelete } = props
  const actions = useStableRowActions(props)
  const t = useTranslator(libraryMessages)
  const canDelete = onRequestDelete !== undefined

  return (
    <section className="library-documents" aria-label={t("list.label")}>
      <div className="library-documents-toolbar">
        <p className="library-result-count">
          {t(countKey("list.count", documents.length), { count: documents.length })}
        </p>
        <fieldset className="library-view-controls">
          <legend>{t("list.viewMode")}</legend>
          <button
            type="button"
            className={view === "list" ? "active" : undefined}
            aria-label={t("list.listView")}
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
          >
            <List size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={view === "grid" ? "active" : undefined}
            aria-label={t("list.gridView")}
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
          >
            <Grid2X2 size={17} aria-hidden="true" />
          </button>
          <span className="library-sort-label">
            <SortAsc size={17} aria-hidden="true" />
            <span>{t("list.sort")}</span>
          </span>
        </fieldset>
      </div>
      <ul className="library-grid" data-view={view} aria-label={t("list.items")}>
        {documents.map((document) => (
          <LibraryDocumentRow
            key={document.id}
            document={document}
            selected={document.id === selectedId}
            canDelete={canDelete}
            actions={actions}
          />
        ))}
      </ul>
    </section>
  )
})
