import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"

const PDF_URL_PATTERN = /https:\/\/[^\s<>"')]+/iu

export type ViewerSession = {
  readonly viewer: PDFViewer
  readonly pdf: PDFDocumentProxy
  readonly loadingTask: PDFDocumentLoadingTask
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
