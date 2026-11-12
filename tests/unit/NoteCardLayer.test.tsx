import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Editor } from "@tiptap/core"
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

/** The card's text box: a live Markdown editor, written through Tiptap as jsdom cannot type into it. */
function cardInput(): HTMLElement {
  return screen.getByRole("textbox", { name: "노트 카드 내용" })
}

function editorOf(element: HTMLElement): Editor {
  const editor: unknown = Reflect.get(element, "editor")
  if (!editor) throw new Error("note card editor must be mounted")
  return editor as Editor
}

function write(text: string): void {
  act(() => {
    editorOf(cardInput()).commands.insertContent(text)
  })
}

function submit(): void {
  fireEvent.keyDown(cardInput(), { key: "Enter", metaKey: true })
}

function Harness({
  target,
  onAppend,
  onOpenNote = vi.fn(),
  onMemo = vi.fn(),
}: {
  readonly target: NoteCardTarget
  readonly onAppend: (noteId: DocumentId, card: string) => boolean
  readonly onOpenNote?: (target: NoteCardTarget) => void
  readonly onMemo?: Parameters<typeof useNoteCard>[2]
}) {
  const state = useNoteCard(target, onAppend, onMemo)
  return (
    <>
      <input aria-label="검색" />
      <NoteCardLayer state={state} onOpenNote={onOpenNote} />
    </>
  )
}

describe("note card", () => {
  it("opens for the loose note, shows Markdown as written, and keeps it when closed", async () => {
    const onAppend = vi.fn(() => true)
    const onOpenNote = vi.fn()
    render(<Harness target={{ kind: "loose" }} onAppend={onAppend} onOpenNote={onOpenNote} />)

    await userEvent.keyboard("n")
    // No second click to put it down: the card is there and ready to write in.
    const card = screen.getByRole("region", { name: "노트 카드" })
    expect(card).toHaveTextContent("모아 둔 노트")
    await waitFor(() => expect(cardInput()).toHaveFocus())

    act(() => {
      editorOf(cardInput()).commands.insertContent("**어텐션**은 모든 토큰을 본다", {
        contentType: "markdown",
      })
    })
    expect(screen.getByText("어텐션").tagName).toBe("STRONG")
    await userEvent.click(screen.getByRole("button", { name: "닫기" }))

    expect(onAppend).toHaveBeenCalledWith(LOOSE_NOTE_ID, "**어텐션**은 모든 토큰을 본다")
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("모아 둔 노트에 붙였어요")
    await userEvent.click(screen.getByRole("button", { name: "열기" }))
    expect(onOpenNote).toHaveBeenCalledWith({ kind: "loose" })
  })

  it("keeps what was written on Esc and on ⌘↵ alike", () => {
    const onAppend = vi.fn(() => true)
    render(<Harness target={{ kind: "loose" }} onAppend={onAppend} />)

    fireEvent.keyDown(window, { key: "n", code: "KeyN" })
    write("첫 생각")
    fireEvent.keyDown(cardInput(), { key: "Escape" })
    expect(onAppend).toHaveBeenLastCalledWith(LOOSE_NOTE_ID, "첫 생각")

    fireEvent.keyDown(window, { key: "n", code: "KeyN" })
    expect(cardInput()).toHaveTextContent("")
    write("둘째 생각")
    submit()
    expect(onAppend).toHaveBeenLastCalledWith(LOOSE_NOTE_ID, "둘째 생각")
  })

  it("closes an empty card without adding anything", async () => {
    const onAppend = vi.fn(() => true)
    render(<Harness target={{ kind: "loose" }} onAppend={onAppend} />)

    await userEvent.keyboard("n")
    fireEvent.keyDown(cardInput(), { key: "Escape" })

    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()
    expect(onAppend).not.toHaveBeenCalled()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("puts a memo on the board at the pointer when N is pressed over a paper", () => {
    const viewport = document.createElement("div")
    const world = document.createElement("div")
    world.className = "board-world"
    viewport.append(world)
    document.body.append(viewport)
    const onMemo = vi.fn()
    render(<Harness target={onPage4} onAppend={vi.fn(() => true)} onMemo={onMemo} />)

    fireEvent.keyDown(window, { key: "n", code: "KeyN" })

    expect(onMemo).toHaveBeenCalledWith(onPage4, { x: 0, y: 0 })
    // The memo is the board's own; no floating card opens beside it.
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()
    viewport.remove()
  })

  it("leaves typing alone on N, opens on ⌥N, and minimizes", async () => {
    render(<Harness target={{ kind: "loose" }} onAppend={vi.fn(() => true)} />)
    const search = screen.getByRole("textbox", { name: "검색" })

    await userEvent.click(search)
    await userEvent.keyboard("n")
    expect(search).toHaveValue("n")
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()

    await userEvent.keyboard("{Alt>}n{/Alt}")
    const card = screen.getByRole("region", { name: "노트 카드" })
    await waitFor(() => expect(cardInput()).toHaveFocus())

    await userEvent.click(screen.getByRole("button", { name: "노트 카드 최소화" }))
    expect(card).toHaveAttribute("data-minimized", "true")
    await userEvent.click(screen.getByRole("button", { name: "노트 카드 펼치기" }))
    expect(card).toHaveAttribute("data-minimized", "false")
  })

  it("keeps the card open with its text when the note is full, and lets a second close go", () => {
    render(<Harness target={{ kind: "loose" }} onAppend={vi.fn(() => false)} />)

    fireEvent.keyDown(window, { key: "n", code: "KeyN" })
    write("한 줄 더")
    submit()

    expect(screen.getByRole("alert")).toHaveTextContent("노트가 가득 차서 더 붙일 수 없습니다")
    expect(cardInput()).toHaveTextContent("한 줄 더")

    submit()
    expect(screen.queryByRole("region", { name: "노트 카드" })).not.toBeInTheDocument()
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
