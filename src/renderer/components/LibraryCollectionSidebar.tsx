import {
  Clock3,
  FilePlus2,
  FileText,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import { documentKindName } from "../../shared/documentKind"
import { useLocale, useTranslator } from "../lib/locale"
import { libraryMessages } from "../messages/library"
import type { DocumentRecord } from "../types"
import type { LibraryCollection } from "./library-collections"

export type LibraryFilter = "all" | "recent" | DocumentRecord["kind"]

const kindOptions = [
  "research_paper",
  "report",
  "manual",
  "contract",
  "presentation",
  "document",
] as const satisfies readonly DocumentRecord["kind"][]

export function LibraryCollectionSidebar({
  documents,
  recentDocumentId,
  value,
  onChange,
  collapsed,
  onToggle,
  collections,
  selectedCollectionId,
  onCollectionSelect,
  onCreateCollection,
  collectionsEnabled,
}: {
  readonly documents: readonly DocumentRecord[]
  readonly recentDocumentId: DocumentRecord["id"] | null | undefined
  readonly value: LibraryFilter
  readonly onChange: (value: LibraryFilter) => void
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly collections: readonly LibraryCollection[]
  readonly selectedCollectionId: LibraryCollection["board"]["id"] | null
  readonly onCollectionSelect: (id: LibraryCollection["board"]["id"] | null) => void
  readonly onCreateCollection: (title: string) => Promise<boolean>
  readonly collectionsEnabled: boolean
}): JSX.Element {
  const { locale } = useLocale()
  const t = useTranslator(libraryMessages)
  const countFor = (filter: LibraryFilter): number => {
    if (filter === "all") return documents.length
    if (filter === "recent") return recentDocumentId ? 1 : 0
    return documents.filter((document) => document.kind === filter).length
  }
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createPending, setCreatePending] = useState(false)

  async function submitCollection(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!createTitle.trim() || createPending) return
    setCreatePending(true)
    try {
      if (await onCreateCollection(createTitle.trim())) {
        setCreateTitle("")
        setCreateOpen(false)
      }
    } finally {
      setCreatePending(false)
    }
  }

  return (
    <aside
      className="library-collections"
      aria-label={t("sidebar.label")}
      data-collapsed={collapsed}
    >
      <div className="library-collections-heading">
        <div className="library-collections-heading-copy">
          <h2>{t("sidebar.title")}</h2>
        </div>
        <button
          type="button"
          className="library-collections-toggle"
          aria-label={t(collapsed ? "sidebar.expand" : "sidebar.collapse")}
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="library-collection-content">
        <div className="library-collection-group">
          <button
            type="button"
            className={value === "all" ? "active" : undefined}
            aria-pressed={value === "all"}
            onClick={() => onChange("all")}
          >
            <FileText size={16} aria-hidden="true" />
            <span>{t("home.allDocuments")}</span>
            <small aria-hidden="true">{countFor("all")}</small>
          </button>
          <button
            type="button"
            className={value === "recent" ? "active" : undefined}
            aria-pressed={value === "recent"}
            disabled={!recentDocumentId}
            onClick={() => onChange("recent")}
          >
            <Clock3 size={16} aria-hidden="true" />
            <span>{t("home.recent")}</span>
            <small aria-hidden="true">{countFor("recent")}</small>
          </button>
        </div>
        {collectionsEnabled ? (
          <div className="library-collection-group library-project-collections">
            <div className="library-collection-label-row">
              <span className="library-collection-label" title={t("sidebar.collectionsHint")}>
                {t("sidebar.collections")}
              </span>
              <button
                type="button"
                className="library-collection-add"
                aria-label={t("sidebar.create")}
                onClick={() => setCreateOpen((value) => !value)}
              >
                <FilePlus2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="library-collection-add"
                aria-label={t(collectionsOpen ? "sidebar.collapseList" : "sidebar.expandList")}
                aria-pressed={collectionsOpen}
                onClick={() => setCollectionsOpen((value) => !value)}
              >
                {collectionsOpen ? "−" : "+"}
              </button>
            </div>
            {createOpen ? (
              <form
                className="library-collection-form"
                onSubmit={(event) => void submitCollection(event)}
              >
                <label htmlFor="library-new-collection">{t("sidebar.newName")}</label>
                <input
                  id="library-new-collection"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  disabled={createPending}
                  maxLength={500}
                />
                <div>
                  <button
                    type="button"
                    disabled={createPending}
                    onClick={() => setCreateOpen(false)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" disabled={createPending || !createTitle.trim()}>
                    {t(createPending ? "sidebar.creating" : "sidebar.submit")}
                  </button>
                </div>
              </form>
            ) : null}
            {collectionsOpen
              ? collections.map((collection) => {
                  const memberCount = collection.members.filter(
                    (member) => member.documentId,
                  ).length
                  return (
                    <button
                      key={collection.board.id}
                      type="button"
                      className={
                        selectedCollectionId === collection.board.id ? "active" : undefined
                      }
                      aria-pressed={selectedCollectionId === collection.board.id}
                      onClick={() => onCollectionSelect(collection.board.id)}
                    >
                      <FolderOpen size={16} aria-hidden="true" />
                      <span>{collection.board.title}</span>
                      <small>
                        {collection.placementLoadFailed ? t("sidebar.needsCheck") : memberCount}
                      </small>
                    </button>
                  )
                })
              : null}
            {collectionsOpen && collections.length === 0 ? (
              <span className="library-collections-empty">{t("sidebar.noCollections")}</span>
            ) : null}
            {selectedCollectionId ? (
              <button
                type="button"
                className="library-clear-collection"
                onClick={() => onCollectionSelect(null)}
              >
                {t("sidebar.allCollections")}
              </button>
            ) : null}
          </div>
        ) : null}
        <details className="library-collection-group library-kind-filters">
          <summary>
            <span>{t("sidebar.kindFilter")}</span>
            {value !== "all" && value !== "recent" ? (
              <small>{documentKindName(value, locale)}</small>
            ) : null}
          </summary>
          <div className="library-kind-filter-list">
            {kindOptions.map((kind) => (
              <button
                key={kind}
                type="button"
                className={value === kind ? "active" : undefined}
                aria-pressed={value === kind}
                onClick={() => onChange(kind)}
              >
                <span className="library-kind-dot" aria-hidden="true" data-kind={kind} />
                <span>{documentKindName(kind, locale)}</span>
                <small aria-hidden="true">{countFor(kind)}</small>
              </button>
            ))}
          </div>
        </details>
      </div>
    </aside>
  )
}
