import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DocumentAnalysisJob } from "../../shared/documentAnalysis"
import type { ImportProgress } from "../../shared/ipc"
import type { KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import type { KnowledgeClientOps } from "../lib/knowledgeTypes"
import type { DocumentId, DocumentRecord } from "../types"
import type { LibraryFilter } from "./LibraryCollectionSidebar"
import type { LibraryView } from "./LibraryDocumentList"
import { LibraryHomeContent } from "./LibraryHomeContent"
import { LibraryTaskQueue } from "./LibraryTaskQueue"
import {
  collectionDocumentIds,
  type LibraryCollection,
  loadLibraryCollections,
} from "./library-collections"
import { normalizedReadingPage } from "./library-home-formatting"
import { useVisibleLibraryDocuments } from "./useVisibleLibraryDocuments"

type LibraryHomeProps = {
  readonly documents: readonly DocumentRecord[]
  readonly activeId: DocumentId | null
  readonly onSelect: (id: DocumentId) => void
  readonly onOpenReader?: ((id: DocumentId) => void) | undefined
  readonly onOpenKnowledge?: ((id: DocumentId) => void) | undefined
  readonly onOpenNode?: ((id: KnowledgeNodeId) => void) | undefined
  readonly onOpenGraph?: (() => void) | undefined
  readonly onOpenSearch?: (() => void) | undefined
  readonly onOpenExternal?: ((url: string) => void) | undefined
  readonly clientOps?: KnowledgeClientOps | undefined
  readonly active?: boolean | undefined
  readonly onImport: () => void
  readonly onFileDrop: (files: readonly File[]) => void
  readonly importLabel?: string | undefined
  readonly importProgress?: readonly ImportProgress[]
  readonly analysisJobs?: readonly DocumentAnalysisJob[]
  readonly onRetryAnalysis?: ((id: DocumentId) => void) | undefined
  readonly recentDocumentId?: DocumentId | null | undefined
  readonly recentPage?: number | null | undefined
  readonly onDeleteDocument?: ((id: DocumentId) => Promise<void>) | undefined
}

function collectionFailureMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.length < 160 && !cause.message.includes("ZodError")) {
    return cause.message
  }
  return "컬렉션을 불러오지 못했습니다. 다시 시도하세요."
}

