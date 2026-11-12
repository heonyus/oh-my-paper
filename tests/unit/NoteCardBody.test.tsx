import { act, fireEvent, render, screen } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import { describe, expect, it, vi } from "vitest"
import { NoteCardBody } from "../../src/renderer/components/NoteCardBody"
import { boardCardSchema } from "../../src/shared/schemas"

const card = boardCardSchema.parse({
  id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
  documentId: "aabbccddeeff0011",
  kind: "note",
  title: "메모",
  body: "",
  x: 900,
  y: 240,
  minimized: false,
  anchor: {
    page: 2,
    quote: "Readers who write a gist first read the English source more closely.",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

function tiptapOf(element: HTMLElement): Editor {
  const editor: unknown = Reflect.get(element, "editor")
  if (!editor) throw new Error("memo editor must be mounted")
  return editor as Editor
}

describe("NoteCardBody", () => {
  it("opens the old fixed annotation text as an empty memo", () => {
    render(
      <NoteCardBody
        card={{ ...card, body: "이 구절에 연결된 메모입니다." }}
        autoEdit={false}
        onBodyChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("textbox", { name: "메모 내용" })).toHaveTextContent("")
  })

  it("shows a saved memo rendered and still editable", () => {
    render(
      <NoteCardBody
        card={{ ...card, body: "## 요지\n\n- 먼저 쓴다" }}
        autoEdit={false}
        onBodyChange={vi.fn()}
      />,
    )
    const memo = screen.getByRole("textbox", { name: "메모 내용" })

    expect(screen.getByRole("heading", { name: "요지" })).toBeInTheDocument()
    expect(memo.querySelector("li")).toHaveTextContent("먼저 쓴다")
    expect(memo).toHaveAttribute("contenteditable", "true")
  })

  it("saves what the reader writes when they leave it, and offers no grading", () => {
    const onBodyChange = vi.fn()
    render(<NoteCardBody card={card} autoEdit onBodyChange={onBodyChange} />)
    const memo = screen.getByRole("textbox", { name: "메모 내용" })

    act(() => {
      tiptapOf(memo).commands.insertContent("요지를 먼저 쓴다")
    })
    act(() => {
      tiptapOf(memo).commands.blur()
    })
    fireEvent.blur(memo)

    expect(onBodyChange).toHaveBeenCalledWith("요지를 먼저 쓴다")
    expect(screen.queryByRole("button", { name: /대조/u })).not.toBeInTheDocument()
  })
})
