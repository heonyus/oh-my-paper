import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NoteCardLayer } from "../../src/renderer/components/noteCard/NoteCardLayer"
import type { NoteCardTarget } from "../../src/renderer/lib/noteCard"
import { useNoteCard } from "../../src/renderer/lib/useNoteCard"
import { useReaderNote } from "../../src/renderer/lib/useReaderNote"
import type { WorkspaceUpdate } from "../../src/renderer/lib/useWorkspaceHistory"
import { LOOSE_NOTE_ID } from "../../src/shared/readerNote"
import {
  type DocumentId,
  documentIdSchema,
  type Workspace,
  workspaceSchema,
} from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("aabbccddeeff0011")
const onPage4: NoteCardTarget = { kind: "paper", documentId, title: "Attention Paper", page: 4 }

beforeEach(() => {
  const stored = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function Harness({
  target,
  onAppend,
  onOpenNote = vi.fn(),
}: {
  readonly target: NoteCardTarget
  readonly onAppend: (noteId: DocumentId, card: string) => boolean
  readonly onOpenNote?: (target: NoteCardTarget) => void
}) {
  const state = useNoteCard(target, onAppend)
  return (
    <>
      <input aria-label="검색" />
      <NoteCardLayer state={state} onOpenNote={onOpenNote} />
    </>
  )
}

describe("note card", () => {
  it("opens with N over the paper in view and adds the card to that page's note", async () => {
    const onAppend = vi.fn(() => true)
    const onOpenNote = vi.fn()
    render(<Harness target={onPage4} onAppend={onAppend} onOpenNote={onOpenNote} />)

    await userEvent.keyboard("n")
    const card = screen.getByRole("region", { name: "노트 카드" })
    expect(card).toHaveTextContent("4쪽 · Attention Paper")
    const input = screen.getByRole("textbox", { name: "노트 카드 내용" })
    expect(input).toHaveFocus()
    expect(input).toHaveValue("")

    await userEvent.type(input, "어텐션은 모든 토큰을 본다")
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")

    expect(onAppend).toHaveBeenCalledWith(documentId, "[[p.4]] 어텐션은 모든 토큰을 본다")
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("4쪽 노트에 붙였어요")
    await userEvent.click(screen.getByRole("button", { name: "열기" }))
    expect(onOpenNote).toHaveBeenCalledWith(onPage4)
  })

  it("leaves typing alone on N, opens on ⌥N, and keeps the draft when closed", async () => {
    render(<Harness target={{ kind: "loose" }} onAppend={vi.fn(() => true)} />)
    const search = screen.getByRole("textbox", { name: "검색" })

    await userEvent.click(search)
    await userEvent.keyboard("n")
    expect(search).toHaveValue("n")
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()

    await userEvent.keyboard("{Alt>}n{/Alt}")
    expect(screen.getByRole("region", { name: "노트 카드" })).toHaveTextContent("모아 둔 노트")
    await userEvent.keyboard("떠오른 생각{Escape}")
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()
    expect(search).toHaveFocus()

    await userEvent.keyboard("{Alt>}n{/Alt}")
    expect(screen.getByRole("textbox", { name: "노트 카드 내용" })).toHaveValue("떠오른 생각")
    await userEvent.keyboard(" 이어서")
    expect(screen.getByRole("textbox", { name: "노트 카드 내용" })).toHaveValue(
      "떠오른 생각 이어서",
    )
  })

  it("keeps the card open with its text when the note is full", async () => {
    render(<Harness target={onPage4} onAppend={vi.fn(() => false)} />)

    await userEvent.keyboard("n")
    await userEvent.keyboard("한 줄 더")
    await userEvent.click(screen.getByRole("button", { name: "노트에 붙이기" }))

    expect(screen.getByRole("alert")).toHaveTextContent("노트가 가득 차서 더 붙일 수 없습니다")
    expect(screen.getByRole("textbox", { name: "노트 카드 내용" })).toHaveValue("한 줄 더")
  })
})

describe("adding a card to a note", () => {
  const initial: Workspace = workspaceSchema.parse({
    documents: [],
    cards: [],
    sidebarOpen: true,
    viewport: { x: 0, y: 0, zoom: 1 },
    activeDocumentId: null,
    readerNotes: [{ documentId, markdown: "앞의 생각", updatedAt: "2026-10-01T00:00:00.000Z" }],
  })

  function useNotes() {
    const [workspace, setState] = useState<Workspace | null>(initial)
    const setWorkspace = useCallback((update: WorkspaceUpdate) => {
      setState((current) => (typeof update === "function" ? update(current) : update))
    }, [])
    return { workspace, ...useReaderNote(workspace, documentId, setWorkspace) }
  }

  it("appends to the stored note when no editor has it open", () => {
    const { result } = renderHook(useNotes)

    act(() => {
      expect(result.current.appendToNote(documentId, "[[p.2]] 카드")).toBe(true)
      expect(result.current.appendToNote(LOOSE_NOTE_ID, "어디서든 쓴 카드")).toBe(true)
    })

    const notes = result.current.workspace?.readerNotes ?? []
    expect(notes.find((note) => note.documentId === documentId)?.markdown).toBe(
      "앞의 생각\n\n---\n\n[[p.2]] 카드\n",
    )
    expect(notes.find((note) => note.documentId === LOOSE_NOTE_ID)?.markdown).toBe(
      "어디서든 쓴 카드\n",
    )
  })

  it("hands the card to the open editor instead, so the editor never overwrites it", () => {
    const { result } = renderHook(useNotes)
    const live = vi.fn(() => true)
    let unregister: () => void = () => undefined
    act(() => {
      unregister = result.current.registerLiveNote(documentId, live)
    })

    act(() => {
      result.current.appendToNote(documentId, "[[p.2]] 카드")
    })
    expect(live).toHaveBeenCalledWith("[[p.2]] 카드")
    expect(result.current.note?.markdown).toBe("앞의 생각")

    act(() => {
      unregister()
      result.current.appendToNote(documentId, "[[p.3]] 닫힌 뒤")
    })
    expect(live).toHaveBeenCalledTimes(1)
    expect(result.current.note?.markdown).toBe("앞의 생각\n\n---\n\n[[p.3]] 닫힌 뒤\n")
  })
})