export function LibraryHome({
  documents,
  activeId,
  onSelect,
  onOpenReader,
  onOpenKnowledge,
  onOpenNode,
  onOpenGraph,
  onOpenSearch,
  onOpenExternal,
  clientOps,
  active = true,
  onImport,
  onFileDrop,
  importLabel = "PDF 가져오기",
  importProgress = [],
  analysisJobs = [],
  onRetryAnalysis,
  recentDocumentId,
  recentPage,
  onDeleteDocument,
}: LibraryHomeProps): JSX.Element {
  const [query, setQuery] = useState("")
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState<LibraryFilter>("all")
  const [view, setView] = useState<LibraryView>("list")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [collections, setCollections] = useState<readonly LibraryCollection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    LibraryCollection["board"]["id"] | null
  >(null)
  const [collectionError, setCollectionError] = useState<string | null>(null)
  const [membershipBusyKey, setMembershipBusyKey] = useState<string | null>(null)
  const membershipBusyKeys = useRef(new Set<string>())
  const refreshGeneration = useRef(0)
  const [selectedId, setSelectedId] = useState<DocumentId | null>(
    activeId ?? documents[0]?.id ?? null,
  )
  const openReader = onOpenReader ?? onSelect

  const refreshCollections = useCallback(async (): Promise<boolean> => {
    const generation = refreshGeneration.current + 1
    refreshGeneration.current = generation
    if (!clientOps) {
      setCollections([])
      return true
    }
    try {
      const nextCollections = await loadLibraryCollections(clientOps, documents)
      if (generation !== refreshGeneration.current || !active) return false
      setCollections(nextCollections)
      const failures = nextCollections[0]?.lookupFailures.length ?? 0
      const failedBoards = nextCollections.filter(
        (collection) => collection.placementLoadFailed,
      ).length
      setCollectionError(
        failures > 0 || failedBoards > 0
          ? `${failures > 0 ? `${failures}개 문서의 연결` : "일부 컬렉션"}을 확인하지 못했습니다. 다시 불러오세요.`
          : null,
      )
      return true
    } catch (cause: unknown) {
      if (generation !== refreshGeneration.current || !active) return false
      setCollectionError(collectionFailureMessage(cause))
      return false
    }
  }, [active, clientOps, documents])

  useEffect(() => {
    if (active) void refreshCollections()
  }, [active, refreshCollections])
  useEffect(() => {
    if (activeId && documents.some((document) => document.id === activeId)) setSelectedId(activeId)
  }, [activeId, documents])

  const recentDocument = recentDocumentId
    ? (documents.find((document) => document.id === recentDocumentId) ?? null)
    : null
  const recentPageToShow = recentDocument
    ? (normalizedReadingPage(recentDocument) ?? recentPage ?? null)
    : null
  const selectedCollection = collections.find(
    (collection) => collection.board.id === selectedCollectionId,
  )
  const collectionMembers = useMemo(
    () => (selectedCollectionId ? collectionDocumentIds(selectedCollection) : null),
    [selectedCollection, selectedCollectionId],
  )
  const visibleDocuments = useVisibleLibraryDocuments(documents, {
    query,
    filter,
    recentDocumentId,
    collectionMembers,
  })
  useEffect(() => {
    if (selectedId && visibleDocuments.some((document) => document.id === selectedId)) return
    setSelectedId(visibleDocuments[0]?.id ?? documents[0]?.id ?? null)
  }, [documents, selectedId, visibleDocuments])

  const selectedDocument = selectedId
    ? (documents.find((document) => document.id === selectedId) ?? null)
    : null
  const hasActiveImport = importProgress.some((item) => item.state === "active")

  async function createCollection(title: string): Promise<boolean> {
    if (!clientOps) return false
    try {
      const board = await clientOps.createBoard(title)
      const refreshed = await refreshCollections()
      if (!refreshed) {
        setCollections((current) =>
          current.some((candidate) => candidate.board.id === board.id)
            ? current
            : [
                ...current,
                {
                  board,
                  members: [],
                  paperNodeIds: {},
                  lookupFailures: [],
                  placementLoadFailed: false,
                },
              ],
        )
        setCollectionError(
          (current) =>
            current ?? "컬렉션은 저장됐지만 목록을 새로 고치지 못했습니다. 다시 불러오세요.",
        )
      }
      setSelectedCollectionId(board.id)
      return true
    } catch (cause: unknown) {
      setCollectionError(cause instanceof Error ? cause.message : "컬렉션을 만들지 못했습니다.")
      return false
    }
  }

  async function toggleMembership(
    documentId: DocumentId,
    boardId: LibraryCollection["board"]["id"],
  ): Promise<void> {
    if (!clientOps) return
    const busyKey = `${documentId}:${boardId}`
    if (membershipBusyKeys.current.has(busyKey)) return
    membershipBusyKeys.current.add(busyKey)
    setMembershipBusyKey(busyKey)
    const collection = collections.find((candidate) => candidate.board.id === boardId)
    const paperNodeId = collection?.paperNodeIds[documentId]
    try {
      if (!collection || !paperNodeId) return
      const member = collection.members.find((candidate) => candidate.documentId === documentId)
      if (member) await clientOps.deletePlacement(member.placement.id)
      else
        await clientOps.createPlacement({ boardId, nodeId: paperNodeId, x: 80, y: 80, width: 320 })
      await refreshCollections()
    } catch (cause: unknown) {
      setCollectionError(
        cause instanceof Error ? cause.message : "컬렉션을 업데이트하지 못했습니다.",
      )
    } finally {
      membershipBusyKeys.current.delete(busyKey)
      setMembershipBusyKey((current) => (current === busyKey ? null : current))
    }
  }

  return (
    <section
      className="library-home"
      data-dragging={dragging}
      aria-label="PDF 라이브러리"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const files = Array.from(event.dataTransfer.files).filter(
          (file) =>
            file.type === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf"),
        )
        if (files.length > 0) onFileDrop(files)
      }}
    >
      <LibraryHomeContent
        documents={documents}
        recentDocument={recentDocument}
        recentPageToShow={recentPageToShow}
        visibleDocuments={visibleDocuments}
        selectedDocument={selectedDocument}
        selectedId={selectedId}
        filter={filter}
        query={query}
        view={view}
        sidebarCollapsed={sidebarCollapsed}
        collections={collections}
        selectedCollectionId={selectedCollectionId}
        importLabel={importLabel}
        hasActiveImport={hasActiveImport}
        collectionError={collectionError}
        membershipBusyKey={membershipBusyKey}
        onRetryCollections={() => void refreshCollections()}
        active={active}
        clientOps={clientOps}
        onFilterChange={(next) => {
          setFilter(next)
          if (next === "all") setSelectedCollectionId(null)
        }}
        onQueryChange={setQuery}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        onCollectionSelect={(id) => {
          setSelectedCollectionId(id)
          setFilter("all")
        }}
        onCreateCollection={createCollection}
        onViewChange={setView}
        onPreview={setSelectedId}
        onOpenReader={openReader}
        onOpenKnowledge={onOpenKnowledge}
        onOpenNode={onOpenNode}
        onOpenGraph={onOpenGraph}
        onOpenSearch={onOpenSearch}
        onOpenExternal={onOpenExternal}
        onImport={onImport}
        onToggleMembership={(documentId, boardId) => void toggleMembership(documentId, boardId)}
        onDeleteDocument={onDeleteDocument}
      />
      <LibraryTaskQueue
        imports={importProgress}
        analyses={analysisJobs}
        onRetryAnalysis={onRetryAnalysis}
      />
    </section>
  )
}
