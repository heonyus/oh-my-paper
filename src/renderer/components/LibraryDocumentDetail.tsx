import { BookOpen, CalendarDays, FileText, Hash, TriangleAlert } from "lucide-react"
import type { JSX } from "react"
import type { DocumentRecord } from "../types"
import { DocumentThumbnail } from "./DocumentThumbnail"
import type { LibraryCollection } from "./library-collections"
import {
  documentAuthors,
  documentKindLabels,
  formatFileSize,
  formatImportedAt,
  normalizedReadingPage,
} from "./library-home-formatting"

export function LibraryDocumentDetail({
  document,
  onOpenReader,
  onOpenKnowledge,
  collections = [],
  membershipBusyKey = null,
  onToggleMembership,
}: {
  readonly document: DocumentRecord | null
  readonly onOpenReader: (id: DocumentRecord["id"]) => void
  readonly onOpenKnowledge?: ((id: DocumentRecord["id"]) => void) | undefined
  readonly collections?: readonly LibraryCollection[] | undefined
  readonly membershipBusyKey?: string | null | undefined
  readonly onToggleMembership?:
    | ((documentId: DocumentRecord["id"], boardId: LibraryCollection["board"]["id"]) => void)
    | undefined
}): JSX.Element {
  if (!document) {
    return (
      <section className="library-detail is-empty" aria-label="문서 상세">
        <FileText size={22} aria-hidden="true" />
        <h2>문서를 선택하세요</h2>
        <p>목록에서 문서를 선택하면 서지 정보와 읽기 상태를 확인할 수 있습니다.</p>
      </section>
    )
  }
  const readingPage = normalizedReadingPage(document)
  return (
    <section className="library-detail" aria-label="문서 상세">
      <div className="library-detail-preview">
        <DocumentThumbnail document={document} />
      </div>
      <span className="library-eyebrow">선택한 문서</span>
      <h2>{document.title}</h2>
      <p className="library-detail-authors">{documentAuthors(document)}</p>
      <button
        type="button"
        className="library-reader-action"
        onClick={() => onOpenReader(document.id)}
      >
        <BookOpen size={16} aria-hidden="true" />
        <span>{readingPage ? `${readingPage}페이지부터 읽기` : "PDF 읽기"}</span>
      </button>
      {onOpenKnowledge ? (
        <button
          type="button"
          className="library-knowledge-action"
          onClick={() => onOpenKnowledge(document.id)}
        >
          <Hash size={15} aria-hidden="true" />
          <span>지식으로 연결</span>
        </button>
      ) : null}
      <dl className="library-detail-meta">
        <div>
          <dt>
            <CalendarDays size={14} aria-hidden="true" />
            가져온 날짜
          </dt>
          <dd>{formatImportedAt(document.importedAt)}</dd>
        </div>
        <div>
          <dt>
            <FileText size={14} aria-hidden="true" />
            문서 정보
          </dt>
          <dd>
            {documentKindLabels[document.kind]} · {document.pageCount}페이지 ·{" "}
            {formatFileSize(document.bytes)}
          </dd>
        </div>
        <div>
          <dt>
            <Hash size={14} aria-hidden="true" />
            파일명
          </dt>
          <dd>{document.name}</dd>
        </div>
        {document.doi ? (
          <div>
            <dt>
              <Hash size={14} aria-hidden="true" />
              DOI
            </dt>
            <dd>{document.doi}</dd>
          </div>
        ) : null}
      </dl>
      {document.quality.needsOcr ? (
        <p className="library-detail-warning">
          <TriangleAlert size={15} aria-hidden="true" />
          텍스트가 부족해 OCR 확인이 필요합니다.
        </p>
      ) : null}
      {collections.length > 0 && onToggleMembership ? (
        <div className="library-detail-collections">
          <h3>컬렉션</h3>
          {collections.map((collection) => {
            const member = collection.members.some((item) => item.documentId === document.id)
            const available = Boolean(collection.paperNodeIds[document.id])
            const collectionReady = !collection.placementLoadFailed
            return (
              <button
                key={collection.board.id}
                type="button"
                aria-pressed={member}
                disabled={
                  !available ||
                  !collectionReady ||
                  membershipBusyKey === `${document.id}:${collection.board.id}`
                }
                onClick={() => onToggleMembership(document.id, collection.board.id)}
              >
                <span>{collection.board.title}</span>
                <small>
                  {available && collectionReady ? (member ? "담김" : "추가") : "새로고침 필요"}
                </small>
              </button>
            )
          })}
        </div>
      ) : null}
      {document.overview ? (
        <div className="library-detail-overview">
          <h3>개요</h3>
          <p>{document.overview}</p>
        </div>
      ) : (
        <p className="library-detail-muted">
          저장된 개요가 없습니다. PDF를 열어 내용을 확인하세요.
        </p>
      )}
    </section>
  )
}
