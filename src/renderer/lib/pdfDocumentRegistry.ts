import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"

const documents = new Map<string, PDFDocumentProxy>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Shares the PDF the reader opened, so a translation view can render and read its pages
 * without loading the file a second time. Returns the call that withdraws it.
 */
export function registerPdfDocument(documentId: string, pdf: PDFDocumentProxy): () => void {
  documents.set(documentId, pdf)
  notify()
  return () => {
    if (documents.get(documentId) !== pdf) return
    documents.delete(documentId)
    notify()
  }
}

export function registeredPdfDocument(documentId: string): PDFDocumentProxy | null {
  return documents.get(documentId) ?? null
}

export function subscribePdfDocuments(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
