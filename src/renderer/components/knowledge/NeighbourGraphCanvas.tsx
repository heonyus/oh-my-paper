import { ArrowDownRight, LocateFixed, Minus, Plus } from "lucide-react"
import {
  type JSX,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type WheelEvent,
} from "react"
import type {
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
} from "../../../shared/knowledgeSchemas"
import type { NodeNeighbourGraph } from "../../../shared/knowledgeTypes"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"
import { GraphEdges } from "./NeighbourGraphEdges"
import { nodeIcon } from "./NeighbourGraphParts"
import { GRAPH_WORLD, type GraphPosition } from "./NeighbourGraphSelectors"

interface GraphStageProps {
  readonly graph: NodeNeighbourGraph
  readonly relations: readonly KnowledgeRelation[]
  readonly nodes: readonly KnowledgeNode[]
  readonly positions: ReadonlyMap<KnowledgeNodeId, GraphPosition>
  readonly selectedNodeId: KnowledgeNodeId
  readonly onNodeClick: (id: KnowledgeNodeId) => void
}
interface GraphViewState {
  readonly scale: number
  readonly x: number
  readonly y: number
}
const MIN_ZOOM = 0.45
const MAX_ZOOM = 2.4
const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export function GraphStage({
  graph,
  relations,
  nodes,
  positions,
  selectedNodeId,
  onNodeClick,
}: GraphStageProps): JSX.Element {
  const stageRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{
    readonly pointerId: number
    readonly clientX: number
    readonly clientY: number
    readonly view: GraphViewState
  } | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<GraphViewState>({ scale: 1, x: 0, y: 0 })
  const fitKey = `${graph.rootNode.id}:${nodes.length}`
  const userAdjustedRef = useRef(false)
  const previousFitKeyRef = useRef(fitKey)
  const markerId = `neighbour-graph-arrow-${useId().replaceAll(":", "")}`

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    if (typeof ResizeObserver === "undefined") {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box) setStageSize({ width: box.width, height: box.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  const fitGraph = useCallback(() => {
    const bounds = nodes.reduce(
      (current, node) => {
        const position = positions.get(node.id)
        if (!position) return current
        return {
          minX: Math.min(current.minX, position.x - 90),
          minY: Math.min(current.minY, position.y - 50),
          maxX: Math.max(current.maxX, position.x + 90),
          maxY: Math.max(current.maxY, position.y + 50),
        }
      },
      {
        minX: GRAPH_WORLD.width / 2,
        minY: GRAPH_WORLD.height / 2,
        maxX: GRAPH_WORLD.width / 2,
        maxY: GRAPH_WORLD.height / 2,
      },
    )
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const scale = Math.min(
      1,
      Math.max(0.1, (stageSize.width - 40) / width),
      Math.max(0.1, (stageSize.height - 40) / height),
    )
    setView({
      scale,
      x: (stageSize.width - width * scale) / 2 - bounds.minX * scale,
      y: (stageSize.height - height * scale) / 2 - bounds.minY * scale,
    })
  }, [nodes, positions, stageSize])
  useEffect(() => {
    if (previousFitKeyRef.current !== fitKey) {
      previousFitKeyRef.current = fitKey
      userAdjustedRef.current = false
    }
    if (!userAdjustedRef.current && stageSize.width > 0 && stageSize.height > 0) fitGraph()
  }, [fitGraph, fitKey, stageSize.height, stageSize.width])
  const requestFit = (): void => {
    userAdjustedRef.current = false
    fitGraph()
  }
  const updateZoom = (factor: number): void => {
    userAdjustedRef.current = true
    setView((current) => ({ ...current, scale: clampZoom(current.scale * factor) }))
  }
  const handleWheel = (event: WheelEvent<HTMLElement>): void => {
    event.preventDefault()
    userAdjustedRef.current = true
    const rect = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    setView((current) => {
      const scale = clampZoom(current.scale * factor)
      const worldX = (cursorX - current.x) / current.scale
      const worldY = (cursorY - current.y) / current.scale
      return { scale, x: cursorX - worldX * scale, y: cursorY - worldY * scale }
    })
  }
  const handlePointerDown = (event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button")))
      return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view,
    }
  }
  const handlePointerMove = (event: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    userAdjustedRef.current = true
    setView({
      ...drag.view,
      x: drag.view.x + event.clientX - drag.clientX,
      y: drag.view.y + event.clientY - drag.clientY,
    })
  }
  const handlePointerUp = (event: PointerEvent<HTMLElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return (
    <section
      ref={stageRef}
      className="neighbour-graph-stage"
      aria-label="이웃 관계 시각화"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="neighbour-graph-canvas"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <GraphEdges relations={relations} positions={positions} markerId={markerId} />
        {nodes.map((node) => {
          const position = positions.get(node.id)
          return position ? (
            <button
              key={node.id}
              type="button"
              className="neighbour-graph-node"
              data-root={node.id === graph.rootNode.id}
              data-selected={node.id === selectedNodeId}
              data-kind={node.kind}
              style={{ left: position.x, top: position.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onNodeClick(node.id)}
              aria-pressed={node.id === selectedNodeId}
            >
              <span className="neighbour-graph-node-icon">{nodeIcon(node.kind)}</span>
              <strong>{node.title}</strong>
              <small>{knowledgeNodeKindLabel(node.kind)}</small>
            </button>
          ) : null
        })}
      </div>
      <fieldset className="neighbour-graph-legend" aria-label="관계 범례">
        <span>
          <i data-solid="true" /> 저장된 연결
        </span>
        <span>
          <i /> 검토 전 제안
        </span>
      </fieldset>
      <fieldset className="neighbour-graph-controls" aria-label="그래프 보기 도구">
        <button
          type="button"
          className="neighbour-graph-control"
          aria-label="그래프 맞춤"
          onClick={requestFit}
        >
          <LocateFixed size={15} />
        </button>
        <span aria-live="polite">{Math.round(view.scale * 100)}%</span>
        <button
          type="button"
          className="neighbour-graph-control"
          aria-label="그래프 축소"
          onClick={() => updateZoom(0.85)}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="neighbour-graph-control"
          aria-label="그래프 확대"
          onClick={() => updateZoom(1.15)}
        >
          <Plus size={15} />
        </button>
      </fieldset>
      <p className="neighbour-graph-pan-hint">
        <ArrowDownRight size={13} /> 드래그하여 이동 · 휠로 확대
      </p>
    </section>
  )
}
