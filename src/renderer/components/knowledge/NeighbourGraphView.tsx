import { type JSX, useEffect, useMemo, useRef, useState } from "react"
import type {
  EvidenceAnchorId,
  KnowledgeNode,
  KnowledgeNodeId,
  RelationReviewState,
} from "../../../shared/knowledgeSchemas"
import type { NodeNeighbourGraph } from "../../../shared/knowledgeTypes"
import type { KnowledgeClientOps } from "../../lib/knowledgeTypes"
import { GraphStage } from "./NeighbourGraphCanvas"
import { GraphDetail, GraphList } from "./NeighbourGraphParts"
import {
  categoryFor,
  type GraphFilterCategory,
  graphPositions,
  parseReview,
  proposalsFor,
  relationsForNode,
} from "./NeighbourGraphSelectors"
import { NeighbourGraphToolbar } from "./NeighbourGraphToolbar"
import "./knowledge.css"
import "./NeighbourGraph.css"

export type { GraphFilterCategory } from "./NeighbourGraphSelectors"

export interface NeighbourGraphViewProps {
  readonly clientOps: KnowledgeClientOps
  readonly activeNodeId: KnowledgeNodeId | null
  readonly isVisible?: boolean
  readonly onNodeClick?: (nodeId: KnowledgeNodeId) => void
  readonly onEvidenceClick?: (anchorId: EvidenceAnchorId) => void
}

