import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LibraryHome } from "../../src/renderer/components/LibraryHome"
import { LibraryVocabulary } from "../../src/renderer/components/LibraryVocabulary"
import { sourceDocumentAstSchema } from "../../src/shared/documentAst"
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

const sentence = "This indicates that perfusion was failing early."

/** Page 3 of the paper: a heading, then the sentence the word was looked up in, then another. */
const structure = sourceDocumentAstSchema.parse({
  schemaVersion: "1.0.0",
  sourceHash: "a".repeat(64),
  extractorVersion: "test",
  pages: [{ id: "page:3", page: 3, width: 600, height: 800 }],
  items: [
    {
      id: "item:0",
      pageId: "page:3",
      text: "Results",
      normalizedStart: 0,
      normalizedEnd: 7,
      bounds: { x: 40, y: 40, width: 60, height: 10 },
    },
    {
      id: "item:1",
      pageId: "page:3",
      text: `Lactate rose first. ${sentence}`,
      normalizedStart: 8,
      normalizedEnd: 8 + 20 + sentence.length,
      bounds: { x: 40, y: 54, width: 480, height: 10 },
    },
  ],
  lines: [
    {
      id: "line:0",
      pageId: "page:3",
      sourceItemIds: ["item:0"],
      bounds: { x: 40, y: 40, width: 60, height: 10 },
    },
    {
      id: "line:1",
      pageId: "page:3",
      sourceItemIds: ["item:1"],
      bounds: { x: 40, y: 54, width: 480, height: 10 },
    },
  ],
})

const runAi = vi.fn()

beforeEach(() => {
  runAi.mockReset()
  runAi.mockResolvedValue({ text: "이는 관류가 일찍 나빠지고 있었음을 나타낸다.", model: "test" })
  Object.defineProperty(window, "ohmypaper", {
    configurable: true,
    value: {
      readDocumentAst: vi.fn().mockResolvedValue({
        status: "ready",
        sourceHash: "a".repeat(64),
        fingerprint: "b".repeat(64),
        ast: structure,
      }),
      runAi,
    },
  })
})

describe("LibraryVocabulary", () => {
  it("shows the sentence the word was met in, translates it, and opens the paper at the word", async () => {
    const onOpenCard = vi.fn()
    const onSaveExample = vi.fn()
    const dated = { ...indicates, createdAt: "2026-10-14T09:30:00.000Z" }
    const { container } = render(
      <LibraryVocabulary
        cards={[dated]}
        documents={[paper]}
        onOpenCard={onOpenCard}
        onSaveFile={undefined}
        onSaveExample={onSaveExample}
      />,
    )
    expect(screen.getByRole("heading", { level: 2, name: "indicates" })).toBeVisible()
    expect(screen.getAllByText("나타내다").length).toBeGreaterThan(0)
    expect(screen.getByText("시사하다")).toBeVisible()
    expect(await screen.findByText("indicates", { selector: "mark" })).toBeVisible()
    expect(screen.getByText(/that perfusion was failing early\./u)).toBeVisible()
    expect(container.querySelector("time")).toHaveAttribute("datetime", dated.createdAt)
    await waitFor(() =>
      expect(onSaveExample).toHaveBeenCalledWith(indicates.id, {
        sentence,
        translation: "이는 관류가 일찍 나빠지고 있었음을 나타낸다.",
      }),
    )
    expect(runAi).toHaveBeenCalledWith(
      expect.objectContaining({ action: "translation", quote: sentence, page: 3 }),
    )
    expect(screen.queryByRole("button", { name: "CSV 파일로 저장" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: `${paper.title} 3페이지로 이동` }))
    expect(onOpenCard).toHaveBeenCalledWith(paper.id, indicates.id)
  })

  it("shows a translation that failed, and asks again on 다시 시도", async () => {
    runAi.mockRejectedValueOnce(new Error("offline"))
    const onSaveExample = vi.fn()
    // Another paper, so the translation the first test asked for is not reused here.
    const otherPaper = documentRecordSchema.parse({
      ...paper,
      id: "bbccddeeff001122",
      hash: "c".repeat(64),
    })
    const again = boardCardSchema.parse({
      ...indicates,
      id: "8a6f6b9e-3a0b-4c55-9b63-0a3f8e1d2c44",
      documentId: otherPaper.id,
    })
    render(
      <LibraryVocabulary
        cards={[again]}
        documents={[otherPaper]}
        onOpenCard={vi.fn()}
        onSaveFile={undefined}
        onSaveExample={onSaveExample}
      />,
    )
    expect(await screen.findByText("해석을 불러오지 못했습니다.")).toBeVisible()
    expect(onSaveExample).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }))
    await waitFor(() => expect(onSaveExample).toHaveBeenCalledTimes(1))
    expect(runAi).toHaveBeenCalledTimes(2)
  })

  it("copies a Markdown table with the kept example and saves a CSV file", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    const onSaveFile = vi.fn().mockResolvedValue(true)
    const kept = {
      ...indicates,
      example: { sentence, translation: "이는 관류가 일찍 나빠지고 있었음을 나타낸다." },
    }
    render(
      <LibraryVocabulary
        cards={[kept]}
        documents={[paper]}
        onOpenCard={vi.fn()}
        onSaveFile={onSaveFile}
      />,
    )
    expect(screen.getByText("이는 관류가 일찍 나빠지고 있었음을 나타낸다.")).toBeVisible()
    fireEvent.click(screen.getByText("내보내기"))
    fireEvent.click(screen.getByRole("button", { name: "Markdown 복사" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("복사했습니다"))
    expect(writeText).toHaveBeenCalledWith(
      [
        "| 단어 | 뜻 | 예문 | 해석 | 출처 |",
        "| --- | --- | --- | --- | --- |",
        `| **indicates** | 나타내다; 시사하다 | ${sentence} | 이는 관류가 일찍 나빠지고 있었음을 나타낸다. | ${paper.title} p.3 |`,
      ].join("\n"),
    )
    fireEvent.click(screen.getByText("내보내기"))
    fireEvent.click(screen.getByRole("button", { name: "CSV 파일로 저장" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("파일로 저장했습니다"))
    expect(onSaveFile).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultName: expect.stringMatching(/^vocabulary-\d{4}-\d{2}-\d{2}\.csv$/),
        content: `단어,뜻,예문,해석,출처\nindicates,나타내다; 시사하다,${sentence},이는 관류가 일찍 나빠지고 있었음을 나타낸다.,${paper.title} p.3`,
      }),
    )
    expect(runAi).not.toHaveBeenCalled()
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
    expect(screen.getByText("1개 단어")).toBeVisible()
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
