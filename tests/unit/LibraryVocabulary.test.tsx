import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LibraryHome } from "../../src/renderer/components/LibraryHome"
import { LibraryVocabulary } from "../../src/renderer/components/LibraryVocabulary"
import { boardCardSchema, documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/components/DocumentThumbnail", () => ({
  DocumentThumbnail: () => <div data-testid="document-thumbnail" />,
}))

const paper = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "circulatory.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-30T00:00:00.000Z",
  pageCount: 12,
  title: "Early prediction of circulatory failure",
  authors: [],
  year: 2020,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 4000, needsOcr: false, warnings: [] },
})

const indicates = boardCardSchema.parse({
  id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
  documentId: paper.id,
  kind: "translation",
  title: "indicates",
  body: "1. **나타내다**\n2. 시사하다",
  x: 0,
  y: 0,
  minimized: false,
  loading: false,
  chat: [],
  anchor: {
    page: 3,
    quote: "indicates",
    x: 0,
    y: 0,
    fragments: [{ x: 0, y: 0, width: 1, height: 1 }],
  },
})

describe("LibraryVocabulary", () => {
  it("lists the word with its meanings and opens the paper at the word", () => {
    const onOpenCard = vi.fn()
    render(
      <LibraryVocabulary
        cards={[indicates]}
        documents={[paper]}
        onOpenCard={onOpenCard}
        onSaveFile={undefined}
      />,
    )
    expect(screen.getByText("indicates")).toBeVisible()
    expect(screen.getByText("나타내다")).toBeVisible()
    expect(screen.getByText("시사하다")).toBeVisible()
    expect(screen.queryByRole("button", { name: "CSV 파일로 저장" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: `${paper.title} 3페이지로 이동` }))
    expect(onOpenCard).toHaveBeenCalledWith(paper.id, indicates.id)
  })

  it("copies a Markdown table and saves a CSV file", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    const onSaveFile = vi.fn().mockResolvedValue(true)
    render(
      <LibraryVocabulary
        cards={[indicates]}
        documents={[paper]}
        onOpenCard={vi.fn()}
        onSaveFile={onSaveFile}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Markdown 복사" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("복사했습니다"))
    expect(writeText).toHaveBeenCalledWith(
      [
        "| 단어 | 뜻 | 출처 |",
        "| --- | --- | --- |",
        `| **indicates** | 나타내다, 시사하다 | ${paper.title} p.3 |`,
      ].join("\n"),
    )
    fireEvent.click(screen.getByRole("button", { name: "CSV 파일로 저장" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("파일로 저장했습니다"))
    expect(onSaveFile).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultName: expect.stringMatching(/^vocabulary-\d{4}-\d{2}-\d{2}\.csv$/),
        content: `단어,뜻,출처\nindicates,나타내다; 시사하다,${paper.title} p.3`,
      }),
    )
  })

  it("narrows the list by search and reports when nothing matches", () => {
    render(
      <LibraryVocabulary
        cards={[indicates]}
        documents={[paper]}
        onOpenCard={vi.fn()}
        onSaveFile={undefined}
      />,
    )
    fireEvent.change(screen.getByRole("searchbox", { name: "단어장 검색" }), {
      target: { value: "lactate" },
    })
    expect(screen.getByText("일치하는 단어가 없습니다")).toBeVisible()
  })
})

describe("LibraryHome vocabulary", () => {
  it("opens the vocabulary from the sidebar in place of the papers", () => {
    render(
      <LibraryHome
        documents={[paper]}
        activeId={paper.id}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
        cards={[indicates]}
        onOpenCard={vi.fn()}
      />,
    )
    const entry = screen.getByRole("button", { name: "단어장" })
    expect(entry).toHaveTextContent("1")
    fireEvent.click(entry)
    expect(screen.getByRole("heading", { level: 1, name: "단어장" })).toBeVisible()
    expect(screen.getAllByText("1개 단어")).toHaveLength(2)
    expect(screen.getByRole("region", { name: "단어장" })).toBeVisible()
    expect(screen.queryByRole("searchbox", { name: "라이브러리 검색" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "전체 문서" }))
    expect(screen.queryByRole("region", { name: "단어장" })).not.toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "라이브러리 검색" })).toBeVisible()
  })

  it("leaves the vocabulary out when no cards are given", () => {
    render(
      <LibraryHome
        documents={[paper]}
        activeId={paper.id}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
      />,
    )
    expect(screen.queryByRole("button", { name: "단어장" })).not.toBeInTheDocument()
  })
})
