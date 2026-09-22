import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
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
