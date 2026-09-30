import { Grid2X2, List, SortAsc } from "lucide-react"
import { type JSX, memo, useLayoutEffect, useMemo, useRef } from "react"
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
  const canDelete = onRequestDelete !== undefined

  return (
    <section className="library-documents" aria-label="문서 결과">
      <div className="library-documents-toolbar">
        <p className="library-result-count">{documents.length}개 문서</p>
        <fieldset className="library-view-controls">
          <legend>문서 보기 방식</legend>
          <button
            type="button"
            className={view === "list" ? "active" : undefined}
            aria-label="목록 보기"
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
          >
            <List size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={view === "grid" ? "active" : undefined}
            aria-label="격자 보기"
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
          >
            <Grid2X2 size={17} aria-hidden="true" />
          </button>
          <span className="library-sort-label">
            <SortAsc size={17} aria-hidden="true" />
            <span>최근 추가순</span>
          </span>
        </fieldset>
      </div>
      <ul className="library-grid" data-view={view} aria-label="문서 목록">
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
