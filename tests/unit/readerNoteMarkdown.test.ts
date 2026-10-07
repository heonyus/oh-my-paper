import { Editor } from "@tiptap/core"
import { Markdown } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { EvidenceNode, evidenceQuote } from "../../src/renderer/components/readerNote/evidenceNode"
import { ArrowInput } from "../../src/renderer/components/readerNote/marginSlots"
import { NoteImage } from "../../src/renderer/components/readerNote/noteImage"
import { noteQuoteContent } from "../../src/renderer/components/readerNote/noteQuote"

const editors: Editor[] = []
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

function noteEditor(markdown: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, EvidenceNode, ArrowInput, NoteImage],
    content: markdown,
    contentType: "markdown",
  })
  editors.push(editor)
  return editor
}

describe("reader note Markdown", () => {
  it("keeps an image as a path the note file can open, and shows it from the collection", () => {
    const asset = `${"a".repeat(64)}.png`
    const markdown = `생각\n\n![](../assets/${asset})\n\n다음 문단`
    const editor = noteEditor(markdown)

    expect(editor.getHTML()).toContain(`src="scourgify-asset://local/assets/${asset}"`)
    expect(editor.getMarkdown()).toBe(markdown)
  })

  it("stores a pasted app image by its path, and shows no unknown image source", () => {
    const asset = `${"b".repeat(64)}.webp`
    const editor = noteEditor("")
    editor.commands.setContent(
      `<img src="scourgify-asset://local/assets/${asset}"><img src="https://example.com/x.png">`,
    )

    expect(editor.getMarkdown()).toContain(`![](../assets/${asset})`)
    expect(editor.getHTML()).not.toContain("example.com")
  })

  it("keeps evidence chips as the app's citation Markdown", () => {
    const markdown =
      "## 문제\n\n선형 뷰어는 교차참조가 어렵다. [[p.1 | Traditional linear PDF viewers constrain cognitive synthesis.]]"
    const editor = noteEditor(markdown)

    const chip = editor.getJSON().content?.[1]?.content?.find((node) => node.type === "evidence")
    expect(chip).toMatchObject({
      attrs: { page: 1, quote: "Traditional linear PDF viewers constrain cognitive synthesis." },
    })
    expect(editor.getMarkdown()).toBe(markdown)
  })

  it("keeps a chip quote a single valid citation", () => {
    expect(evidenceQuote("a | b [c]\nd")).toBe("a b c d")
    expect(evidenceQuote("word ".repeat(80)).length).toBeLessThanOrEqual(160)
  })

  it("brings a PDF passage in as a quote with its chip and room to write below", () => {
    const editor = noteEditor("내 생각")
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      noteQuoteContent(3, "Table 1: Execution metrics\nfor document pipelines"),
    )

    expect(editor.getMarkdown()).toBe(
      "내 생각\n\n> Table 1: Execution metrics for document pipelines [[p.3 | Table 1: Execution metrics for document pipelines]]\n\n",
    )
  })

  it("turns typed arrows into arrows", () => {
    const editor = noteEditor("논문: 45분 창")
    const type = (text: string): void => {
      const { from, to } = editor.state.selection
      const handled = editor.view.someProp("handleTextInput", (handler) =>
        handler(editor.view, from, to, text, () => editor.state.tr.insertText(text, from, to)),
      )
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(text, from, to))
    }
    editor.commands.focus("end")
    for (const character of " -> 2/3 <-") type(character)

    expect(editor.getMarkdown()).toBe("논문: 45분 창 → 2/3 ←")
  })
})