export function NeighbourGraphView({
  clientOps,
  activeNodeId,
  isVisible = true,
  onNodeClick = () => {},
  onEvidenceClick,
}: NeighbourGraphViewProps): JSX.Element {
  const [allNodes, setAllNodes] = useState<readonly KnowledgeNode[]>([])
  const [rootHistory, setRootHistory] = useState<readonly KnowledgeNodeId[]>(
    activeNodeId ? [activeNodeId] : [],
  )
  const [historyIndex, setHistoryIndex] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<KnowledgeNodeId | null>(activeNodeId)
  const [graph, setGraph] = useState<NodeNeighbourGraph | null>(null)
  const [filter, setFilter] = useState<GraphFilterCategory>("all")
  const [reviewFilter, setReviewFilter] = useState<"all" | RelationReviewState>("all")
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph")
  const [listCollapsed, setListCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const activeNodeRef = useRef(activeNodeId)
  const rootId = rootHistory[historyIndex] ?? null
  useEffect(() => {
    if (activeNodeRef.current === activeNodeId) return
    activeNodeRef.current = activeNodeId
    if (activeNodeId) {
      setRootHistory([activeNodeId])
      setHistoryIndex(0)
      setSelectedNodeId(activeNodeId)
    }
  }, [activeNodeId])
  useEffect(() => {
    if (!isVisible) return
    let current = true
    void reloadToken
    void clientOps
      .findNodes()
      .then((nodes) => {
        if (current) setAllNodes(nodes)
      })
      .catch((cause: unknown) => {
        if (current)
          setError(cause instanceof Error ? cause.message : "그래프 노드를 불러오지 못했습니다.")
      })
    return () => {
      current = false
    }
  }, [clientOps, isVisible, reloadToken])
  useEffect(() => {
    if (!isVisible) return
    if (!rootId) {
      setGraph(null)
      return
    }
    void reloadToken
    let current = true
    setLoading(true)
    setError(null)
    void clientOps
      .getNeighbourGraph(rootId, 1)
      .then((next) => {
        if (!current) return
        setGraph(next)
        setSelectedNodeId((selected) =>
          next.nodes.some((node) => node.id === selected) ? selected : next.rootNode.id,
        )
      })
      .catch((cause: unknown) => {
        if (current) {
          setGraph(null)
          setError(cause instanceof Error ? cause.message : "그래프를 불러오지 못했습니다.")
        }
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [clientOps, isVisible, reloadToken, rootId])
  const filteredRelations = useMemo(
    () =>
      graph?.relations.filter(
        (relation) =>
          (reviewFilter === "all" || relation.reviewState === reviewFilter) &&
          (filter === "all" || categoryFor(relation.predicate) === filter),
      ) ?? [],
    [filter, graph, reviewFilter],
  )
  const visibleNodes = useMemo(() => {
    if (!graph) return []
    const ids = new Set<KnowledgeNodeId>([graph.rootNode.id])
    filteredRelations.forEach((relation) => {
      ids.add(relation.sourceId)
      ids.add(relation.targetId)
    })
    return graph.nodes.filter((node) => ids.has(node.id))
  }, [filteredRelations, graph])
  const positions = useMemo(
    () =>
      graph
        ? graphPositions(graph, visibleNodes)
        : new Map<KnowledgeNodeId, { readonly x: number; readonly y: number }>(),
    [graph, visibleNodes],
  )
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? graph?.rootNode
  const selectedRelations = graph ? relationsForNode(graph, selectedNodeId) : []
  const evidence = useMemo(() => {
    if (!graph) return []
    const ids = new Set(selectedRelations.flatMap((relation) => relation.evidenceIds))
    return graph.evidenceAnchors.filter((anchor) => ids.has(anchor.id))
  }, [graph, selectedRelations])
  const proposals = proposalsFor(selectedRelations)
  const selectNode = (id: KnowledgeNodeId): void => setSelectedNodeId(id)
  const exploreNode = (id: KnowledgeNodeId): void => {
    setRootHistory((current) => {
      const existing = current[historyIndex]
      if (existing === id) return current
      const next = [...current.slice(0, historyIndex + 1), id]
      setHistoryIndex(next.length - 1)
      return next
    })
    setSelectedNodeId(id)
  }
  const moveHistory = (index: number): void => {
    const id = rootHistory[index]
    if (!id) return
    setHistoryIndex(index)
    setSelectedNodeId(id)
  }
  return (
    <div className="knowledge-shell knowledge-graph-view neighbour-graph-view">
      <NeighbourGraphToolbar
        allNodes={allNodes}
        rootId={rootId}
        rootHistory={rootHistory}
        historyIndex={historyIndex}
        filter={filter}
        reviewFilter={reviewFilter}
        viewMode={viewMode}
        listCollapsed={listCollapsed}
        onExploreNode={exploreNode}
        onMoveHistory={moveHistory}
        onFilterChange={setFilter}
        onReviewFilterChange={(value) => {
          const next = parseReview(value)
          if (next) setReviewFilter(next)
        }}
        onViewModeChange={setViewMode}
        onListCollapsedChange={setListCollapsed}
      />
      {error ? (
        <p className="neighbour-graph-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            다시 시도
          </button>
        </p>
      ) : null}
      {!rootId ? (
        <p className="neighbour-graph-empty">기준 노드를 선택하면 연결된 이웃만 표시됩니다.</p>
      ) : null}
      {rootId && loading ? <p className="neighbour-graph-empty">연결을 불러오는 중...</p> : null}
      {rootId && !loading && graph && selectedNode ? (
        <div
          className={`neighbour-graph-layout${viewMode === "list" ? " is-list-view" : ""}${listCollapsed ? " is-list-collapsed" : ""}`}
        >
          <GraphList
            graph={graph}
            relations={filteredRelations}
            selectedNodeId={selectedNode.id}
            onNodeClick={selectNode}
            onEvidenceClick={onEvidenceClick}
          />
          {viewMode === "graph" ? (
            <GraphStage
              graph={graph}
              relations={filteredRelations}
              nodes={visibleNodes}
              positions={positions}
              selectedNodeId={selectedNode.id}
              onNodeClick={selectNode}
            />
          ) : (
            <GraphList
              graph={graph}
              relations={filteredRelations}
              selectedNodeId={selectedNode.id}
              onNodeClick={selectNode}
              onEvidenceClick={onEvidenceClick}
              expanded
            />
          )}
          <GraphDetail
            root={selectedNode}
            evidence={evidence}
            proposals={proposals}
            isRootSelection={selectedNode.id === graph.rootNode.id}
            onEvidenceClick={onEvidenceClick}
            onOpenNode={onNodeClick}
            onExploreNode={exploreNode}
          />
        </div>
      ) : null}
      {rootId && graph?.truncated ? (
        <p className="neighbour-graph-truncated">표시 한도에 맞춰 일부 연결만 표시하고 있습니다.</p>
      ) : null}
    </div>
  )
}
