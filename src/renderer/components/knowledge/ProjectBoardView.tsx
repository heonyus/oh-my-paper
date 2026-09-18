import { type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react"
import type {
  BoardId,
  BoardRecord,
  KnowledgeNode,
  KnowledgeNodeId,
  PlacementRecord,
} from "../../../shared/knowledgeSchemas"
import type { KnowledgeClientOps } from "../../lib/knowledgeTypes"
import { ProjectBoardCanvas } from "./ProjectBoardCanvas"
import { ProjectBoardDetail, ProjectBoardHeader, ProjectBoardList } from "./ProjectBoardParts"
import "./knowledge.css"

export interface ProjectBoardViewProps {
  readonly clientOps: KnowledgeClientOps
  readonly onNodeClick?: (nodeId: KnowledgeNodeId) => void
  readonly onBoardSelect?: (boardId: BoardId) => void
  readonly isVisible?: boolean
}
export function ProjectBoardView({
  clientOps,
  onNodeClick = () => {},
  onBoardSelect,
  isVisible = true,
}: ProjectBoardViewProps): JSX.Element {
  const [boards, setBoards] = useState<readonly BoardRecord[]>([])
  const [board, setBoard] = useState<BoardRecord | null>(null)
  const [placements, setPlacements] = useState<readonly PlacementRecord[]>([])
  const [allNodes, setAllNodes] = useState<readonly KnowledgeNode[]>([])
  const [selectedAddNodeId, setSelectedAddNodeId] = useState<KnowledgeNodeId | null>(null)
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementRecord | null>(null)
  const [newBoardTitle, setNewBoardTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const boardSelectRef = useRef(onBoardSelect)
  const boardRef = useRef<BoardRecord | null>(null)
  const selectedPlacementRef = useRef<PlacementRecord | null>(null)
  const hasLoadedRef = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    boardSelectRef.current = onBoardSelect
  }, [onBoardSelect])
  useEffect(() => {
    selectedPlacementRef.current = selectedPlacement
  }, [selectedPlacement])
  useEffect(() => {
    if (!isVisible) return
    const request = ++generation.current
    setLoading(!hasLoadedRef.current)
    void Promise.all([clientOps.listBoards(), clientOps.findNodes()])
      .then(async ([nextBoards, nodes]) => {
        if (generation.current !== request) return
        const preferredBoardId = boardRef.current?.id
        const firstBoard =
          nextBoards.find((candidate) => candidate.id === preferredBoardId) ??
          nextBoards[0] ??
          (await clientOps.getOrCreateDefaultBoard())
        if (generation.current !== request) return
        setBoards(nextBoards.length ? nextBoards : [firstBoard])
        setAllNodes(nodes)
        boardRef.current = firstBoard
        setBoard(firstBoard)
        boardSelectRef.current?.(firstBoard.id)
        const nextPlacements = await clientOps.findPlacementsForBoard(firstBoard.id)
        if (generation.current !== request) return
        setPlacements(nextPlacements)
        const selected = selectedPlacementRef.current
        setSelectedPlacement(
          selected && nextPlacements.some((placement) => placement.id === selected.id)
            ? selected
            : null,
        )
        hasLoadedRef.current = true
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (generation.current === request) {
          setError(cause instanceof Error ? cause.message : "프로젝트 보드를 불러오지 못했습니다.")
          setLoading(false)
        }
      })
  }, [clientOps, isVisible])
  async function savePosition(
    id: PlacementRecord["id"],
    x: number,
    y: number,
    boardId: BoardId,
  ): Promise<void> {
    if (boardRef.current?.id !== boardId) return
    const request = generation.current
    try {
      const saved = await clientOps.updatePlacement({ id, x, y })
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setPlacements((current) =>
        current.map((placement) => (placement.id === saved.id ? saved : placement)),
      )
      setSelectedPlacement((current) => (current?.id === saved.id ? saved : current))
    } catch (cause: unknown) {
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setError(cause instanceof Error ? cause.message : "위치를 저장하지 못했습니다.")
      const recovered = await clientOps.findPlacementsForBoard(boardId)
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setPlacements(recovered)
    }
  }
  async function createBoard(): Promise<void> {
    const title = newBoardTitle.trim()
    if (!title) return
    const request = ++generation.current
    try {
      const created = await clientOps.createBoard(title)
      if (generation.current !== request) return
      setBoards((current) => [...current, created])
      boardRef.current = created
      setBoard(created)
      setPlacements([])
      setSelectedPlacement(null)
      setNewBoardTitle("")
      boardSelectRef.current?.(created.id)
    } catch (cause: unknown) {
      if (generation.current !== request) return
      setError(cause instanceof Error ? cause.message : "프로젝트를 만들지 못했습니다.")
    }
  }
  async function selectBoard(id: BoardId): Promise<void> {
    const nextBoard = boards.find((candidate) => candidate.id === id)
    if (!nextBoard) return
    const request = ++generation.current
    try {
      setBoard(nextBoard)
      boardRef.current = nextBoard
      setPlacements([])
      setSelectedPlacement(null)
      const nextPlacements = await clientOps.findPlacementsForBoard(id)
      if (generation.current !== request || boardRef.current?.id !== id) return
      setPlacements(nextPlacements)
      boardSelectRef.current?.(id)
    } catch (cause: unknown) {
      if (generation.current !== request || boardRef.current?.id !== id) return
      setError(cause instanceof Error ? cause.message : "선택한 보드를 불러오지 못했습니다.")
    }
  }
  async function addPlacement(): Promise<void> {
    if (!board || !selectedAddNodeId) return
    const boardId = board.id
    const request = generation.current
    try {
      const next = await clientOps.createPlacement({
        boardId,
        nodeId: selectedAddNodeId,
        x: 80 + (placements.length % 3) * 320,
        y: 80 + Math.floor(placements.length / 3) * 220,
        width: 280,
      })
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setPlacements((current) => [...current, next])
      setSelectedPlacement(next)
      setSelectedAddNodeId(null)
    } catch (cause: unknown) {
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setError(cause instanceof Error ? cause.message : "노드를 배치하지 못했습니다.")
    }
  }
  async function removePlacement(id: PlacementRecord["id"], boardId: BoardId): Promise<void> {
    if (boardRef.current?.id !== boardId) return
    const request = generation.current
    try {
      const removed = await clientOps.deletePlacement(id)
      if (!removed) throw new Error("배치를 삭제하지 못했습니다.")
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setPlacements((current) => current.filter((placement) => placement.id !== id))
      setSelectedPlacement((current) => (current?.id === id ? null : current))
    } catch (cause: unknown) {
      if (generation.current !== request || boardRef.current?.id !== boardId) return
      setError(cause instanceof Error ? cause.message : "배치를 삭제하지 못했습니다.")
    }
  }
  async function keyboardMove(
    event: KeyboardEvent<HTMLButtonElement>,
    placement: PlacementRecord,
  ): Promise<void> {
    const delta =
      event.key === "ArrowLeft"
        ? { x: -16, y: 0 }
        : event.key === "ArrowRight"
          ? { x: 16, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -16 }
            : event.key === "ArrowDown"
              ? { x: 0, y: 16 }
              : null
    if (!delta) return
    event.preventDefault()
    const x = Math.max(0, placement.x + delta.x)
    const y = Math.max(0, placement.y + delta.y)
    setPlacements((current) =>
      current.map((item) => (item.id === placement.id ? { ...item, x, y } : item)),
    )
    await savePosition(placement.id, x, y, placement.boardId)
  }

  if (loading)
    return (
      <div className="knowledge-shell">
        <p className="knowledge-empty">프로젝트를 불러오는 중...</p>
      </div>
    )
  const selectedNode = selectedPlacement
    ? allNodes.find((node) => node.id === selectedPlacement.nodeId)
    : undefined
  return (
    <div className="knowledge-shell knowledge-project-view">
      <ProjectBoardHeader
        board={board}
        boards={boards}
        allNodes={allNodes}
        selectedAddNodeId={selectedAddNodeId}
        newBoardTitle={newBoardTitle}
        onBoardSelect={(id) => void selectBoard(id)}
        onNewBoardTitleChange={setNewBoardTitle}
        onCreateBoard={() => void createBoard()}
        onAddNodeSelect={setSelectedAddNodeId}
        onAddPlacement={() => void addPlacement()}
      />
      {error ? (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="knowledge-project-layout">
        <ProjectBoardList
          boards={boards}
          selectedId={board?.id ?? null}
          onSelect={(id) => void selectBoard(id)}
          onFocusNew={() =>
            document.querySelector<HTMLInputElement>("[aria-label='새 프로젝트 이름']")?.focus()
          }
        />
        <ProjectBoardCanvas
          placements={placements}
          allNodes={allNodes}
          onRemove={(id, boardId) => void removePlacement(id, boardId)}
          onSelect={setSelectedPlacement}
          onNodeClick={onNodeClick}
          onPreviewPosition={(id, x, y) =>
            setPlacements((current) =>
              current.map((item) => (item.id === id ? { ...item, x, y } : item)),
            )
          }
          onPositionCommit={(id, x, y, boardId) => void savePosition(id, x, y, boardId)}
          onKeyboardMove={(event, placement) => void keyboardMove(event, placement)}
        />
        <ProjectBoardDetail
          node={selectedNode}
          placement={selectedPlacement}
          onClose={() => setSelectedPlacement(null)}
          onRemove={(id) => {
            const current = selectedPlacement
            if (current) void removePlacement(id, current.boardId)
          }}
        />
      </div>
    </div>
  )
}
