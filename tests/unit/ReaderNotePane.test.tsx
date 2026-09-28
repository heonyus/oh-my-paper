import { Editor } from "@tiptap/core"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReaderNotePane } from "../../src/renderer/components/readerNote/ReaderNotePane"
import type { JevDecisionRequest } from "../../src/shared/aiDecision"
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
          ],
        }
      : null,
  ),
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

beforeEach(() => {
  const values = new Map([["ohmypaper:margin-ai", "on"]])
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, "ohmypaper", { configurable: true, value: undefined })
})

describe("ReaderNotePane", () => {
  it("shows the passage a settled sentence rests on and attaches it only on request", async () => {
    const decideAi = vi.fn(async (request: JevDecisionRequest) => ({
      task: "relevance" as const,
      choiceId: request.instructions?.includes("contradicts") ? "none" : "p1-b0",
      probability: 0.94,
      model: "jev",
      provider: "test",
    }))
    Object.defineProperty(window, "ohmypaper", { configurable: true, value: { decideAi } })
    const onChange = vi.fn()
    render(
      <ReaderNotePane
        document={documentFixture}
        note={undefined}
        currentPage={1}
        onChange={onChange}
        onClose={vi.fn()}
        onNavigateToSource={vi.fn()}
        pendingQuote={null}
        onPendingQuoteHandled={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: "여백 AI 켜짐" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    editorOnPage().commands.setContent("<p>번역을 먼저 보면 영어 원문을 건너뛴다.</p>")

    expect(await screen.findByText(passage)).toBeVisible()
    expect(decideAi.mock.calls[0]?.[0].text).toBe("번역을 먼저 보면 영어 원문을 건너뛴다.")
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining("[[p.1"))

    await userEvent.click(screen.getByRole("button", { name: "근거로 붙이기" }))

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        `번역을 먼저 보면 영어 원문을 건너뛴다. [[p.1 | ${passage}]]`,
      ),
    )
    expect(screen.getByText("근거로 붙임")).toBeVisible()
  })

  it("says so on its switch when the server has no OpenRouter key", async () => {
    const decideAi = vi.fn(async () => {
      throw Object.assign(new Error("Jev needs an OpenRouter key"), { status: 503 })
    })
    Object.defineProperty(window, "ohmypaper", { configurable: true, value: { decideAi } })
    render(
      <ReaderNotePane
        document={documentFixture}
        note={undefined}
        currentPage={1}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onNavigateToSource={vi.fn()}
        pendingQuote={null}
        onPendingQuoteHandled={vi.fn()}
      />,
    )

    editorOnPage().commands.setContent("<p>번역을 먼저 보면 영어 원문을 건너뛴다.</p>")

    expect(await screen.findByRole("button", { name: "여백 AI 키 없음" })).toBeVisible()
    expect(screen.queryByText(/OpenRouter/u)).not.toBeInTheDocument()
  })
})
