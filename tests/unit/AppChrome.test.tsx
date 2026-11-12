import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Topbar } from "../../src/renderer/components/AppChrome"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

function paper(id: string, title: string) {
  return documentRecordSchema.parse({
    id,
    name: `${title}.pdf`,
    hash: id.padEnd(64, "0"),
    bytes: 1024,
    importedAt: "2026-08-27T00:00:00.000Z",
    pageCount: 3,
    title,
    authors: [],
    year: null,
    doi: null,
    quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
  })
}

const toolbar = {
  viewport: { x: 0, y: 0, zoom: 1 },
  onViewportChange: vi.fn(),
  tool: "select" as const,
  onToolChange: vi.fn(),
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  outlineOpen: false,
  onToggleOutline: vi.fn(),
}

describe("reader tabs", () => {
  const attention = paper("aabbccddeeff0011", "Attention")
  const diffusion = paper("1122334455667788", "Diffusion")
  const graphs = paper("99aabbccddeeff00", "Graphs")
  const documents = [attention, diffusion, graphs]

  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it("keeps each opened paper as a tab and switches between them", async () => {
    const onDocumentChange = vi.fn()
    const { rerender } = render(
      <Topbar
        {...toolbar}
        documents={documents}
        activeDocumentId={attention.id}
        onDocumentChange={onDocumentChange}
      />,
    )
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Attention"])
    // One tab is the paper being read; it has nowhere to go, so it does not close.
    expect(screen.queryByRole("button", { name: "Attention 탭 닫기" })).not.toBeInTheDocument()

    // The plus lists every paper; choosing one opens it.
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "읽는 논문" }), "Diffusion")
    expect(onDocumentChange).toHaveBeenLastCalledWith(diffusion.id)
    rerender(
      <Topbar
        {...toolbar}
        documents={documents}
        activeDocumentId={diffusion.id}
        onDocumentChange={onDocumentChange}
      />,
    )

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Attention",
      "Diffusion",
    ])
    expect(screen.getByRole("tab", { name: "Diffusion" })).toHaveAttribute("aria-selected", "true")
    await userEvent.click(screen.getByRole("tab", { name: "Attention" }))
    expect(onDocumentChange).toHaveBeenLastCalledWith(attention.id)
  })

  it("moves to the neighbor when the tab being read is closed", async () => {
    window.sessionStorage.setItem(
      "ohmypaper.readerTabs",
      JSON.stringify([attention.id, diffusion.id, graphs.id]),
    )
    const onDocumentChange = vi.fn()
    render(
      <Topbar
        {...toolbar}
        documents={documents}
        activeDocumentId={diffusion.id}
        onDocumentChange={onDocumentChange}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "Attention 탭 닫기" }))
    expect(onDocumentChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Diffusion",
      "Graphs",
    ])

    await userEvent.click(screen.getByRole("button", { name: "Diffusion 탭 닫기" }))
    expect(onDocumentChange).toHaveBeenCalledWith(graphs.id)
  })

  it("remembers the row of tabs for this window", () => {
    window.sessionStorage.setItem(
      "ohmypaper.readerTabs",
      JSON.stringify([graphs.id, "gone-from-library", attention.id]),
    )
    render(
      <Topbar
        {...toolbar}
        documents={documents}
        activeDocumentId={attention.id}
        onDocumentChange={vi.fn()}
      />,
    )

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Graphs",
      "Attention",
    ])
    expect(window.sessionStorage.getItem("ohmypaper.readerTabs")).toBe(
      JSON.stringify([graphs.id, attention.id]),
    )
  })
})

describe("Topbar", () => {
  it("connects outline, tool, history, and zoom controls without search", async () => {
    const onToolChange = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onToggleOutline = vi.fn()
    const onViewportChange = vi.fn()
    render(
      <Topbar
        documents={[]}
        activeDocumentId={documentIdSchema.parse("aabbccddeeff0011")}
        onDocumentChange={vi.fn()}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        onViewportChange={onViewportChange}
        tool="select"
        onToolChange={onToolChange}
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
        outlineOpen={false}
        onToggleOutline={onToggleOutline}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "목차 열기" }))
    await userEvent.click(screen.getByRole("button", { name: "이동 도구" }))
    await userEvent.click(screen.getByRole("button", { name: "실행 취소" }))
    await userEvent.click(screen.getByRole("button", { name: "다시 실행" }))
    await userEvent.click(screen.getByRole("button", { name: "확대" }))

    expect(screen.getByRole("combobox", { name: "읽는 논문" })).toBeInTheDocument()
    expect(onToggleOutline).toHaveBeenCalledOnce()
    expect(onToolChange).toHaveBeenCalledWith("pan")
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onRedo).toHaveBeenCalledOnce()
    expect(onViewportChange).toHaveBeenCalledWith({ x: 0, y: 0, zoom: 1.1 })
    expect(screen.queryByRole("button", { name: "검색" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "포스트잇 도구" })).not.toBeInTheDocument()
  })

  it("keeps the visible board center fixed during toolbar zoom", async () => {
    const board = document.createElement("div")
    board.className = "board-viewport"
    Object.defineProperties(board, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 700 },
    })
    document.body.append(board)
    const onViewportChange = vi.fn()
    render(
      <Topbar
        documents={[]}
        activeDocumentId={documentIdSchema.parse("aabbccddeeff0011")}
        onDocumentChange={vi.fn()}
        viewport={{ x: -200, y: -300, zoom: 1 }}
        onViewportChange={onViewportChange}
        tool="select"
        onToolChange={vi.fn()}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        outlineOpen={false}
        onToggleOutline={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "확대" }))

    const next = onViewportChange.mock.lastCall?.[0]
    expect(next?.x).toBeCloseTo(-270)
    expect(next?.y).toBeCloseTo(-365)
    expect(next?.zoom).toBe(1.1)
    board.remove()
  })
})
