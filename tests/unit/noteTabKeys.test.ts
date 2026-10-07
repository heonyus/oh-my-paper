import { Editor } from "@tiptap/core"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { noteMarkdown } from "../../src/renderer/components/readerNote/noteMarkdown"
import { NoteTabKeys } from "../../src/renderer/components/readerNote/noteTabKeys"

const editors: Editor[] = []
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

function noteEditor(markdown: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, NoteTabKeys],
    content: markdown,
    contentType: "markdown",
  })
  editors.push(editor)
  return editor
}

function press(editor: Editor, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  return Boolean(editor.view.someProp("handleKeyDown", (f) => f(editor.view, event)))
}

/** The editor's HTML without the empty paragraph the Markdown reader leaves after a list. */
function html(editor: Editor): string {
  return editor.getHTML().replace(/<p><\/p>$/u, "")
}

/** The position just after the text of the list item that starts with `text`. */
function endOfItem(editor: Editor, text: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isTextblock && node.textContent === text) found = pos + 1 + node.content.size
    return found < 0
  })
  return found
}

describe("note list Tab keys", () => {
  it("indents the first item under a hidden stand-in line, and ⇧Tab brings it back", () => {
    const editor = noteEditor("- one\n- two")
    editor.commands.setTextSelection(endOfItem(editor, "one"))

    expect(press(editor, "Tab")).toBe(true)
    expect(html(editor)).toBe(
      "<ul><li><p></p><ul><li><p>one</p></li></ul></li><li><p>two</p></li></ul>",
    )
    expect(editor.state.selection.$from.parent.textContent).toBe("one")
    expect(noteMarkdown(editor).trim()).toBe("- <!-- -->\n  - one\n- two")

    expect(press(editor, "Tab", { shiftKey: true })).toBe(true)
    expect(html(editor)).toBe("<ul><li><p>one</p></li><li><p>two</p></li></ul>")
    expect(editor.state.selection.$from.parent.textContent).toBe("one")
  })

  it("still tucks a later item under the one above it", () => {
    const editor = noteEditor("- one\n- two")
    editor.commands.setTextSelection(endOfItem(editor, "two"))
    expect(press(editor, "Tab")).toBe(true)
    expect(html(editor)).toBe("<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>")
  })

  it("Backspace at the start of an indented first item outdents it and drops the stand-in", () => {
    const editor = noteEditor("- <!-- -->\n  - one\n- two")
    editor.commands.setTextSelection(endOfItem(editor, "one") - 3)
    expect(editor.state.selection.$from.parentOffset).toBe(0)
    expect(press(editor, "Backspace")).toBe(true)
    expect(html(editor)).toBe("<ul><li><p>one</p></li><li><p>two</p></li></ul>")
  })

  it("keeps the stand-in when other items still hang under it", () => {
    const editor = noteEditor("- <!-- -->\n  - one\n  - two")
    editor.commands.setTextSelection(endOfItem(editor, "two"))
    press(editor, "Tab", { shiftKey: true })
    expect(html(editor)).toBe(
      "<ul><li><p></p><ul><li><p>one</p></li></ul></li><li><p>two</p></li></ul>",
    )
  })

  it("reads a saved stand-in back with its hidden line, and saves it the same way", async () => {
    const editor = noteEditor("- <!-- -->\n  - one\n- two")
    // The line comes back once the editor is up, which Tiptap signals a moment after creation.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(html(editor)).toBe(
      "<ul><li><p></p><ul><li><p>one</p></li></ul></li><li><p>two</p></li></ul>",
    )
    expect(editor.view.dom.querySelector("li.note-list-stub")).not.toBeNull()
    expect(noteMarkdown(editor).trim()).toBe("- <!-- -->\n  - one\n- two")
    const plain = noteEditor("- one")
    expect(plain.view.dom.querySelector("li.note-list-stub")).toBeNull()
  })

  it("keeps a stand-in nested under a line of text out of the heading syntax", async () => {
    const editor = noteEditor("- two\n- three")
    editor.commands.setTextSelection(endOfItem(editor, "three"))
    press(editor, "Tab")
    press(editor, "Tab")
    expect(html(editor)).toBe(
      "<ul><li><p>two</p><ul><li><p></p><ul><li><p>three</p></li></ul></li></ul></li></ul>",
    )
    const saved = noteMarkdown(editor).trim()
    expect(saved).toBe("- two\n  - <!-- -->\n    - three")

    const reopened = noteEditor(saved)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(html(reopened)).toBe(html(editor))
    expect(reopened.view.dom.querySelectorAll("li.note-list-stub")).toHaveLength(1)
    expect(noteMarkdown(reopened).trim()).toBe(saved)
  })
})
