import { EditorView } from "@codemirror/view"
import { act, fireEvent, render } from "@testing-library/react"
import { type JSX, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NoteEditor } from "../../../src/renderer/components/notes/NoteEditor"
import {
  LOCAL_INFERENCE_CANDIDATE,
  type LocalInferenceApi,
  type LocalInferenceStatus,
} from "../../../src/shared/localInference"

const manifest = {
  runtimePath: "/tmp/llama-server",
  runtimeArchivePath: "/tmp/llama.tar.gz",
  modelPath: "/tmp/qwen.gguf",
  runtimeVersion: LOCAL_INFERENCE_CANDIDATE.runtime.version,
  runtimeExecutableSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  modelRevision: LOCAL_INFERENCE_CANDIDATE.model.revision,
  licenseAccepted: true,
}

const readyStatus: LocalInferenceStatus = {
  enabled: true,
  device: { platform: "darwin", arch: "arm64", supported: true },
  setup: { status: "ready", manifest },
  active: false,
}

function localApi(suggestion: string): LocalInferenceApi {
  return {
    getStatus: vi.fn(async () => readyStatus),
    chooseSetup: vi.fn(async () => manifest),
    enable: vi.fn(async () => readyStatus),
    suggest: vi.fn<LocalInferenceApi["suggest"]>(async (request) => ({
      status: "ready",
      requestId: request.requestId,
      revision: request.revision,
      suggestions: [suggestion],
    })),
    cancel: vi.fn(async () => undefined),
  }
}

function editorView(container: HTMLElement): EditorView {
  const element = container.querySelector(".cm-editor")
  if (!(element instanceof HTMLElement)) throw new Error("CodeMirror editor was not mounted")
  const view = EditorView.findFromDOM(element)
  if (!view) throw new Error("CodeMirror view was not found")
  return view
}

function ControlledLocalEditor({
  api,
  initial,
}: {
  readonly api: LocalInferenceApi
  readonly initial: string
}): JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <NoteEditor
      value={value}
      onChange={setValue}
      nodes={[]}
      noteTitle="로컬 제안 테스트"
      localInferenceApi={api}
    />
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe("NoteEditor local suggestions", () => {
  it("accepts a verified local ghost with Tab and keeps the insertion undoable", async () => {
    vi.useFakeTimers()
    const api = localApi("로컬 제안")
    const { container } = render(<ControlledLocalEditor api={api} initial="초안" />)
    const view = editorView(container)
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    expect(container.querySelector(".note-editor-ghost")).toHaveTextContent("로컬 제안")

    view.focus()
    fireEvent.keyDown(view.contentDOM, { key: "Tab" })

    expect(view.state.doc.toString()).toBe("초안\n로컬 제안")
    expect(container.querySelector(".note-editor-ghost")).toBeNull()
  })

  it("dismisses a ghost with Escape without changing the Markdown source", async () => {
    vi.useFakeTimers()
    const api = localApi("닫을 제안")
    const { container } = render(<ControlledLocalEditor api={api} initial="초안" />)
    const view = editorView(container)
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    view.focus()
    fireEvent.keyDown(view.contentDOM, { key: "Escape" })

    expect(view.state.doc.toString()).toBe("초안")
    expect(container.querySelector(".note-editor-ghost")).toBeNull()
  })

  it("does not request or intercept Tab during IME composition or inside a table", async () => {
    vi.useFakeTimers()
    const api = localApi("should not appear")
    const { container } = render(
      <ControlledLocalEditor
        api={api}
        initial={["| A | B |", "| --- | --- |", "| one | two |"].join("\n")}
      />,
    )
    const view = editorView(container)
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      await Promise.resolve()
    })
    fireEvent.compositionStart(view.contentDOM)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    fireEvent.keyDown(view.contentDOM, { key: "Tab" })

    expect(api.suggest).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe("| A | B |\n| --- | --- |\n| one | two |")
    expect(container.querySelector(".note-editor-ghost")).toBeNull()
  })
})
