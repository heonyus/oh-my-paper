import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { useEffect, useState } from "react"
import { registeredPdfDocument, subscribePdfDocuments } from "./pdfDocumentRegistry"
import { type PageTextRun, pageTextRuns } from "./pdfPageTextRuns"

export type PdfPageSource = {
  readonly page: PDFPageProxy | null
  readonly runs: readonly PageTextRun[] | null
}

/** One page of the PDF the reader has open, with its text runs once their fonts are known. */
export function usePdfPage(documentId: string, pageNumber: number): PdfPageSource {
  const [source, setSource] = useState<PdfPageSource>({ page: null, runs: null })
  useEffect(() => {
    let cancelled = false
    let loadedFrom: unknown = null
    setSource({ page: null, runs: null })
    const load = (): void => {
      const pdf = registeredPdfDocument(documentId)
      if (!pdf || pdf === loadedFrom) return
      loadedFrom = pdf
      void pdf
        .getPage(pageNumber)
        .then(async (page) => {
          if (cancelled) return
          setSource({ page, runs: null })
          const runs = await pageTextRuns(page)
          if (!cancelled) setSource({ page, runs })
        })
        .catch(() => undefined)
    }
    load()
    const unsubscribe = subscribePdfDocuments(load)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [documentId, pageNumber])
  return source
}
