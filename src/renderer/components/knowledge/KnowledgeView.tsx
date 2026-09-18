import { type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { NoteFragment } from "../../../shared/fragmentAnchors"
import type {
  EvidenceAnchor,
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeNodeKind,
  KnowledgeRelation,
  KnowledgeRelationId,
  RelationPredicate,
} from "../../../shared/knowledgeSchemas"
import type { NodeFilter, UpdateRelationInput } from "../../../shared/knowledgeTypes"
import type { KnowledgeClientOps } from "../../lib/knowledgeTypes"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"
import { NodeDetailRelations } from "./NodeDetailRelations"
import { NodeDetailView } from "./NodeDetailView"
import { NodeListView } from "./NodeListView"
import "./knowledge.css"
import "./knowledge-workspace.css"

export interface KnowledgeViewProps {
  readonly clientOps: KnowledgeClientOps
  readonly onJumpToEvidence?: (anchorId: EvidenceAnchorId) => void
  readonly onNodeSelect?: (nodeId: KnowledgeNodeId) => void
  readonly initialNodeId?: KnowledgeNodeId | null
}

type ViewStatus = "idle" | "loading" | "ready" | "error"

const noop = (): void => {}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

function filterFor(search: string, kind: KnowledgeNodeKind | "all"): NodeFilter {
  return {
    ...(search ? { search } : {}),
    ...(kind === "all" ? {} : { kind }),
  }
}

export function KnowledgeView({
  clientOps,
  onJumpToEvidence = noop,
  onNodeSelect = noop,
  initialNodeId = null,
}: KnowledgeViewProps): JSX.Element {
  const [nodes, setNodes] = useState<readonly KnowledgeNode[]>([])
  const [listCollapsed, setListCollapsed] = useState(false)
  const [knownNodes, setKnownNodes] = useState<readonly KnowledgeNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<KnowledgeNodeId | null>(null)
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null)
  const [relations, setRelations] = useState<readonly KnowledgeRelation[]>([])
  const [evidenceByRelation, setEvidenceByRelation] = useState<
    ReadonlyMap<KnowledgeRelationId, readonly EvidenceAnchor[]>
  >(new Map())
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedKind, setSelectedKind] = useState<KnowledgeNodeKind | "all">("all")
  const [status, setStatus] = useState<ViewStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [editingNodeId, setEditingNodeId] = useState<KnowledgeNodeId | null>(null)
  const [newRelTargetId, setNewRelTargetId] = useState<KnowledgeNodeId | null>(null)
  const [newRelPredicate, setNewRelPredicate] = useState<RelationPredicate>("relates_to")
  const [selectedFragment, setSelectedFragment] = useState<NoteFragment | null>(null)
  const listGeneration = useRef(0)
  const selectionGeneration = useRef(0)
  const selectedNodeIdRef = useRef<KnowledgeNodeId | null>(null)
  const editingNodeIdRef = useRef(editingNodeId)
  editingNodeIdRef.current = editingNodeId
  useEffect(() => {
    if (!editingNodeId) setNotice(null)
  }, [editingNodeId])
  const requestedInitialNodeIdRef = useRef<KnowledgeNodeId | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 150)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const request = ++listGeneration.current
    void reloadToken
    setStatus("loading")
    setError(null)
    void Promise.all([
      clientOps.findNodes(filterFor(debouncedSearch, selectedKind)),
      clientOps.findNodes(),
    ])
      .then(([filtered, available]) => {
        if (listGeneration.current !== request) return
        setNodes(filtered)
        setKnownNodes(available)
        setStatus("ready")
      })
      .catch((cause: unknown) => {
        if (listGeneration.current !== request) return
        setStatus("error")
        setError(errorMessage(cause, "지식 목록을 불러오지 못했습니다."))
      })
  }, [clientOps, debouncedSearch, selectedKind, reloadToken])

  const loadSelection = useCallback(
    async (id: KnowledgeNodeId): Promise<void> => {
      if (editingNodeIdRef.current && editingNodeIdRef.current !== id) {
        setNotice("작성 중인 내용을 먼저 저장한 후 다른 항목을 열 수 있습니다.")
        return
      }
      const request = ++selectionGeneration.current
      const sameNodeRefresh = selectedNodeIdRef.current === id
      selectedNodeIdRef.current = id
      setSelectedNodeId(id)
      if (!sameNodeRefresh) {
        setSelectedNode(null)
        setRelations([])
        setEvidenceByRelation(new Map())
      }
      setStatus("loading")
      setError(null)
      try {
        const [node, fetchedRelations] = await Promise.all([
          clientOps.getNode(id),
          clientOps.findRelations({ nodeId: id }),
        ])
        if (selectionGeneration.current !== request) return
        if (!node) {
          selectedNodeIdRef.current = null
          setSelectedNode(null)
          setRelations([])
          setError("선택한 지식 항목을 찾을 수 없습니다.")
          setStatus("error")
          return
        }
        const evidencePairs = await Promise.all(
          fetchedRelations.map(async (relation) => {
            const anchors = await Promise.all(
              relation.evidenceIds.map(async (anchorId) => clientOps.getEvidenceAnchor(anchorId)),
            )
            return {
              id: relation.id,
              anchors: anchors.filter((anchor): anchor is EvidenceAnchor => Boolean(anchor)),
            }
          }),
        )
        if (selectionGeneration.current !== request) return
        setSelectedNode(node)
        setRelations(fetchedRelations)
        const nextEvidence = new Map<KnowledgeRelationId, readonly EvidenceAnchor[]>()
        for (const pair of evidencePairs) nextEvidence.set(pair.id, pair.anchors)
        setEvidenceByRelation(nextEvidence)
        setStatus("ready")
        onNodeSelect(id)
      } catch (cause) {
        if (selectionGeneration.current !== request) return
        setStatus("error")
        setError(errorMessage(cause, "지식 항목을 불러오지 못했습니다."))
      }
    },
    [clientOps, onNodeSelect],
  )

  useEffect(() => {
    if (!initialNodeId) return
    if (requestedInitialNodeIdRef.current === initialNodeId) return
    if (editingNodeId && editingNodeId !== initialNodeId) {
      setNotice("작성 중인 내용을 먼저 저장하면 선택한 항목을 열 수 있습니다.")
      return
    }
    requestedInitialNodeIdRef.current = initialNodeId
    void loadSelection(initialNodeId)
  }, [initialNodeId, loadSelection, editingNodeId])

  useEffect(
    () =>
      window.scourgify?.collection?.onChanged(() => {
        setReloadToken((token) => token + 1)
        if (selectedNodeId && !editingNodeId) void loadSelection(selectedNodeId)
      }),
    [editingNodeId, selectedNodeId, loadSelection],
  )

  async function refreshSelection(): Promise<void> {
    if (selectedNodeId) await loadSelection(selectedNodeId)
    setReloadToken((token) => token + 1)
  }

  async function createNode(): Promise<void> {
    if (editingNodeId) {
      setNotice("현재 노트를 먼저 저장한 후 새 항목을 만들 수 있습니다.")
      return
    }
    try {
      const kind = selectedKind === "all" ? "note" : selectedKind
      const created = await clientOps.createNode({
        kind,
        title: `새 ${knowledgeNodeKindLabel(kind)}`,
        body: "",
        aliases: [],
      })
      await refreshSelection()
      await loadSelection(created.id)
    } catch (cause) {
      setError(errorMessage(cause, "새 지식을 만들지 못했습니다."))
      setStatus("error")
    }
  }

  async function updateNode(fields: {
    readonly expectedBody?: string
    readonly title?: string
    readonly body?: string
    readonly aliases?: readonly string[]
  }): Promise<KnowledgeNode> {
    if (!selectedNodeId) throw new Error("선택된 지식 항목이 없습니다.")
    const updated = await clientOps.updateNode({ id: selectedNodeId, ...fields })
    setSelectedNode(updated)
    setKnownNodes((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    setNodes((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    return updated
  }

  async function deleteNode(): Promise<void> {
    if (!selectedNodeId) return
    const deleted = await clientOps.deleteNode(selectedNodeId)
    if (!deleted) throw new Error("지식을 삭제하지 못했습니다.")
    setSelectedNodeId(null)
    selectedNodeIdRef.current = null
    requestedInitialNodeIdRef.current = null
    setSelectedNode(null)
    setRelations([])
    setEvidenceByRelation(new Map())
    setReloadToken((token) => token + 1)
  }

  async function createRelation(
    input: Parameters<KnowledgeClientOps["createRelation"]>[0],
  ): Promise<void> {
    try {
      await clientOps.createRelation(input)
      await refreshSelection()
    } catch (cause) {
      setError(errorMessage(cause, "관계를 만들지 못했습니다."))
      setStatus("error")
      throw cause
    }
  }

  async function updateRelation(input: UpdateRelationInput): Promise<void> {
    try {
      await clientOps.updateRelation(input)
      await refreshSelection()
    } catch (cause) {
      setError(errorMessage(cause, "관계 검토 상태를 저장하지 못했습니다."))
      setStatus("error")
    }
  }

  function selectNode(node: KnowledgeNode): void {
    if (editingNodeId && editingNodeId !== node.id) {
      setNotice("편집 중인 항목을 먼저 저장하세요.")
      return
    }
    void loadSelection(node.id)
  }

  function selectNodeById(id: KnowledgeNodeId): void {
    if (editingNodeId && editingNodeId !== id) {
      setNotice("편집 중인 항목을 먼저 저장하세요.")
      return
    }
    void loadSelection(id)
  }

  return (
    <div className="knowledge-shell knowledge-view-shell" data-list-collapsed={listCollapsed}>
      <NodeListView
        collapsed={listCollapsed}
        onToggle={() => setListCollapsed((collapsed) => !collapsed)}
        nodes={nodes}
        selectedId={selectedNodeId}
        onSelect={selectNode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedKind={selectedKind}
        onKindChange={setSelectedKind}
        onCreate={() => void createNode()}
        loading={status === "loading"}
      />
      <main className="knowledge-pane knowledge-detail-pane">
        {notice ? (
          <p className="knowledge-help" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="knowledge-error" role="alert">
            {error}{" "}
            <button
              type="button"
              className="knowledge-btn"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              다시 시도
            </button>
          </p>
        ) : null}
        <NodeDetailView
          key={selectedNode?.id ?? "knowledge-empty"}
          node={selectedNode}
          fragment={selectedFragment}
          onFragmentChange={setSelectedFragment}
          allNodes={knownNodes}
          relations={relations}
          evidenceByRelation={evidenceByRelation}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onCreateRelation={createRelation}
          onUpdateRelation={updateRelation}
          onJumpToEvidence={onJumpToEvidence}
          onSelectNode={selectNodeById}
          onEditingChange={(editing) => setEditingNodeId(editing ? selectedNodeId : null)}
          renderRelations={false}
          newRelTargetId={newRelTargetId}
          setNewRelTargetId={setNewRelTargetId}
          newRelPredicate={newRelPredicate}
          setNewRelPredicate={setNewRelPredicate}
        />
      </main>
      <aside className="knowledge-pane knowledge-evidence-pane" aria-label="연결된 근거">
        <h2 className="knowledge-evidence-title">연결된 근거</h2>
        {selectedNode ? (
          <NodeDetailRelations
            node={selectedNode}
            allNodes={knownNodes}
            relations={relations}
            evidenceByRelation={evidenceByRelation}
            onCreateRelation={createRelation}
            onUpdateRelation={updateRelation}
            onJumpToEvidence={onJumpToEvidence}
            onSelectNode={selectNodeById}
            onOpenFragment={(anchor) => {
              setSelectedFragment(anchor)
              selectNodeById(anchor.nodeId)
            }}
            newRelTargetId={newRelTargetId}
            setNewRelTargetId={setNewRelTargetId}
            newRelPredicate={newRelPredicate}
            setNewRelPredicate={setNewRelPredicate}
          />
        ) : (
          <p className="knowledge-empty">항목을 선택하면 연결된 근거와 백링크가 표시됩니다.</p>
        )}
      </aside>
    </div>
  )
}
