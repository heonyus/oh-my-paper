import type { PdfDocumentAnalysis } from "./pdfDocumentFeatures"

export const MAX_CACHED_ANALYSES = 8
const analysisCache = new Map<string, Promise<PdfDocumentAnalysis>>()

export function cachedPdfDocumentAnalysis(
  documentId: string,
  load: () => Promise<PdfDocumentAnalysis>,
): Promise<PdfDocumentAnalysis> {
  const cached = analysisCache.get(documentId)
  if (cached) {
    // Refresh LRU recency by re-inserting at the end of map iteration order
    analysisCache.delete(documentId)
    analysisCache.set(documentId, cached)
    return cached
  }
  if (analysisCache.size >= MAX_CACHED_ANALYSES) {
    const oldest = analysisCache.keys().next().value
    if (oldest !== undefined) {
      analysisCache.delete(oldest)
    }
  }
  const operation = load().catch((error: unknown) => {
    analysisCache.delete(documentId)
    throw error
  })
  analysisCache.set(documentId, operation)
  return operation
}

export function clearPdfDocumentAnalysis(documentId: string): void {
  analysisCache.delete(documentId)
}

export function clearAllPdfDocumentAnalyses(): void {
  analysisCache.clear()
}

export function getPdfAnalysisCacheSize(): number {
  return analysisCache.size
}
