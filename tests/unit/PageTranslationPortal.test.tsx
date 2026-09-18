import { render, renderHook } from "@testing-library/react"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"
import { PageTranslationPortal } from "../../src/renderer/components/PageTranslationPortal"
import {
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
  it("does not reopen the new document from the previous document's auto consent", () => {
    document.body.innerHTML = '<div class="board-world"></div>'
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

  it("keeps only the bounded recent auto panes during rapid page changes", () => {
    document.body.innerHTML = '<div class="board-world"></div>'
    const { result } = renderHook(() => usePageTranslationSession())
    act(() => {
      setPageTranslationDocument(firstDocument.id)
      toggleAutomaticPageTranslation()
    })
    const view = renderPortal(firstDocument, 1)
    view.rerender(
      <PageTranslationPortal
        document={firstDocument}
        currentPage={2}
        citations={[]}
        provider={provider}
        onAiRequest={onAiRequest}
      />,
    )
    view.rerender(
      <PageTranslationPortal
        document={firstDocument}
        currentPage={3}
        citations={[]}
        provider={provider}
        onAiRequest={onAiRequest}
      />,
    )

    expect(result.current.openPages).toEqual([2, 3])
  })
})
