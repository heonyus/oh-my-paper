import { fireEvent, render, renderHook, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LibraryDocumentList } from "../../src/renderer/components/LibraryDocumentList"
import { documentSearchText } from "../../src/renderer/components/library-home-formatting"
import {
  type LibraryDocumentCriteria,
  useVisibleLibraryDocuments,
} from "../../src/renderer/components/useVisibleLibraryDocuments"
import type { DocumentRecord } from "../../src/renderer/types"
import { documentRecordSchema } from "../../src/shared/schemas"

const { thumbnailRenders } = vi.hoisted(() => ({ thumbnailRenders: vi.fn() }))

vi.mock("../../src/renderer/components/DocumentThumbnail", () => ({
  DocumentThumbnail: ({ document }: { readonly document: DocumentRecord }) => {
    thumbnailRenders(document.id)
    return <div data-testid="document-thumbnail" />
  },
}))

vi.mock("../../src/renderer/components/library-home-formatting", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/renderer/components/library-home-formatting")>()
  return { ...actual, documentSearchText: vi.fn(actual.documentSearchText) }
})

function paper(index: number, title: string): DocumentRecord {
  return documentRecordSchema.parse({
    id: index.toString(16).padStart(16, "0"),
    name: `paper-${index}.pdf`,
    hash: index.toString(16).padStart(64, "0"),
    bytes: 1024,
    importedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    pageCount: 10,
    title,
    authors: [],
    year: 2026,
    doi: null,
    kind: "research_paper",
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })
}

const library = Array.from({ length: 40 }, (_, index) => paper(index + 1, `Paper ${index + 1}`))

function list(selected: DocumentRecord | undefined) {
  return (
    <LibraryDocumentList
      documents={library}
      selectedId={selected?.id ?? null}
      view="list"
      onViewChange={() => undefined}
      onPreview={() => undefined}
      onOpenReader={() => undefined}
      onRequestDelete={() => undefined}
    />
  )
}

describe("library document list at scale", () => {
  beforeEach(() => vi.clearAllMocks())

  it("re-renders only the rows whose selection changed, even with new parent handlers", () => {
    const { rerender } = render(list(library[0]))
    expect(thumbnailRenders).toHaveBeenCalledTimes(library.length)
    thumbnailRenders.mockClear()

    rerender(list(library[1]))

    expect(thumbnailRenders.mock.calls.map(([id]) => id).sort()).toEqual(
      [library[0]?.id, library[1]?.id].sort(),
    )
  })

  it("moves focus between rows with the arrow keys and wraps at the ends", () => {
    render(list(library[0]))
    const previews = screen.getAllByRole("button", { name: / 미리보기$/ })
    const first = previews[0]
    if (!first) throw new Error("no rows")

    first.focus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    expect(previews[1]).toHaveFocus()

    fireEvent.keyDown(previews[1] ?? first, { key: "ArrowUp" })
    fireEvent.keyDown(first, { key: "ArrowLeft" })
    expect(previews.at(-1)).toHaveFocus()
  })
})

describe("visible library documents", () => {
  it("sorts and indexes the library once, then filters linearly per query", () => {
    vi.mocked(documentSearchText).mockClear()
    const papers = [paper(1, "Attention Is All You Need"), paper(2, "Deep Residual Learning")]
    const criteria = (query: string): LibraryDocumentCriteria => ({
      query,
      filter: "all",
      recentDocumentId: null,
      collectionMembers: null,
    })
    const { result, rerender } = renderHook(
      ({ query }) => useVisibleLibraryDocuments(papers, criteria(query)),
      { initialProps: { query: "" } },
    )
    expect(result.current.map((document) => document.title)).toEqual([
      "Deep Residual Learning",
      "Attention Is All You Need",
    ])

    for (const query of ["a", "at", "atte", "residual"]) rerender({ query })

    expect(result.current.map((document) => document.title)).toEqual(["Deep Residual Learning"])
    expect(vi.mocked(documentSearchText)).toHaveBeenCalledTimes(papers.length)
  })
})
