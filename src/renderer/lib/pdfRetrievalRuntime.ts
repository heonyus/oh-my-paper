import type { PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import type { PdfRetrievalIndex, PdfRetrievalResult } from "./pdfSearch"

type ActiveRetrieval = {
  readonly page: number
  readonly query: string
}

export type PdfRetrievalRuntime = {
  readonly index: PdfRetrievalIndex
  readonly activate: (result: PdfRetrievalResult, query: string) => void
  readonly clear: () => void
}

export type PdfRetrievalSession = {
  readonly runtime: PdfRetrievalRuntime
  readonly applyToRenderedPage: (page: number, pageElement: HTMLElement) => void
  readonly dispose: () => void
}

type PdfRetrievalSessionOptions = {
  readonly viewer: PDFViewer
  readonly container: HTMLElement
  readonly index: PdfRetrievalIndex
  readonly onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined
}

function queryTerms(query: string): readonly string[] {
  return query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []
}

function clearMarks(container: HTMLElement): void {
  for (const marked of container.querySelectorAll<HTMLElement>(".document-retrieval-hit")) {
    marked.classList.remove("document-retrieval-hit")
  }
}

function markPage(pageElement: HTMLElement, query: string): void {
  const terms = queryTerms(query)
  if (terms.length === 0) return
  for (const span of pageElement.querySelectorAll<HTMLElement>(".textLayer span")) {
    const text = span.textContent?.toLocaleLowerCase() ?? ""
    if (terms.some((term) => text.includes(term))) span.classList.add("document-retrieval-hit")
  }
}

export function createPdfRetrievalSession(
  options: PdfRetrievalSessionOptions,
): PdfRetrievalSession {
  let active: ActiveRetrieval | null = null

  function applyToRenderedPage(page: number, pageElement: HTMLElement): void {
    if (active?.page !== page) return
    markPage(pageElement, active.query)
  }

  function clear(): void {
    active = null
    clearMarks(options.container)
  }

  const runtime: PdfRetrievalRuntime = {
    index: options.index,
    activate: (result, query) => {
      clearMarks(options.container)
      active = { page: result.page, query }
      options.viewer.currentPageNumber = result.page
      options.viewer.scrollPageIntoView({ pageNumber: result.page })
      const pageElement = options.viewer.getPageView(result.page - 1)?.div
      if (!pageElement) return
      applyToRenderedPage(result.page, pageElement)
      options.onPageJump?.(result.page, pageElement)
    },
    clear,
  }

  return { runtime, applyToRenderedPage, dispose: clear }
}
