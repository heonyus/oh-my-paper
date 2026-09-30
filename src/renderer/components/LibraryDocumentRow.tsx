import { BookOpen, Trash2 } from "lucide-react"
import { type JSX, type KeyboardEvent, memo } from "react"
import type { DocumentId, DocumentRecord } from "../types"
import { DocumentThumbnail } from "./DocumentThumbnail"
import {
  documentAuthors,
  documentKindLabels,
  formatImportedAt,
  normalizedReadingPage,
} from "./library-home-formatting"

export type LibraryDocumentRowActions = {
  readonly preview: (id: DocumentId) => void
  readonly openReader: (id: DocumentId) => void
  readonly requestDelete: (id: DocumentId) => void
}

/** Moves focus to the neighbouring row's preview button, wrapping at either end. */
function focusNeighbour(current: HTMLButtonElement, step: 1 | -1): void {
  const list = current.closest("ul")
  if (!list) return
  const previews = Array.from(
    list.querySelectorAll<HTMLButtonElement>(":scope > li > .library-document-preview"),
  )
  const index = previews.indexOf(current)
  if (index < 0) return
  previews[(index + step + previews.length) % previews.length]?.focus()
}

function moveFocus(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault()
    focusNeighbour(event.currentTarget, 1)
  }
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault()
    focusNeighbour(event.currentTarget, -1)
  }
}

/** One library entry; it re-renders only when its paper or selection changes. */
export const LibraryDocumentRow = memo(function LibraryDocumentRow({
  document,
  selected,
  canDelete,
  actions,
}: {
  readonly document: DocumentRecord
  readonly selected: boolean
  readonly canDelete: boolean
  readonly actions: LibraryDocumentRowActions
}): JSX.Element {
  const readingPage = normalizedReadingPage(document)
  return (
    <li className={selected ? "is-selected" : undefined}>
      <button
        type="button"
        className="library-document-preview"
        aria-label={`${document.title} 미리보기`}
        aria-pressed={selected}
        onClick={() => actions.preview(document.id)}
        onKeyDown={moveFocus}
      >
        <DocumentThumbnail document={document} />
        <span className="library-document-copy">
          <strong>{document.title}</strong>
          <span>{documentAuthors(document)}</span>
          <small>
            {document.year ?? "연도 미상"} · {documentKindLabels[document.kind]}
            {readingPage ? ` · ${readingPage}/${document.pageCount}페이지` : ""}
          </small>
        </span>
      </button>
      <button
        type="button"
        className="library-document-open"
        aria-label={`${document.title} 열기`}
        onClick={() => actions.openReader(document.id)}
      >
        <BookOpen size={15} aria-hidden="true" />
        <span>열기</span>
      </button>
      {canDelete ? (
        <button
          type="button"
          className="library-document-delete"
          aria-label={`${document.title} 삭제`}
          title="라이브러리에서 삭제"
          onClick={() => actions.requestDelete(document.id)}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      ) : null}
      <span className="library-document-date">{formatImportedAt(document.importedAt)}</span>
    </li>
  )
})
