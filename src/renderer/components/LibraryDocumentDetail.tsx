import { BookOpen, CalendarDays, FileText, Hash, TriangleAlert } from "lucide-react"
import type { JSX } from "react"
import { documentKindName } from "../../shared/documentKind"
import { useLocale, useTranslator } from "../lib/locale"
import { countKey, libraryMessages } from "../messages/library"
import type { DocumentRecord } from "../types"
import { DocumentThumbnail } from "./DocumentThumbnail"
import { LibraryDocumentDelete } from "./LibraryDocumentDelete"
import { LibraryDocumentOverview } from "./LibraryDocumentOverview"
import type { LibraryCollection } from "./library-collections"
import {
  documentAuthors,
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
  deletion,
}: {
  readonly document: DocumentRecord | null
  readonly onOpenReader: (id: DocumentRecord["id"]) => void
  readonly onOpenKnowledge?: ((id: DocumentRecord["id"]) => void) | undefined
  readonly collections?: readonly LibraryCollection[] | undefined
  readonly membershipBusyKey?: string | null | undefined
  readonly onToggleMembership?:
    | ((documentId: DocumentRecord["id"], boardId: LibraryCollection["board"]["id"]) => void)
    | undefined
  readonly deletion?:
    | {
        readonly confirming: boolean
        readonly onConfirmingChange: (confirming: boolean) => void
        readonly onDelete: (id: DocumentRecord["id"]) => Promise<void>
      }
    | undefined
}): JSX.Element {
  const { locale } = useLocale()
  const t = useTranslator(libraryMessages)
  if (!document) {
    return (
      <section className="library-detail is-empty" aria-label={t("detail.label")}>
        <FileText size={22} aria-hidden="true" />
        <h2>{t("detail.emptyTitle")}</h2>
        <p>{t("detail.emptyBody")}</p>
      </section>
    )
  }
  const readingPage = normalizedReadingPage(document)
  return (
    <section className="library-detail" aria-label={t("detail.label")}>
      <div className="library-detail-preview">
        <DocumentThumbnail document={document} />
      </div>
      <span className="library-eyebrow">{t("detail.eyebrow")}</span>
      <h2>{document.title}</h2>
      <p className="library-detail-authors">{documentAuthors(document, locale)}</p>
      <button
        type="button"
        className="library-reader-action"
        onClick={() => onOpenReader(document.id)}
      >
        <BookOpen size={16} aria-hidden="true" />
        <span>{readingPage ? t("detail.readFrom", { page: readingPage }) : t("detail.read")}</span>
      </button>
      {onOpenKnowledge ? (
        <button
          type="button"
          className="library-knowledge-action"
          onClick={() => onOpenKnowledge(document.id)}
        >
          <Hash size={15} aria-hidden="true" />
          <span>{t("detail.knowledge")}</span>
        </button>
      ) : null}
      <dl className="library-detail-meta">
        <div>
          <dt>
            <CalendarDays size={14} aria-hidden="true" />
            {t("detail.importedAt")}
          </dt>
          <dd>{formatImportedAt(document.importedAt, locale)}</dd>
        </div>
        <div>
          <dt>
            <FileText size={14} aria-hidden="true" />
            {t("detail.info")}
          </dt>
          <dd>
            {documentKindName(document.kind, locale)} ·{" "}
            {t(countKey("detail.pages", document.pageCount), { count: document.pageCount })} ·{" "}
            {formatFileSize(document.bytes)}
          </dd>
        </div>
        <div>
          <dt>
            <Hash size={14} aria-hidden="true" />
            {t("detail.fileName")}
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
          {t("detail.needsOcr")}
        </p>
      ) : null}
      {collections.length > 0 && onToggleMembership ? (
        <div className="library-detail-collections">
          <h3>{t("detail.collections")}</h3>
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
                  {available && collectionReady
                    ? t(member ? "detail.inCollection" : "detail.addToCollection")
                    : t("detail.needsRefresh")}
                </small>
              </button>
            )
          })}
        </div>
      ) : null}
      {document.overview ? (
        <LibraryDocumentOverview key={document.id} overview={document.overview} />
      ) : (
        <p className="library-detail-muted">{t("detail.noOverview")}</p>
      )}
      {deletion ? <LibraryDocumentDelete document={document} {...deletion} /> : null}
    </section>
  )
}
