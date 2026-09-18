import { undo } from "@codemirror/commands"
import { EditorView } from "@codemirror/view"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { type JSX, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { NoteEditor } from "../../../src/renderer/components/notes/NoteEditor"
import { knowledgeNodeSchema } from "../../../src/shared/knowledgeSchemas"

const linkedNode = knowledgeNodeSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "concept",
  title: "FlashAttention",
  body: "",
  aliases: ["Flash"],
  metadata: {},
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
})

function editorView(container: HTMLElement): EditorView {
  const editor = container.querySelector(".cm-editor")
  if (!(editor instanceof HTMLElement)) throw new Error("CodeMirror editor was not mounted")
  const view = EditorView.findFromDOM(editor)
  if (!view) throw new Error("CodeMirror view was not found")
  return view
}

function ControlledEditor({ initial = "" }: { readonly initial?: string }): JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <>
      <NoteEditor value={value} onChange={setValue} nodes={[linkedNode]} />
      <button type="button" onClick={() => setValue("external revision")}>
        외부 변경
      </button>
    </>
  )
}

describe("NoteEditor state", () => {
  it("keeps one EditorState, source bytes, selection, and undo across view switches", () => {
    // Given
    const onChange = vi.fn<(value: string) => void>()
    const source = '# 제목\n\n<unsupported attr="kept">원문</unsupported>'
    const { container } = render(
      <NoteEditor value={source} onChange={onChange} nodes={[linkedNode]} />,
    )
    const before = editorView(container)

    // When
    act(() => before.dispatch({ selection: { anchor: source.length } }))
    fireEvent.click(screen.getByRole("button", { name: "소스 보기" }))
    fireEvent.click(screen.getByRole("button", { name: "라이브" }))
    act(() => {
      before.focus()
      before.dispatch({ changes: { from: source.length, insert: "\n새 문장" } })
    })
    act(() => {
      expect(undo(before)).toBe(true)
    })

    // Then
    expect(editorView(container)).toBe(before)
    expect(before.state.doc.toString()).toBe(source)
    expect(before.state.selection.main.head).toBe(source.length)
    expect(onChange).toHaveBeenCalledWith(`${source}\n새 문장`)
  })

  it("inserts a stable wiki link at the current CodeMirror caret", () => {
    // Given
    const { container } = render(<ControlledEditor initial="참조 [[Flash" />)
    const view = editorView(container)
    act(() => {
      view.focus()
      view.dispatch({ selection: { anchor: view.state.doc.length } })
    })

    // When
    fireEvent.click(screen.getByRole("option", { name: /FlashAttention/u }))

    // Then
    const expected = "참조 [[11111111-1111-4111-8111-111111111111|Flash]]"
    expect(view.state.doc.toString()).toBe(expected)
    expect(view.state.selection.main.head).toBe(expected.length)
  })

  it("does not let a stale controlled value clobber an active Korean composition", () => {
    // Given
    const { container } = render(<ControlledEditor initial="초안" />)
    const view = editorView(container)
    fireEvent.compositionStart(view.contentDOM)

    // When
    fireEvent.click(screen.getByRole("button", { name: "외부 변경" }))
    act(() => view.dispatch({ changes: { from: 2, insert: " 작성" } }))
    fireEvent.compositionEnd(view.contentDOM)

    // Then
    expect(view.state.doc.toString()).toBe("초안 작성")
  })

  it("renders valid math while invalid math remains editable source", () => {
    // Given / When
    const { container } = render(
      <NoteEditor
        value={String.raw`valid $x^2$ invalid $\frac{$`}
        onChange={() => {}}
        nodes={[]}
      />,
    )

    // Then
    expect(container.querySelectorAll(".note-rich-math")).toHaveLength(1)
    expect(editorView(container).state.doc.toString()).toBe(
      String.raw`valid $x^2$ invalid $\frac{$`,
    )
    expect(container.querySelector(".cm-content")?.textContent).toContain(String.raw`$\frac{$`)
  })

  it("reports source Markdown offsets when the CodeMirror selection changes", () => {
    // Given
    const onSelectionChange =
      vi.fn<(selection: { readonly from: number; readonly to: number }) => void>()
    const { container } = render(
      <NoteEditor
        value="가나다라마바사"
        onChange={() => {}}
        nodes={[]}
        onSelectionChange={onSelectionChange}
      />,
    )

    // When
    act(() => editorView(container).dispatch({ selection: { anchor: 2, head: 5 } }))

    // Then
    expect(onSelectionChange).toHaveBeenLastCalledWith({ from: 2, to: 5 })
  })

  it("routes Cmd+S through the host without replacing the live editor", () => {
    // Given
    const onSaveShortcut = vi.fn()
    const { container } = render(
      <NoteEditor value="초안" onChange={() => {}} nodes={[]} onSaveShortcut={onSaveShortcut} />,
    )
    const view = editorView(container)
    act(() => view.dispatch({ selection: { anchor: 1 } }))
    view.focus()

    // When
    fireEvent.keyDown(view.contentDOM, { key: "s", ctrlKey: true })

    // Then
    expect(onSaveShortcut).toHaveBeenCalledOnce()
    expect(editorView(container)).toBe(view)
    expect(view.state.doc.toString()).toBe("초안")
    expect(view.state.selection.main.head).toBe(1)
  })

  it("keeps CodeMirror mounted when the save callback identity changes", () => {
    // Given
    const firstSave = vi.fn()
    const latestSave = vi.fn()
    const { container, rerender } = render(
      <NoteEditor value="초안" onChange={() => {}} nodes={[]} onSaveShortcut={firstSave} />,
    )
    const view = editorView(container)
    act(() => view.dispatch({ selection: { anchor: 1 } }))

    // When
    rerender(<NoteEditor value="초안" onChange={() => {}} nodes={[]} onSaveShortcut={latestSave} />)
    fireEvent.keyDown(view.contentDOM, { key: "s", ctrlKey: true })

    // Then
    expect(editorView(container)).toBe(view)
    expect(view.state.selection.main.head).toBe(1)
    expect(firstSave).not.toHaveBeenCalled()
    expect(latestSave).toHaveBeenCalledOnce()
  })

  it("renders supported blocks locally without changing their Markdown source", () => {
    // Given / When
    const source = [
      "intro",
      "",
      "# Heading",
      "- item",
      "[site](https://example.com)",
      "[[11111111-1111-4111-8111-111111111111|Flash]]",
      "`code`",
      `![local](assets/${"a".repeat(64)}.png)`,
      "![remote](https://example.com/tracker.png)",
      "",
      "$$",
      String.raw`\frac{1}{2}`,
      "$$",
      "",
      "| A | B |",
      "| --- | --- |",
      "| one | two |",
    ].join("\n")
    const { container } = render(<NoteEditor value={source} onChange={() => {}} nodes={[]} />)

    // Then
    expect(container.querySelector(".note-live-heading")).not.toBeNull()
    expect(container.querySelector(".note-rich-list-marker")?.textContent).toBe("• ")
    expect(container.querySelector(".note-rich-link")).not.toBeNull()
    expect(
      [...container.querySelectorAll(".note-rich-link")].some(
        (link) => link.textContent === "Flash",
      ),
    ).toBe(true)
    expect(container.querySelector(".note-rich-code")).not.toBeNull()
    expect(container.querySelector(".note-rich-math-display")).not.toBeNull()
    expect(container.querySelector(".note-rich-table-wrap")).not.toBeNull()
    expect(container.querySelectorAll(".note-rich-image img")).toHaveLength(1)
    expect(container.querySelector(".note-rich-image img")?.getAttribute("src")).toBe(
      `scourgify-asset://local/assets/${"a".repeat(64)}.png`,
    )
    expect(container.querySelector(".cm-content")?.textContent).toContain(
      "![remote](https://example.com/tracker.png)",
    )
    expect(editorView(container).state.doc.toString()).toBe(source)
  })

  it("creates and edits a table through undoable Markdown transactions", () => {
    // Given
    const { container } = render(<ControlledEditor />)
    const view = editorView(container)

    // When
    fireEvent.click(screen.getByRole("button", { name: "표 만들기" }))
    act(() => view.dispatch({ selection: { anchor: 0 } }))
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }))
    fireEvent.click(screen.getByRole("button", { name: "열 추가" }))

    // Then
    expect(view.state.doc.toString()).toBe(
      "| 열 1 | 열 2 |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
    )
    act(() => {
      expect(undo(view)).toBe(true)
    })
    expect(view.state.doc.toString()).toBe("| 열 1 | 열 2 |\n| --- | --- |\n|  |  |\n|  |  |")
  })

  it("wraps a selected passage with Markdown emphasis and keeps it undoable", () => {
    // Given
    const { container } = render(<ControlledEditor initial="핵심 문장" />)
    const view = editorView(container)
    act(() => view.dispatch({ selection: { anchor: 0, head: 5 } }))

    // When
    fireEvent.click(screen.getByRole("button", { name: "굵게" }))

    // Then
    expect(view.state.doc.toString()).toBe("**핵심 문장**")
    act(() => {
      expect(undo(view)).toBe(true)
    })
    expect(view.state.doc.toString()).toBe("핵심 문장")
  })
})
