import { Editor } from "@tiptap/core"
import { Markdown } from "@tiptap/markdown"
import type { Transaction } from "@tiptap/pm/state"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { MathNode } from "../../src/renderer/components/readerNote/mathNode"

const editors: Editor[] = []
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

function noteEditor(markdown: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, MathNode],
    content: markdown,
    contentType: "markdown",
  })
  editors.push(editor)
  return editor
}

function typeText(editor: Editor, text: string): void {
  const { view } = editor
  for (const character of text) {
    const { from, to } = view.state.selection
    const insert = (): Transaction => view.state.tr.insertText(character, from, to)
    const handled = view.someProp("handleTextInput", (f) => f(view, from, to, character, insert))
    if (!handled) view.dispatch(insert())
  }
}

describe("note math", () => {
  it("shows a formula written as $…$ typeset, and saves it back as the same text", () => {
    const markdown = "수식: $TP/(TP+FN)$ 의미: 실제 양성 중 양성으로 맞힌 비율"
    const editor = noteEditor(markdown)

    const html = editor.getHTML()
    expect(html).toContain('data-latex="TP/(TP+FN)"')
    expect(editor.getMarkdown().trim()).toBe(markdown)
    expect(editor.getText()).toContain("$TP/(TP+FN)$")
  })

  it("keeps $$…$$ as a display formula", () => {
    const editor = noteEditor("$$\\sum_i x_i$$")
    expect(editor.getHTML()).toContain('data-display="true"')
    expect(editor.getMarkdown().trim()).toBe("$$\\sum_i x_i$$")
  })

  it("leaves prices alone", () => {
    const editor = noteEditor("costs $5 and $10 each")
    expect(editor.getHTML()).not.toContain("data-math")
    expect(editor.getMarkdown().trim()).toBe("costs $5 and $10 each")
  })

  it("turns the text into a formula when the closing $ is typed", () => {
    const editor = noteEditor("recall = ")
    editor.commands.focus("end")
    typeText(editor, "$TP/(TP+FN)$")
    expect(editor.getHTML()).toContain('data-latex="TP/(TP+FN)"')
    expect(editor.getMarkdown().trim()).toBe("recall = $TP/(TP+FN)$")
  })
})
