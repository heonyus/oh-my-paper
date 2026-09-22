import { FilePlus2, Search } from "lucide-react"
import type { JSX } from "react"
import type { KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import type { KnowledgeClientOps } from "../lib/knowledgeTypes"
import type { DocumentId, DocumentRecord } from "../types"
import { DocumentThumbnail } from "./DocumentThumbnail"
import { LibraryCollectionSidebar, type LibraryFilter } from "./LibraryCollectionSidebar"
import { LibraryDocumentDetail } from "./LibraryDocumentDetail"
import { LibraryDocumentList, type LibraryView } from "./LibraryDocumentList"
import { LibrarySavedPapers } from "./LibrarySavedPapers"
import type { LibraryCollection } from "./library-collections"
import { documentKindLabels } from "./library-home-formatting"

export type LibraryHomeContentProps = {
  readonly documents: readonly DocumentRecord[]
  readonly recentDocument: DocumentRecord | null
  readonly recentPageToShow: number | null
  readonly visibleDocuments: readonly DocumentRecord[]
  readonly selectedDocument: DocumentRecord | null
  readonly selectedId: DocumentId | null
  readonly filter: LibraryFilter
  readonly view: LibraryView
  readonly sidebarCollapsed: boolean
  readonly collections: readonly LibraryCollection[]
  readonly selectedCollectionId: LibraryCollection["board"]["id"] | null
  readonly query: string
  readonly importLabel: string
  readonly hasActiveImport: boolean
  readonly collectionError: string | null
  readonly membershipBusyKey: string | null
  readonly onRetryCollections: () => void
  readonly active: boolean
  readonly clientOps: KnowledgeClientOps | undefined
  readonly onFilterChange: (value: LibraryFilter) => void
  readonly onQueryChange: (value: string) => void
  readonly onToggleSidebar: () => void
  readonly onCollectionSelect: (id: LibraryCollection["board"]["id"] | null) => void
  readonly onCreateCollection: (title: string) => Promise<boolean>
  readonly onViewChange: (view: LibraryView) => void
  readonly onPreview: (id: DocumentId) => void
  readonly onOpenReader: (id: DocumentId) => void
  readonly readerBlocked: (id: DocumentId) => boolean
  readonly onOpenKnowledge: ((id: DocumentId) => void) | undefined
  readonly onOpenNode: ((id: KnowledgeNodeId) => void) | undefined
  readonly onOpenGraph: (() => void) | undefined
  readonly onOpenSearch: (() => void) | undefined
  readonly onOpenExternal: ((url: string) => void) | undefined
  readonly onImport: () => void
  readonly onToggleMembership: (
    documentId: DocumentId,
    boardId: LibraryCollection["board"]["id"],
  ) => void
}

export function LibraryHomeContent({
  documents,
  recentDocument,
  recentPageToShow,
  visibleDocuments,
  selectedDocument,
  selectedId,
  filter,
  view,
  sidebarCollapsed,
  collections,
  selectedCollectionId,
  query,
  importLabel,
  hasActiveImport,
  collectionError,
  membershipBusyKey,
  onRetryCollections,
  active,
  clientOps,
  onFilterChange,
  onQueryChange,
  onToggleSidebar,
  onCollectionSelect,
  onCreateCollection,
  onViewChange,
  onPreview,
  onOpenReader,
  readerBlocked,
  onOpenKnowledge,
  onOpenNode,
  onOpenGraph,
  onOpenSearch,
  onOpenExternal,
  onImport,
  onToggleMembership,
}: LibraryHomeContentProps): JSX.Element {
  return (
    <div className="library-home-layout" data-sidebar-collapsed={sidebarCollapsed}>
      <LibraryCollectionSidebar
        documents={documents}
        recentDocumentId={recentDocument?.id}
        value={filter}
        onChange={onFilterChange}
        collapsed={sidebarCollapsed}
        onToggle={onToggleSidebar}
        collections={collections}
        selectedCollectionId={selectedCollectionId}
        onCollectionSelect={onCollectionSelect}
        onCreateCollection={onCreateCollection}
        collectionsEnabled={Boolean(active && clientOps)}
      />
      <div className="library-home-main">
        <header className="library-home-header">
          <div>
            <h1>
              {collections.find((collection) => collection.board.id === selectedCollectionId)?.board
                .title ??
                (filter === "all"
                  ? "전체 문서"
                  : filter === "recent"
                    ? "최근 읽기"
                    : documentKindLabels[filter])}
            </h1>
          </div>
          <div className="library-header-actions">
            {onOpenSearch ? (
              <button type="button" onClick={onOpenSearch}>
                논문 검색
              </button>
            ) : null}
            {onOpenGraph ? (
              <button type="button" onClick={onOpenGraph}>
                연결 보기
              </button>
            ) : null}
            <button type="button" className="library-import-button" onClick={onImport}>
              <FilePlus2 size={16} aria-hidden="true" />
              <span>{importLabel}</span>
            </button>
          </div>
        </header>
        {recentDocument && recentPageToShow ? (
          <section className="library-recent" aria-label="계속 읽기">
            <button
              type="button"
              disabled={readerBlocked(recentDocument.id)}
              onClick={() => onOpenReader(recentDocument.id)}
            >
              <DocumentThumbnail document={recentDocument} />
              <span>이어서 읽기</span>
              <strong>{recentDocument.title}</strong>
              <small>
                {recentPageToShow} / {recentDocument.pageCount}페이지
              </small>
            </button>
          </section>
        ) : null}
        <div className="library-search-row">
          <label>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="제목, 저자, 파일명 검색"
              aria-label="라이브러리 검색"
            />
          </label>
        </div>
        {documents.length === 0 && !hasActiveImport ? (
          <div className="library-empty">
            <FilePlus2 size={24} aria-hidden="true" />
            <h2>첫 PDF를 가져오세요</h2>
            <p>문서를 가져오면 이곳에서 서지 정보와 읽기 상태를 관리할 수 있습니다.</p>
            <button type="button" onClick={onImport}>
              {importLabel}
            </button>
          </div>
        ) : documents.length > 0 && visibleDocuments.length === 0 ? (
          <div className="library-empty is-search">
            <h2>{selectedCollectionId ? "이 컬렉션은 비어 있습니다" : "검색 결과가 없습니다"}</h2>
            <p>
              {selectedCollectionId
                ? "상세 패널에서 문서를 추가하거나 다른 컬렉션을 선택하세요."
                : "다른 컬렉션, 제목, 저자 또는 문서 유형을 입력해보세요."}
            </p>
          </div>
        ) : documents.length > 0 ? (
          <div className="library-results-layout">
            <LibraryDocumentList
              documents={visibleDocuments}
              selectedId={selectedId}
              view={view}
              onViewChange={onViewChange}
              onPreview={onPreview}
              onOpenReader={onOpenReader}
              readerBlocked={readerBlocked}
            />
            <LibraryDocumentDetail
              document={selectedDocument}
              onOpenReader={onOpenReader}
              readerBlocked={selectedDocument ? readerBlocked(selectedDocument.id) : false}
              onOpenKnowledge={onOpenKnowledge}
              collections={collections}
              membershipBusyKey={membershipBusyKey}
              onToggleMembership={onToggleMembership}
            />
          </div>
        ) : null}
        {collectionError ? (
          <div className="library-collection-error" role="alert">
            <p>{collectionError}</p>
            <button type="button" onClick={onRetryCollections}>
              컬렉션 다시 불러오기
            </button>
          </div>
        ) : null}
        <LibrarySavedPapers
          clientOps={clientOps}
          documents={documents}
          onOpenNode={onOpenNode}
          onOpenExternal={onOpenExternal}
          active={active}
        />
      </div>
    </div>
  )
}
