import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { EventBus, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import type { OhMyPaperApi } from "../../shared/ipc"

const PDF_URL_PATTERN = /https:\/\/[^\s<>"')]+/iu

export type ViewerSession = {
  readonly viewer: PDFViewer
  readonly pdf: PDFDocumentProxy
  readonly loadingTask: PDFDocumentLoadingTask
  readonly preparation?: Promise<void>
}

export function disposeViewerSession(session: ViewerSession): void {
  void (session.preparation ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => session.loadingTask.destroy())
}

export function urlFromPdfText(value: string): string | null {
  const match = value.match(PDF_URL_PATTERN)?.[0]
  return match ? match.replace(/[.,;:)]+$/u, "") : null
}

export function urlFromPdfClickTarget(_target: EventTarget | null): string | null {
  if (!(_target instanceof Element)) return null
  const anchor = _target.closest<HTMLAnchorElement>("a[href]")
  if (anchor) {
    try {
      const url = new URL(anchor.href)
      return url.protocol === "https:" ? url.toString() : null
    } catch {
      return null
    }
  }
  const textLeaf = _target.closest<HTMLElement>(".textLayer span, .pdf-link-text")
  return textLeaf ? urlFromPdfText(textLeaf.textContent ?? "") : null
}

export function bindPdfExternalLinks(
  container: HTMLElement,
  openExternal: OhMyPaperApi["openExternal"],
): () => void {
  const handleClick = (event: MouseEvent): void => {
    const url = urlFromPdfClickTarget(event.target)
    if (!url) return
    event.preventDefault()
    event.stopPropagation()
    void openExternal({ url })
  }
  container.addEventListener("click", handleClick, true)
  return () => container.removeEventListener("click", handleClick, true)
}

export function pageJumpHandler(
  viewer: PDFViewer,
  onPageJump?: ((page: number, pageElement: HTMLElement) => void) | undefined,
): (page: number) => void {
  return (page) => {
    viewer.currentPageNumber = page
    viewer.scrollPageIntoView({ pageNumber: page })
    const pageElement = viewer.getPageView(page - 1)?.div
    if (pageElement) onPageJump?.(page, pageElement)
  }
}

/** How long work that follows the first page waits for a page that never draws. */
const FIRST_PAGE_GRACE_MS = 1_500

/**
 * Resolves once PDF.js has drawn a page of the paper just opened; also after `graceMs` when
 * none is drawn, and at once when `signal` aborts. Reading the whole paper (its text, outline
 * and search index) waits on this, so that work no longer runs on the main thread ahead of the
 * page the reader is waiting to see.
 */
export function firstPageDrawn(
  eventBus: Pick<EventBus, "on" | "off">,
  signal?: AbortSignal,
  graceMs = FIRST_PAGE_GRACE_MS,
): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      eventBus.off("pagerendered", finish)
      signal?.removeEventListener("abort", finish)
      resolve()
    }
    const timer = setTimeout(finish, graceMs)
    eventBus.on("pagerendered", finish)
    if (signal?.aborted) finish()
    else signal?.addEventListener("abort", finish, { once: true })
  })
}
