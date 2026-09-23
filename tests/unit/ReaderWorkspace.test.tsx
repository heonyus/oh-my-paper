import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { defaultWorkspace } from "../../src/electron/workspaceStore"
import type { BoardViewportProps } from "../../src/renderer/components/BoardViewportProps"
import { ReaderWorkspace } from "../../src/renderer/components/ReaderWorkspace"
import type { DocumentRecord, Workspace } from "../../src/renderer/types"
import { documentRecordSchema } from "../../src/shared/schemas"

let capturedPageCallback: BoardViewportProps["onPageActive"] | null = null

vi.mock("../../src/renderer/components/BoardViewport", () => ({
  BoardViewport: (props: BoardViewportProps) => {
    capturedPageCallback = props.onPageActive
    return null
  },
}))
vi.mock("../../src/renderer/components/OutlinePanel", () => ({ OutlinePanel: () => null }))
vi.mock("../../src/renderer/components/ResearchSidebar", () => ({
  ResearchSidebar: () => null,
}))

const documentRecord = (lastReadPage?: number): DocumentRecord =>
  documentRecordSchema.parse({
    id: "aabbccddeeff0011",
    name: "paper.pdf",
    hash: "a".repeat(64),
    bytes: 1024,
    importedAt: "2026-08-30T00:00:00.000Z",
    pageCount: 12,
    title: "Paper",
    authors: [],
    year: null,
    doi: null,
    ...(lastReadPage === undefined ? {} : { lastReadPage }),
    quality: { textCharacters: 100, needsOcr: false, warnings: [] },
  })

function workspaceFor(document: DocumentRecord): Workspace {
  return { ...defaultWorkspace(), documents: [document], activeDocumentId: document.id }
}

function readerProps(document: DocumentRecord): Parameters<typeof ReaderWorkspace>[0] {
  return {
    document,
    workspace: workspaceFor(document),
    updateWorkspace: vi.fn(),
    updateViewport: vi.fn(),
    currentPage: document.lastReadPage ?? 1,
    setPage: vi.fn(),
    updateDocumentPage: vi.fn(),
    cards: [],
    updateCards: vi.fn(),
    previewCards: vi.fn(),
    tool: "select",
    setTool: vi.fn(),
    runAi: vi.fn(async () => ""),
    provider: { configured: false, provider: "openai", model: "test-model" },
    documentReady: true,
    citations: [],
    insights: [],
    updateInsight: vi.fn(),
    jumpToCard: vi.fn(),
    onPrepared: vi.fn(),
    outline: [],
    outlineOpen: false,
    closeOutline: vi.fn(),
    updateOutline: vi.fn(),
    jumpToPage: vi.fn(),
    registerPageJump: vi.fn(),
    evidence: null,
    dismissEvidence: vi.fn(),
    importPdf: vi.fn(),
  }
}

describe("ReaderWorkspace", () => {
  it("keeps the PDF page callback stable when saved page metadata changes", () => {
    const firstProps = readerProps(documentRecord(1))
    const { rerender } = render(<ReaderWorkspace {...firstProps} />)
    const firstCallback = capturedPageCallback
    rerender(
      <ReaderWorkspace
        {...firstProps}
        document={documentRecord(2)}
        workspace={workspaceFor(documentRecord(2))}
        currentPage={2}
      />,
    )

    expect(capturedPageCallback).toBe(firstCallback)
  })
})
