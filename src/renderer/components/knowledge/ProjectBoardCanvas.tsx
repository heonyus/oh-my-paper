import { type JSX, type KeyboardEvent, type PointerEvent, useRef } from "react"
import type {
  BoardId,
  KnowledgeNode,
  KnowledgeNodeId,
  PlacementRecord,
} from "../../../shared/knowledgeSchemas"
import { ProjectBoardCard } from "./ProjectBoardCard"

export interface ProjectBoardCanvasProps {
  readonly placements: readonly PlacementRecord[]
  readonly allNodes: readonly KnowledgeNode[]
  readonly onRemove: (id: PlacementRecord["id"], boardId: BoardId) => void
  readonly onSelect: (placement: PlacementRecord) => void
  readonly onNodeClick: (id: KnowledgeNodeId) => void
  readonly onPreviewPosition: (id: PlacementRecord["id"], x: number, y: number) => void
  readonly onPositionCommit: (
    id: PlacementRecord["id"],
    x: number,
    y: number,
    boardId: BoardId,
  ) => void
  readonly onKeyboardMove: (
    event: KeyboardEvent<HTMLButtonElement>,
    placement: PlacementRecord,
  ) => void
}

export function ProjectBoardCanvas({
  placements,
  allNodes,
  onRemove,
  onSelect,
  onNodeClick,
  onPreviewPosition,
  onPositionCommit,
  onKeyboardMove,
}: ProjectBoardCanvasProps): JSX.Element {
  const stageRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{
    readonly id: PlacementRecord["id"]
    readonly offsetX: number
    readonly offsetY: number
  } | null>(null)
  const point = (
    event: PointerEvent<HTMLElement>,
  ): { readonly x: number; readonly y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const bounds = stage.getBoundingClientRect()
    return {
      x: Math.max(0, event.clientX - bounds.left + stage.scrollLeft),
      y: Math.max(0, event.clientY - bounds.top + stage.scrollTop),
    }
  }
  const begin = (event: PointerEvent<HTMLElement>, placement: PlacementRecord): void => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest("[data-drag-handle]"))
      return
    const location = point(event)
    if (!location) return
    dragRef.current = {
      id: placement.id,
      offsetX: location.x - placement.x,
      offsetY: location.y - placement.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLElement>, placement: PlacementRecord): void => {
    const drag = dragRef.current
    const location = point(event)
    if (!drag || drag.id !== placement.id || !location) return
    onPreviewPosition(
      placement.id,
      Math.max(0, location.x - drag.offsetX),
      Math.max(0, location.y - drag.offsetY),
    )
  }
  const end = (event: PointerEvent<HTMLElement>, placement: PlacementRecord): void => {
    const drag = dragRef.current
    const location = point(event)
    dragRef.current = null
    if (drag && drag.id === placement.id && location)
      onPositionCommit(
        placement.id,
        Math.max(0, location.x - drag.offsetX),
        Math.max(0, location.y - drag.offsetY),
        placement.boardId,
      )
  }
  return (
    <section ref={stageRef} className="knowledge-board-stage" aria-label="프로젝트 보드 배치 영역">
      <div className="knowledge-board-canvas">
        {placements.length === 0 ? (
          <p className="knowledge-empty">이 보드에 배치된 지식이 없습니다.</p>
        ) : null}
        {placements.map((placement) => {
          const node = allNodes.find((candidate) => candidate.id === placement.nodeId)
          if (!node) return null
          return (
            <ProjectBoardCard
              key={placement.id}
              node={node}
              placement={placement}
              onRemove={(id) => onRemove(id, placement.boardId)}
              onSelect={onSelect}
              onNodeClick={onNodeClick}
              onPointerDown={(event) => begin(event, placement)}
              onPointerMove={(event) => move(event, placement)}
              onPointerUp={(event) => end(event, placement)}
              onKeyboardMove={(event) => onKeyboardMove(event, placement)}
            />
          )
        })}
      </div>
    </section>
  )
}
