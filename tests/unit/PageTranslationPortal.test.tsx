import { render, renderHook } from "@testing-library/react"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  autoOpenDelayMs,
  PageTranslationPortal,
  visibleResearchSidebarWidth,
} from "../../src/renderer/components/PageTranslationPortal"
import {
  openPageTranslation,
  setPageTranslationDocument,
  toggleAutomaticPageTranslation,
  usePageTranslationSession,
} from "../../src/renderer/lib/pageTranslationToggle"
import type { AiRequestRunner, DocumentRecord } from "../../src/renderer/types"
import { providerStatusSchema } from "../../src/shared/ipc"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"

vi.mock("../../src/renderer/components/PageTranslationPane", () => ({
  PageTranslationPane: ({ currentPage }: { readonly currentPage: number }) => (
    <div data-page={currentPage} />
  ),
}))

const firstDocument = documentRecordSchema.parse({
  id: documentIdSchema.parse("4444444444444444"),
  name: "first.pdf",
  hash: "4".repeat(64),
  bytes: 10,
  importedAt: "2026-09-05T00:00:00.000Z",
  pageCount: 5,
  title: "First",
  authors: [],
  year: null,
  doi: null,
  kind: "research_paper",
  quality: { textCharacters: 10, needsOcr: false, warnings: [] },
})
const secondDocument: DocumentRecord = {
  ...firstDocument,
  id: documentIdSchema.parse("5555555555555555"),
}
const provider = providerStatusSchema.parse({
  provider: "openai",
  model: "model",
  configured: false,
})
const onAiRequest: AiRequestRunner = async () => ""

function renderPortal(document: DocumentRecord, currentPage: number) {
  return render(
    <PageTranslationPortal
      document={document}
      currentPage={currentPage}
      citations={[]}
      provider={provider}
      onAiRequest={onAiRequest}
    />,
  )
}

describe("PageTranslationPortal", () => {
  it("reserves the visible AI flyout width when fitting translation panes", () => {
    expect(visibleResearchSidebarWidth("open", "ai", 320)).toBe(360)
    expect(visibleResearchSidebarWidth("pinned", "ai", 420)).toBe(460)
    expect(visibleResearchSidebarWidth("hover", "ai", 320)).toBe(40)
    expect(visibleResearchSidebarWidth("open", "translation", 320)).toBe(40)
  })

  it("does not reopen the new document from the previous document's auto consent", () => {
    document.body.innerHTML = '<div class="reader-workspace"></div>'
    const { result } = renderHook(() => usePageTranslationSession())
    act(() => {
      setPageTranslationDocument(firstDocument.id)
      toggleAutomaticPageTranslation()
    })

    renderPortal(secondDocument, 4)

    expect(result.current).toMatchObject({
      documentId: secondDocument.id,
      auto: false,
      openPages: [],
    })
  })

  it("keeps the translation of every page the reader rests on, skipping pages scrolled past", () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = '<div class="reader-workspace"></div>'
      const { result } = renderHook(() => usePageTranslationSession())
      act(() => {
        setPageTranslationDocument(firstDocument.id)
        toggleAutomaticPageTranslation()
      })
      const view = renderPortal(firstDocument, 1)
      // The page on screen when automatic translation is on opens at once.
      expect(result.current.openPages).toEqual([1])
      const goTo = (currentPage: number) =>
        view.rerender(
          <PageTranslationPortal
            document={firstDocument}
            currentPage={currentPage}
            citations={[]}
            provider={provider}
            onAiRequest={onAiRequest}
          />,
        )

      goTo(2)
      goTo(3)
      act(() => vi.advanceTimersByTime(autoOpenDelayMs))
      expect(result.current.openPages).toEqual([1, 3])

      for (const page of [4, 5]) {
        goTo(page)
        act(() => vi.advanceTimersByTime(autoOpenDelayMs))
      }
      expect(result.current.openPages).toEqual([1, 3, 4, 5])
      view.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it("opens panes on the new board after another paper's reader is replaced", () => {
    document.body.innerHTML = ""
    // The reader remounts per paper, so the outgoing board is still in the DOM while the new
    // reader renders and is removed in the same commit.
    function Reader({ paper }: { readonly paper: DocumentRecord }) {
      return (
        <>
          <div className="board-world" data-paper={paper.id} />
          <PageTranslationPortal
            document={paper}
            currentPage={1}
            citations={[]}
            provider={provider}
            onAiRequest={onAiRequest}
          />
        </>
      )
    }
    const view = render(<Reader key={firstDocument.id} paper={firstDocument} />)
    view.rerender(<Reader key={secondDocument.id} paper={secondDocument} />)

    act(() => openPageTranslation(1))

    const pane = document.querySelector('.board-world [data-page="1"]')
    expect(pane?.closest(".board-world")).toHaveAttribute("data-paper", secondDocument.id)
  })
})
