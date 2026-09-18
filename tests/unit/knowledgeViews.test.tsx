import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CompareView } from "../../src/renderer/components/knowledge/CompareView"
import { KnowledgeView } from "../../src/renderer/components/knowledge/KnowledgeView"
import { NeighbourGraphView } from "../../src/renderer/components/knowledge/NeighbourGraphView"
import { ProjectBoardCard } from "../../src/renderer/components/knowledge/ProjectBoardCard"
import { ProjectBoardView } from "../../src/renderer/components/knowledge/ProjectBoardView"
import type { KnowledgeClientOps } from "../../src/renderer/lib/knowledgeTypes"
import {
  boardIdSchema,
  boardRecordSchema,
  knowledgeNodeIdSchema,
  knowledgeNodeSchema,
  knowledgeRelationIdSchema,
  knowledgeRelationSchema,
  placementIdSchema,
  placementRecordSchema,
} from "../../src/shared/knowledgeSchemas"

describe("Knowledge UI Views", () => {
  const mockNode1 = knowledgeNodeSchema.parse({
    id: knowledgeNodeIdSchema.parse("11111111-1111-4111-8111-111111111111"),
    kind: "concept",
    title: "FlashAttention",
    body: "Fast and memory-efficient exact attention with IO-awareness.",
    aliases: ["IO-aware Attention"],
    metadata: { evaluation_conditions: "A100 GPU, sequence length 2k-64k" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const mockNode2 = knowledgeNodeSchema.parse({
    id: knowledgeNodeIdSchema.parse("22222222-2222-4222-8222-222222222222"),
    kind: "claim",
    title: "Sub-quadratic memory IO",
    body: "Reduces memory accesses between GPU SRAM and HBM.",
    aliases: [],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const mockNote = knowledgeNodeSchema.parse({
    id: knowledgeNodeIdSchema.parse("99999999-9999-4999-8999-999999999999"),
    kind: "note",
    title: "Research note",
    body: "Initial note body",
    aliases: [],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const mockRelation = knowledgeRelationSchema.parse({
    id: knowledgeRelationIdSchema.parse("33333333-3333-4333-8333-333333333333"),
    sourceId: mockNode1.id,
    targetId: mockNode2.id,
    predicate: "supported_by",
    provenance: { source: "user", model: null, extractorVersion: null },
    evidenceIds: [],
    reviewState: "accepted",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const mockBoard = boardRecordSchema.parse({
    id: boardIdSchema.parse("44444444-4444-4444-8444-444444444444"),
    title: "Attention Exploration",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const mockPlacement = placementRecordSchema.parse({
    id: placementIdSchema.parse("55555555-5555-4555-8555-555555555555"),
    boardId: mockBoard.id,
    nodeId: mockNode1.id,
    cardId: null,
    x: 100,
    y: 100,
    width: 300,
    height: null,
    minimized: false,
    zIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const mockOps: KnowledgeClientOps = {
    findNodes: vi.fn(async () => [mockNode1, mockNode2]),
    getNode: vi.fn(async (id) => {
      if (id === mockNode1.id) return mockNode1
      if (id === mockNote.id) return mockNote
      return mockNode2
    }),
    createNode: vi.fn(async (input) => ({
      ...mockNode1,
      id: knowledgeNodeIdSchema.parse("66666666-6666-4666-8666-666666666666"),
      ...input,
      aliases: [...(input.aliases ?? [])],
      metadata: {},
    })),
    updateNode: vi.fn(async (input) => ({ ...mockNode1, ...input })),
    deleteNode: vi.fn(async () => true),
    findRelations: vi.fn(async () => [mockRelation]),
    createRelation: vi.fn(async (input) => ({
      ...mockRelation,
      ...input,
      id: knowledgeRelationIdSchema.parse("77777777-7777-4777-8777-777777777777"),
      evidenceIds: [],
      reviewState: input.reviewState ?? "proposed",
    })),
    updateRelation: vi.fn(async (input) => ({ ...mockRelation, ...input })),
    getBacklinks: vi.fn(async () => [
      { relation: mockRelation, sourceNode: mockNode1, evidenceAnchors: [] },
    ]),
    getNeighbourGraph: vi.fn(async () => ({
      rootNode: mockNode1,
      depth: 1,
      nodes: [mockNode1, mockNode2],
      relations: [mockRelation],
      evidenceAnchors: [],
      truncated: false,
    })),
    getEvidenceAnchor: vi.fn(async () => null),
    getEvidenceNavigation: vi.fn(async () => null),
    getDocVersionsByHash: vi.fn(async () => []),
    getOrCreateDefaultBoard: vi.fn(async () => mockBoard),
    listBoards: vi.fn(async () => [mockBoard]),
    createBoard: vi.fn(async (title, description) => ({
      ...mockBoard,
      title,
      description: description ?? "",
    })),
    findPlacementsForBoard: vi.fn(async () => [mockPlacement]),
    createPlacement: vi.fn(async (input) => ({
      ...mockPlacement,
      ...input,
      id: placementIdSchema.parse("88888888-8888-4888-8888-888888888888"),
      cardId: null,
      height: null,
      minimized: false,
      zIndex: 0,
    })),
    updatePlacement: vi.fn(async (input) => ({ ...mockPlacement, ...input })),
    deletePlacement: vi.fn(async () => true),
  }

  it("renders KnowledgeView, lists nodes, and selects a node", async () => {
    render(<KnowledgeView clientOps={mockOps} />)
    await waitFor(() => {
      expect(screen.getAllByText("FlashAttention").length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getByText("FlashAttention"))
    await waitFor(() => {
      expect(
        screen.getByText("Fast and memory-efficient exact attention with IO-awareness."),
      ).toBeInTheDocument()
    })

    // Create node
    fireEvent.click(screen.getByRole("button", { name: "생성" }))
    expect(mockOps.createNode).toHaveBeenCalled()

    // Edit node
    fireEvent.click(screen.getByRole("button", { name: "편집" }))
    fireEvent.change(screen.getByLabelText("제목 수정"), { target: { value: "FlashAttention-2" } })
    fireEvent.click(screen.getByRole("button", { name: "저장" }))
    expect(mockOps.updateNode).toHaveBeenCalled()

    // Filter by kind
    fireEvent.change(screen.getByRole("combobox", { name: "지식 종류 필터" }), {
      target: { value: "claim" },
    })
    expect(mockOps.findNodes).toHaveBeenCalled()

    // Search query
    fireEvent.change(screen.getByLabelText("지식 검색"), { target: { value: "Flash" } })
    expect(mockOps.findNodes).toHaveBeenCalled()
  })

  it("renders detail with backlinks and review acceptance", async () => {
    render(<KnowledgeView clientOps={mockOps} initialNodeId={mockNode1.id} />)
    await waitFor(() => {
      expect(screen.getAllByText("FlashAttention").length).toBeGreaterThan(0)
    })
  })

  it("keeps a pending relation target when relation creation fails", async () => {
    // Given
    const failingOps: KnowledgeClientOps = {
      ...mockOps,
      createRelation: vi.fn(async () => {
        throw new Error("관계를 저장하지 못했습니다.")
      }),
    }
    render(<KnowledgeView clientOps={failingOps} initialNodeId={mockNode1.id} />)
    const target = await screen.findByRole("combobox", { name: "대상 노드 선택" })

    // When
    fireEvent.change(target, { target: { value: mockNode2.id } })
    fireEvent.click(screen.getByRole("button", { name: "연결 추가" }))

    // Then
    await waitFor(() => expect(target).toHaveValue(mockNode2.id))
  })

  it("keeps a dirty note editor mounted when editing state changes", async () => {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    })
    Object.defineProperty(window, "scourgify", {
      configurable: true,
      value: { localInference: null },
    })
    render(<KnowledgeView clientOps={mockOps} initialNodeId={mockNote.id} />)
    const body = await screen.findByRole("textbox", { name: "본문 내용 수정" })
    const editor = body.closest(".cm-editor")
    fireEvent.input(body, { target: { textContent: "Initial note body\nnew evidence" } })
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "본문 내용 수정" })).toBeInTheDocument()
      expect(editor).not.toBeNull()
      expect(editor?.isConnected).toBe(true)
    })
  })

  it("preserves a dirty note when creating another knowledge item", async () => {
    const createNode = vi.fn(mockOps.createNode)
    render(<KnowledgeView clientOps={{ ...mockOps, createNode }} initialNodeId={mockNote.id} />)
    const title = await screen.findByRole("textbox", { name: "제목 수정" })
    fireEvent.change(title, { target: { value: "Unsaved research note" } })
    fireEvent.click(screen.getByRole("button", { name: "생성" }))
    await waitFor(() =>
      expect(
        screen.getByText("현재 노트를 먼저 저장한 후 새 항목을 만들 수 있습니다."),
      ).toBeVisible(),
    )
    expect(createNode).not.toHaveBeenCalled()
    expect(title).toHaveValue("Unsaved research note")
    expect(title.isConnected).toBe(true)
  })

  it("renders NeighbourGraphView with bounded connections and filter tags", async () => {
    render(<NeighbourGraphView clientOps={mockOps} activeNodeId={mockNode1.id} />)
    await waitFor(() => {
      expect(screen.getByText("연결")).toBeInTheDocument()
      expect(screen.getByText("FlashAttention")).toBeInTheDocument()
      expect(screen.getAllByText("Sub-quadratic memory IO").length).toBeGreaterThan(0)
      expect(screen.getAllByText("검토됨").length).toBeGreaterThan(0)
      expect(screen.queryByText("supported_by")).not.toBeInTheDocument()
    })
  })

  it("keeps graph selection local until the explicit detail action opens knowledge", async () => {
    const onNodeClick = vi.fn()
    render(
      <NeighbourGraphView
        clientOps={mockOps}
        activeNodeId={mockNode1.id}
        onNodeClick={onNodeClick}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "이웃 관계 시각화" })).toBeVisible(),
    )

    const neighbour = screen.getAllByRole("button", { name: "Sub-quadratic memory IO" })
    const firstNeighbour = neighbour.at(0)
    if (!firstNeighbour) throw new Error("graph fixture should render a neighbour node")
    fireEvent.click(firstNeighbour)
    expect(onNodeClick).not.toHaveBeenCalled()
    expect(screen.getByText("선택 · Sub-quadratic memory IO")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "지식에서 열기" }))
    expect(onNodeClick).toHaveBeenCalledWith(mockNode2.id)
    fireEvent.click(screen.getByRole("button", { name: "연결 목록 접기" }))
    expect(screen.getByRole("button", { name: "연결 목록 펼치기" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "선택한 항목 상세" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "연결 목록 펼치기" }))
    expect(screen.getByRole("button", { name: "연결 목록 접기" })).toBeInTheDocument()
    const canvas = screen
      .getByRole("region", { name: "이웃 관계 시각화" })
      .querySelector<HTMLElement>(".neighbour-graph-canvas")
    if (!canvas) throw new Error("graph fixture should render a canvas")
    fireEvent.click(screen.getByRole("button", { name: "그래프 확대" }))
    expect(canvas.style.transform).toContain("scale(1.15)")
    fireEvent.click(screen.getByRole("button", { name: "목록 보기" }))
    expect(screen.queryByRole("region", { name: "이웃 관계 시각화" })).not.toBeInTheDocument()
  })

  it("renders CompareView with an explicit empty selection state", async () => {
    render(<CompareView clientOps={mockOps} />)
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "연구 조건 비교" })).toBeInTheDocument()
      expect(screen.getByText(/비교할 주장이나 논문을 선택하세요/)).toBeInTheDocument()
    })
  })

  it("compares selected records and keeps missing conditions explicit", async () => {
    render(<CompareView clientOps={mockOps} />)
    const picker = await screen.findByRole("combobox", { name: "비교할 노드 추가" })
    fireEvent.change(picker, { target: { value: mockNode1.id } })
    await waitFor(() => {
      expect(screen.getAllByText("FlashAttention").length).toBeGreaterThan(0)
      expect(screen.getAllByText("확인되지 않음").length).toBeGreaterThan(0)
    })
  })

  it("refreshes available comparison records when returning to the visible view", async () => {
    const findNodes = vi.fn(async () => [mockNode1])
    const clientOps = { ...mockOps, findNodes }
    const view = render(<CompareView clientOps={clientOps} isVisible />)
    const picker = await screen.findByRole("combobox", { name: "비교할 노드 추가" })
    expect(
      screen.queryByRole("option", { name: /Sub-quadratic memory IO/ }),
    ).not.toBeInTheDocument()
    findNodes.mockResolvedValue([mockNode1, mockNode2])
    view.rerender(<CompareView clientOps={clientOps} isVisible={false} />)
    view.rerender(<CompareView clientOps={clientOps} isVisible />)
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Sub-quadratic memory IO/ })).toBeInTheDocument(),
    )
    expect(picker).toBeInTheDocument()
  })

  it("renders ProjectBoardView with placed nodes", async () => {
    render(<ProjectBoardView clientOps={mockOps} />)
    await waitFor(() => {
      expect(screen.getByText("프로젝트")).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "Attention Exploration" })).toBeInTheDocument()
      expect(screen.getByText("FlashAttention")).toBeInTheDocument()
    })
  })

  it("removes a board placement while keeping the shared node available", async () => {
    render(<ProjectBoardView clientOps={mockOps} />)
    const remove = await screen.findByRole("button", { name: "FlashAttention 배치 제거" })
    fireEvent.click(remove)
    await waitFor(() => {
      expect(mockOps.deletePlacement).toHaveBeenCalledWith(mockPlacement.id)
      expect(screen.getByRole("option", { name: /FlashAttention/ })).toBeInTheDocument()
    })
  })

  it("clears the old placement detail when creating a board", async () => {
    const created = boardRecordSchema.parse({
      ...mockBoard,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "New board",
    })
    const deletePlacement = vi.fn(mockOps.deletePlacement)
    render(
      <ProjectBoardView
        clientOps={{ ...mockOps, createBoard: vi.fn(async () => created), deletePlacement }}
      />,
    )
    fireEvent.click(await screen.findByRole("button", { name: "FlashAttention" }))
    expect(screen.getByRole("button", { name: "보드에서 제거" })).toBeVisible()
    fireEvent.change(screen.getByRole("textbox", { name: "새 프로젝트 이름" }), {
      target: { value: "New board" },
    })
    fireEvent.click(screen.getByRole("button", { name: "만들기" }))
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "보드에서 제거" })).not.toBeInTheDocument(),
    )
    expect(deletePlacement).not.toHaveBeenCalled()
  })

  it("ignores a delayed old-board placement response after switching boards", async () => {
    const boardB = boardRecordSchema.parse({
      ...mockBoard,
      id: boardIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      title: "Verification Board",
    })
    let releaseBoardB: ((placements: readonly (typeof mockPlacement)[]) => void) | undefined
    const delayedBoardB = new Promise<readonly (typeof mockPlacement)[]>((resolve) => {
      releaseBoardB = resolve
    })
    vi.mocked(mockOps.listBoards).mockResolvedValue([mockBoard, boardB])
    vi.mocked(mockOps.findPlacementsForBoard).mockImplementation((id) =>
      id === boardB.id ? delayedBoardB : Promise.resolve([mockPlacement]),
    )
    vi.mocked(mockOps.deletePlacement).mockClear()

    render(<ProjectBoardView clientOps={mockOps} />)
    const boardPicker = await screen.findByRole("combobox", { name: "프로젝트 보드 선택" })
    await screen.findByRole("button", { name: "FlashAttention 배치 제거" })
    fireEvent.change(boardPicker, { target: { value: boardB.id } })
    expect(
      screen.queryByRole("button", { name: "FlashAttention 배치 제거" }),
    ).not.toBeInTheDocument()
    expect(mockOps.deletePlacement).not.toHaveBeenCalled()
    fireEvent.change(boardPicker, { target: { value: mockBoard.id } })
    await waitFor(() => expect(screen.getByText("FlashAttention")).toBeInTheDocument())
    releaseBoardB?.([])
    await waitFor(() => {
      expect(screen.getByText("FlashAttention")).toBeInTheDocument()
      expect(screen.queryByText("Sub-quadratic memory IO")).not.toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "FlashAttention 배치 제거" }))
    expect(mockOps.deletePlacement).toHaveBeenCalledWith(mockPlacement.id)
  })

  it("refreshes the selected board when returning to the visible view", async () => {
    const boardB = boardRecordSchema.parse({
      ...mockBoard,
      id: boardIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      title: "Return Board",
    })
    const placementB = placementRecordSchema.parse({
      ...mockPlacement,
      id: placementIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
      boardId: boardB.id,
      nodeId: mockNode2.id,
    })
    const listBoards = vi.fn(async () => [mockBoard, boardB])
    const findPlacementsForBoard = vi.fn(async (id: typeof mockBoard.id) =>
      id === boardB.id ? [placementB] : [mockPlacement],
    )
    const view = render(
      <ProjectBoardView clientOps={{ ...mockOps, listBoards, findPlacementsForBoard }} isVisible />,
    )
    const boardPicker = await screen.findByRole("combobox", { name: "프로젝트 보드 선택" })
    fireEvent.change(boardPicker, { target: { value: boardB.id } })
    await waitFor(() => expect(screen.getByText("Sub-quadratic memory IO")).toBeInTheDocument())
    view.rerender(
      <ProjectBoardView
        clientOps={{ ...mockOps, listBoards, findPlacementsForBoard }}
        isVisible={false}
      />,
    )
    view.rerender(
      <ProjectBoardView clientOps={{ ...mockOps, listBoards, findPlacementsForBoard }} isVisible />,
    )
    await waitFor(() => {
      expect(boardPicker).toHaveValue(boardB.id)
      expect(screen.getAllByText("Sub-quadratic memory IO").length).toBeGreaterThan(0)
    })
    expect(findPlacementsForBoard).toHaveBeenCalledWith(boardB.id)
  })

  it("renders knowledge link labels without exposing stored ids in board previews", () => {
    render(
      <ProjectBoardCard
        node={{
          ...mockNode1,
          body: "See [[11111111-1111-4111-8111-111111111111|the verified passage]].",
        }}
        placement={mockPlacement}
        onRemove={() => {}}
        onSelect={() => {}}
        onNodeClick={() => {}}
        onPointerDown={() => {}}
        onPointerMove={() => {}}
        onPointerUp={() => {}}
        onKeyboardMove={() => {}}
      />,
    )
    expect(screen.getByText(/the verified passage/)).toBeInTheDocument()
    expect(screen.queryByText("11111111-1111-4111-8111-111111111111")).not.toBeInTheDocument()
  })
})
