import { Editor } from "@tiptap/core"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EvidenceNode } from "../../src/renderer/components/readerNote/evidenceNode"
import {
  appendCardToEditor,
  liveNoteAppender,
} from "../../src/renderer/components/readerNote/liveNoteAppend"
import {
  appendNoteCard,
  isNoteCardShortcut,
  type NoteCardTarget,
  noteCardMarkdown,
  noteCardNoteId,
  noteCardTarget,
} from "../../src/renderer/lib/noteCard"
import { LOOSE_NOTE_ID, READER_NOTE_MAX_CHARACTERS } from "../../src/shared/readerNote"
import { documentIdSchema } from "../../src/shared/schemas"

const documentId = documentIdSchema.parse("aabbccddeeff0011")
const onPage4: NoteCardTarget = { kind: "paper", documentId, title: "Paper", page: 4 }

const editors: Editor[] = []
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.replaceChildren()
})

function noteEditor(markdown: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, EvidenceNode],
    content: markdown,
    contentType: "markdown",
  })
  editors.push(editor)
  return editor
}

function key(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, ...init })
  Object.defineProperty(event, "target", { value: target })
  return event
}

describe("note cards", () => {
  it("aims at the paper on screen at its page, or at the loose note", () => {
    expect(noteCardTarget({ id: documentId, title: "Paper" }, 4)).toEqual(onPage4)
    expect(noteCardTarget(null, 4)).toEqual({ kind: "loose" })
    expect(noteCardNoteId(onPage4)).toBe(documentId)
    expect(noteCardNoteId({ kind: "loose" })).toBe(LOOSE_NOTE_ID)
  })

  it("starts a paper's card with a page chip, inline before prose and apart from blocks", () => {
    expect(noteCardMarkdown("  어텐션은 모든 토큰을 본다.\r\n", onPage4)).toBe(
      "[[p.4]] 어텐션은 모든 토큰을 본다.",
    )
    expect(noteCardMarkdown("- 하나\n- 둘", onPage4)).toBe("[[p.4]]\n\n- 하나\n- 둘")
    expect(noteCardMarkdown("## 질문", onPage4)).toBe("[[p.4]]\n\n## 질문")
    expect(noteCardMarkdown("생각 하나", { kind: "loose" })).toBe("생각 하나")
  })

  it("sets each card apart from what the note already holds", () => {
    expect(appendNoteCard("", "[[p.4]] 첫 카드")).toBe("[[p.4]] 첫 카드\n")
    expect(appendNoteCard("# 내 노트\n\n앞의 생각\n\n", "[[p.6]] 다음 카드")).toBe(
      "# 내 노트\n\n앞의 생각\n\n---\n\n[[p.6]] 다음 카드\n",
    )
    expect(appendNoteCard("x".repeat(READER_NOTE_MAX_CHARACTERS - 4), "카드")).toBeNull()
  })

  it("opens on N where nothing is being typed and on ⌥N everywhere", () => {
    const input = document.createElement("textarea")
    document.body.append(input)

    expect(isNoteCardShortcut(key({ key: "n", code: "KeyN" }))).toBe(true)
    // A Korean keyboard layout reports the jamo, but the key is the same.
    expect(isNoteCardShortcut(key({ key: "ㅜ", code: "KeyN" }))).toBe(true)
    expect(isNoteCardShortcut(key({ key: "n", code: "KeyN" }, input))).toBe(false)
    expect(isNoteCardShortcut(key({ key: "Dead", code: "KeyN", altKey: true }, input))).toBe(true)
    expect(isNoteCardShortcut(key({ key: "n", code: "KeyN", metaKey: true }))).toBe(false)
    expect(isNoteCardShortcut(key({ key: "n", code: "KeyN", repeat: true }))).toBe(false)
    expect(isNoteCardShortcut(key({ key: "m", code: "KeyM" }))).toBe(false)
  })

  it("keeps a page chip as a page link with no quote", () => {
    const editor = noteEditor("[[p.4]] 어텐션은 모든 토큰을 본다.")

    const chip = editor.getJSON().content?.[0]?.content?.[0]
    expect(chip).toMatchObject({ type: "evidence", attrs: { page: 4, quote: "" } })
    expect(editor.getMarkdown()).toBe("[[p.4]] 어텐션은 모든 토큰을 본다.")
  })

  it("adds a card through an open editor so its own save carries the card", () => {
    const editor = noteEditor("앞의 생각")

    expect(appendCardToEditor(editor, "[[p.6]] 다음 카드")).toBe(true)
    expect(editor.getMarkdown()).toBe("앞의 생각\n\n---\n\n[[p.6]] 다음 카드")

    const empty = noteEditor("")
    expect(appendCardToEditor(empty, "첫 카드")).toBe(true)
    expect(empty.getMarkdown()).toBe("첫 카드")
  })

  it("saves the note as soon as a card is in, without waiting for typing to pause", () => {
    const save = vi.fn()
    const append = liveNoteAppender(noteEditor("앞의 생각"), save)

    expect(append("[[p.6]] 다음 카드")).toBe(true)
    expect(save).toHaveBeenCalledWith("앞의 생각\n\n---\n\n[[p.6]] 다음 카드")
  })
})
