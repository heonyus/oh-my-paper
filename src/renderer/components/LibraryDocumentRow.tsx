import { BookOpen, Trash2 } from "lucide-react"
import { type JSX, type KeyboardEvent, memo } from "react"
import { documentKindName } from "../../shared/documentKind"
import { useLocale, useTranslator } from "../lib/locale"
import { libraryMessages } from "../messages/library"
import type { DocumentId, DocumentRecord } from "../types"
import { DocumentThumbnail } from "./DocumentThumbnail"
import { documentAuthors, formatImportedAt, normalizedReadingPage } from "./library-home-formatting"

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
  const { locale } = useLocale()
  const t = useTranslator(libraryMessages)
  const readingPage = normalizedReadingPage(document)
  return (
    <li className={selected ? "is-selected" : undefined}>
      <button
        type="button"
        className="library-document-preview"
        aria-label={t("row.preview", { title: document.title })}
        aria-pressed={selected}
        onClick={() => actions.preview(document.id)}
        onKeyDown={moveFocus}
      >
        <DocumentThumbnail document={document} />
        <span className="library-document-copy">
          <strong>{document.title}</strong>
          <span>{documentAuthors(document, locale)}</span>
          <small>
            {document.year ?? t("row.unknownYear")} · {documentKindName(document.kind, locale)}
            {readingPage
              ? ` · ${t("row.readingPage", { page: readingPage, total: document.pageCount })}`
              : ""}
          </small>
        </span>
      </button>
      <button
        type="button"
        className="library-document-open"
        aria-label={t("row.openLabel", { title: document.title })}
        onClick={() => actions.openReader(document.id)}
      >
        <BookOpen size={15} aria-hidden="true" />
        <span>{t("row.open")}</span>
      </button>
      {canDelete ? (
        <button
          type="button"
          className="library-document-delete"
          aria-label={t("row.deleteLabel", { title: document.title })}
          title={t("delete.action")}
          onClick={() => actions.requestDelete(document.id)}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      ) : null}
      <span className="library-document-date">{formatImportedAt(document.importedAt, locale)}</span>
    </li>
  )
})
