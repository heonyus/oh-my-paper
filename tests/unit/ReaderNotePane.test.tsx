import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReaderNotePane } from "../../src/renderer/components/readerNote/ReaderNotePane"
import type { AiRequest } from "../../src/shared/ipc"
import type { MeaningSearchRequest } from "../../src/shared/meaningSearch"
import { documentRecordSchema } from "../../src/shared/schemas"

const passage =
  "Readers who see the translation first skim it and skip the English source text entirely."

vi.mock("../../src/renderer/lib/documentPageRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/renderer/lib/documentPageRuntime")>()),
  loadParsedDocumentPage: vi.fn(async (_documentId: string, pageNumber: number) =>
    pageNumber === 1
      ? {
          blocks: [
            {
              id: "page:1:block:0",
              label: "text",
              order: 0,
              bounds: { x: 1, y: 1, width: 10, height: 10 },
              content: passage,
              contentFormat: "text",
              translationPolicy: "include",
            },
            {
              id: "page:1:block:1",
              label: "text",
              order: 1,
              bounds: { x: 1, y: 20, width: 10, height: 10 },
              content: "The study was approved by the institutional review board last year.",
              contentFormat: "text",
              translationPolicy: "include",
            },
          ],
        }
      : null,
  ),
}))
vi.mock("../../src/renderer/lib/documentAstRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/renderer/lib/documentAstRuntime")>()),
  waitForDocumentAst: vi.fn(async () => null),
}))

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "Paper.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 2,
  title: "Paper",
  authors: [],
  year: 2026,
  doi: null,
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

function editorOnPage(): Editor {
  const dom = document.querySelector(".ProseMirror")
  const editor: unknown = dom ? Reflect.get(dom, "editor") : null
  if (!(editor instanceof Editor)) throw new Error("note editor is not mounted")
  return editor
}

const rankByMeaning = vi.fn(async (request: MeaningSearchRequest) => ({
  model: "test",
  results: request.candidates.map((candidate) => ({
    id: candidate.id,
    score: candidate.text === passage ? 0.72 : 0.31,
  })),
}))

function renderPane(onAiRequest = vi.fn(async () => ""), onChange = vi.fn()) {
  render(
    <ReaderNotePane
      document={documentFixture}
      note={undefined}
      currentPage={1}
      earlierNotes={[]}
      onAiRequest={onAiRequest}
      onChange={onChange}
      onClose={vi.fn()}
      onNavigateToSource={vi.fn()}
      pendingQuote={null}
      onPendingQuoteHandled={vi.fn()}
    />,
  )
  return { onAiRequest, onChange }
}

let stored: Map<string, string>
beforeEach(() => {
  stored = new Map()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  })
  rankByMeaning.mockClear()
  Object.defineProperty(window, "ohmypaper", {
    configurable: true,
    value: { rankByMeaning, meaningSearchStatus: vi.fn(async () => ({ state: "ready" })) },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, "ohmypaper", { configurable: true, value: undefined })
})

describe("ReaderNotePane", () => {
  it("shows the source a finished sentence rests on and attaches it only on request", async () => {
    const { onChange } = renderPane()

    editorOnPage().commands.setContent("<p>번역을 먼저 보면 영어 원문을 건너뛴다.</p>")

    expect(await screen.findByText(passage)).toBeVisible()
    expect(screen.queryByText(/review board/u)).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining("[[p.1"))

    await userEvent.click(screen.getByRole("button", { name: "근거로 붙이기" }))

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        `번역을 먼저 보면 영어 원문을 건너뛴다. [[p.1 | ${passage}]]`,
      ),
    )
    expect(screen.getByText("근거로 붙임")).toBeVisible()
  })

  it("lets the tutor build on a finished paragraph without asking questions", async () => {
    const reply =
      "짚은 방향이 맞아요. 저자는 선호와 기억이 반대로 움직였다고 적었어요. 왜 그럴까요? "
    const onAiRequest = vi.fn(
      async (request: Omit<AiRequest, "documentId">, onDelta?: (delta: string) => void) => {
        expect(request.action).toBe("note_tutor")
        expect(request.sourceEvidence).toContain(passage)
        onDelta?.(reply)
        return reply
      },
    )
    renderPane(onAiRequest)
    const editor = editorOnPage()

    editor.commands.setContent("<p>사람들은 번역이 보이는 쪽을 더 좋아했다.</p><p></p>")
    editor.commands.setTextSelection(3)
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)

    expect(
      await screen.findByText(
        "짚은 방향이 맞아요. 저자는 선호와 기억이 반대로 움직였다고 적었어요.",
      ),
    ).toBeVisible()
    expect(screen.queryByText(/왜 그럴까요/u)).not.toBeInTheDocument()
    expect(onAiRequest).toHaveBeenCalledOnce()
  })

  it("stays silent when set to 조용히", async () => {
    const onAiRequest = vi.fn(async () => "")
    renderPane(onAiRequest)

    await userEvent.click(screen.getByRole("button", { name: "조용히" }))
    editorOnPage().commands.setContent("<p>번역을 먼저 보면 영어 원문을 건너뛴다.</p><p></p>")
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(rankByMeaning).not.toHaveBeenCalled()
    expect(onAiRequest).not.toHaveBeenCalled()
    expect(stored.get("ohmypaper:note-companion")).toBe("quiet")
  })

  it("offers only 조용히 where meaning search is not available", () => {
    Object.defineProperty(window, "ohmypaper", { configurable: true, value: {} })
    renderPane()

    expect(screen.getByRole("button", { name: "보통" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "조용히" })).toBeEnabled()
  })
})
