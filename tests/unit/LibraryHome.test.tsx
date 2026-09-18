import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LibraryCollectionSidebar } from "../../src/renderer/components/LibraryCollectionSidebar"
import { LibraryHome } from "../../src/renderer/components/LibraryHome"
import { documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/components/DocumentThumbnail", () => ({
  DocumentThumbnail: () => <div data-testid="document-thumbnail" />,
}))

const report = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "clinical-report.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-30T00:00:00.000Z",
  pageCount: 18,
  title: "Clinical Data Quality Report",
  authors: ["Leaf Research"],
  year: 2026,
  doi: null,
  kind: "report",
  quality: { textCharacters: 4000, needsOcr: false, warnings: [] },
})

const manual = documentRecordSchema.parse({
  ...report,
  id: "bbccddeeff001122",
  name: "device-manual.pdf",
  hash: "b".repeat(64),
  importedAt: "2026-08-29T00:00:00.000Z",
  title: "Device Setup Guide",
  authors: [],
  kind: "manual",
})

describe("LibraryHome", () => {
  it("shows the saved reading position and filters honest document kinds", () => {
    const onSelect = vi.fn()
    render(
      <LibraryHome
        documents={[manual, report]}
        activeId={report.id}
        onSelect={onSelect}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
        recentDocumentId={report.id}
        recentPage={7}
      />,
    )

    expect(screen.getByRole("region", { name: "계속 읽기" })).toBeVisible()
    const resume = screen.getByRole("button", { name: /이어서 읽기/ })
    expect(resume).toHaveTextContent("7 / 18페이지")
    expect(resume).toHaveTextContent(report.title)
    fireEvent.click(resume)
    expect(onSelect).toHaveBeenCalledWith(report.id)

    expect(screen.getByRole("button", { name: "계약서" })).not.toBeVisible()
    fireEvent.click(screen.getByText("문서 유형 필터"))
    expect(screen.getByRole("button", { name: "계약서" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "매뉴얼" }))

    expect(screen.getByRole("button", { name: `${manual.title} 열기` })).toBeVisible()
    expect(screen.queryByRole("button", { name: `${report.title} 열기` })).not.toBeInTheDocument()
  })

  it("opens documents and filters by title", () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()
    render(
      <LibraryHome
        documents={[manual, report]}
        activeId={report.id}
        onSelect={onSelect}
        onImport={onImport}
        onFileDrop={vi.fn()}
      />,
    )

    expect(screen.getByText("2개 문서")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "PDF 가져오기" }))
    expect(onImport).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole("searchbox", { name: "라이브러리 검색" }), {
      target: { value: "Device" },
    })
    expect(screen.queryByText(report.title)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: `${manual.title} 열기` }))
    expect(onSelect).toHaveBeenCalledWith(manual.id)
  })

  it("offers PDF import from the empty home", () => {
    const onImport = vi.fn()
    render(
      <LibraryHome
        documents={[]}
        activeId={null}
        onSelect={vi.fn()}
        onImport={onImport}
        onFileDrop={vi.fn()}
      />,
    )

    expect(screen.getByText("첫 PDF를 가져오세요")).toBeVisible()
    const emptyImport = screen.getAllByRole("button", { name: "PDF 가져오기" }).at(-1)
    if (!emptyImport) throw new Error("empty library import action is missing")
    fireEvent.click(emptyImport)
    expect(onImport).toHaveBeenCalledOnce()
  })

  it("accepts multiple dropped PDFs on the library surface", () => {
    const onFileDrop = vi.fn()
    const fileA = new File(["%PDF-1"], "first.pdf", { type: "application/pdf" })
    const fileB = new File(["%PDF-1"], "second.pdf", { type: "application/pdf" })
    render(
      <LibraryHome
        documents={[]}
        activeId={null}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={onFileDrop}
      />,
    )

    fireEvent.drop(screen.getByRole("region", { name: "PDF 라이브러리" }), {
      dataTransfer: { files: [fileA, fileB] },
    })

    expect(onFileDrop).toHaveBeenCalledWith([fileA, fileB])
  })

  it("shows the preparation surface instead of the empty state while importing", () => {
    render(
      <LibraryHome
        documents={[]}
        activeId={null}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
        importProgress={[
          {
            id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
            fileName: "paper.pdf",
            stage: "layout",
            state: "active",
            progress: 0.6,
            message: "페이지 구성 분석 중",
          },
        ]}
      />,
    )

    expect(screen.getByRole("region", { name: "PDF 준비 진행" })).toBeVisible()
    expect(screen.getByRole("progressbar", { name: "paper.pdf 준비 진행" })).toHaveAttribute(
      "aria-valuenow",
      "60",
    )
    expect(screen.queryByText("첫 PDF를 가져오세요")).not.toBeInTheDocument()
  })

  it("shows parallel local analysis progress in the library queue", () => {
    render(
      <LibraryHome
        documents={[report, manual]}
        activeId={report.id}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
        analysisJobs={[
          {
            id: report.id,
            title: report.title,
            pageCount: 18,
            completedPages: 4,
            currentPage: 5,
            stage: "document-analyzing",
            state: "running",
          },
          {
            id: manual.id,
            title: manual.title,
            pageCount: 12,
            completedPages: 0,
            state: "queued",
          },
        ]}
      />,
    )

    expect(screen.getByText("2개 진행 중")).toBeVisible()
    expect(screen.getByText("5 / 18페이지 · 구조 분석 중")).toBeVisible()
    expect(screen.getByText("0 / 12페이지 · 분석 대기 중")).toBeVisible()
  })

  it("keeps existing documents visible while another PDF is preparing", () => {
    render(
      <LibraryHome
        documents={[report]}
        activeId={report.id}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
        importProgress={[
          {
            id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
            fileName: "new-paper.pdf",
            stage: "layout",
            state: "active",
            progress: 0.6,
            message: "페이지 구성 분석 중",
          },
        ]}
      />,
    )

    expect(screen.getByRole("region", { name: "PDF 준비 진행" })).toBeVisible()
    expect(screen.getByRole("button", { name: `${report.title} 열기` })).toBeVisible()
  })

  it("previews a selected paper, switches list and grid views, and keeps an explicit reader action", () => {
    const onSelect = vi.fn()
    render(
      <LibraryHome
        documents={[manual, report]}
        activeId={null}
        onSelect={onSelect}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
      />,
    )

    expect(screen.getByRole("region", { name: "문서 상세" })).toBeVisible()
    expect(screen.getAllByText(report.title).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: `${manual.title} 미리보기` }))
    expect(screen.getByRole("region", { name: "문서 상세" })).toHaveTextContent(manual.title)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "목록 보기" }))
    expect(screen.getByRole("list", { name: "문서 목록" })).toHaveAttribute("data-view", "list")
    fireEvent.click(screen.getByRole("button", { name: `${manual.title} 열기` }))
    expect(onSelect).toHaveBeenCalledWith(manual.id)
  })

  it("keeps the inline collection name when persistent creation fails", async () => {
    const onCreateCollection = vi.fn(async () => false)
    render(
      <LibraryCollectionSidebar
        documents={[report]}
        recentDocumentId={report.id}
        value="all"
        onChange={vi.fn()}
        collapsed={false}
        onToggle={vi.fn()}
        collections={[]}
        selectedCollectionId={null}
        onCollectionSelect={vi.fn()}
        onCreateCollection={onCreateCollection}
        collectionsEnabled
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "컬렉션 만들기" }))
    const input = screen.getByLabelText("새 컬렉션 이름")
    fireEvent.change(input, { target: { value: "AKI review" } })
    fireEvent.submit(input)
    await waitFor(() => expect(onCreateCollection).toHaveBeenCalledWith("AKI review"))
    expect(input).toHaveValue("AKI review")
  })
})
