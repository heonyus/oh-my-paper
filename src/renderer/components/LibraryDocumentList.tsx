import { BookOpen, Grid2X2, List, SortAsc } from "lucide-react"
import { type JSX, useRef } from "react"
import type { DocumentId, DocumentRecord } from "../types"
import { DocumentThumbnail } from "./DocumentThumbnail"
import {
  documentAuthors,
  documentKindLabels,
  formatImportedAt,
  normalizedReadingPage,
} from "./library-home-formatting"

export type LibraryView = "grid" | "list"

export function LibraryDocumentList({
  documents,
  selectedId,
  view,
  onViewChange,
  onPreview,
  onOpenReader,
}: {
  readonly documents: readonly DocumentRecord[]
  readonly selectedId: DocumentId | null
  readonly view: LibraryView
  readonly onViewChange: (view: LibraryView) => void
  readonly onPreview: (id: DocumentId) => void
  readonly onOpenReader: (id: DocumentId) => void
}): JSX.Element {
  const itemRefs = useRef<Readonly<Record<string, HTMLButtonElement | null>>>({})
  const focusDocument = (index: number): void => {
    const target = documents[index]
    if (target) itemRefs.current[target.id]?.focus()
  }

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
        {documents.map((document, index) => {
          const readingPage = normalizedReadingPage(document)
          const isSelected = document.id === selectedId
          return (
            <li key={document.id} className={isSelected ? "is-selected" : undefined}>
              <button
                ref={(element) => {
                  itemRefs.current = { ...itemRefs.current, [document.id]: element }
                }}
                type="button"
                className="library-document-preview"
                aria-label={`${document.title} 미리보기`}
                aria-pressed={isSelected}
                onClick={() => onPreview(document.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault()
                    focusDocument((index + 1) % documents.length)
                  }
                  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault()
                    focusDocument((index - 1 + documents.length) % documents.length)
                  }
                }}
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
                onClick={() => onOpenReader(document.id)}
              >
                <BookOpen size={15} aria-hidden="true" />
                <span>열기</span>
              </button>
              <span className="library-document-date">{formatImportedAt(document.importedAt)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
