import { describe, expect, it, vi } from "vitest"
import {
  cachedPdfDocumentAnalysis,
  clearAllPdfDocumentAnalyses,
  clearPdfDocumentAnalysis,
  getPdfAnalysisCacheSize,
  MAX_CACHED_ANALYSES,
} from "../../src/renderer/lib/pdfAnalysisCache"
import type { PdfDocumentAnalysis } from "../../src/renderer/lib/pdfDocumentFeatures"

const analysis = {
  summary: {
    pages: 3,
    title: "Paper",
    textCharacters: 300,
    anchorCount: 12,
    needsOcr: false,
    kind: "research_paper",
    citations: [],
  },
  bibliography: {},
  pageTexts: [],
} satisfies PdfDocumentAnalysis

describe("PDF analysis cache", () => {
  it("reuses the all-page analysis when returning from the library", async () => {
    clearAllPdfDocumentAnalyses()
    const load = vi.fn(async () => analysis)

    await cachedPdfDocumentAnalysis("aabbccddeeff0011", load)
    await cachedPdfDocumentAnalysis("aabbccddeeff0011", load)

    expect(load).toHaveBeenCalledOnce()
    clearPdfDocumentAnalysis("aabbccddeeff0011")
  })

  it("bounds the cache to MAX_CACHED_ANALYSES and evicts oldest unaccessed entry in LRU order", async () => {
    clearAllPdfDocumentAnalyses()
    const loader = vi.fn(async () => analysis)

    // Fill cache up to capacity
    for (let i = 1; i <= MAX_CACHED_ANALYSES; i++) {
      await cachedPdfDocumentAnalysis(`doc-${i}`, loader)
    }
    expect(getPdfAnalysisCacheSize()).toBe(MAX_CACHED_ANALYSES)

    // Re-access doc-1 to make it most recently used; doc-2 is now the oldest
    await cachedPdfDocumentAnalysis("doc-1", loader)

    // Add one more document beyond capacity
    await cachedPdfDocumentAnalysis("doc-new", loader)
    expect(getPdfAnalysisCacheSize()).toBe(MAX_CACHED_ANALYSES)

    // doc-1 should still be cached (load not called again for doc-1)
    const prevCalls = loader.mock.calls.length
    await cachedPdfDocumentAnalysis("doc-1", loader)
    expect(loader.mock.calls.length).toBe(prevCalls)

    // doc-2 was evicted, so accessing it should invoke load again
    await cachedPdfDocumentAnalysis("doc-2", loader)
    expect(loader.mock.calls.length).toBe(prevCalls + 1)

    clearAllPdfDocumentAnalyses()
  })

  it("does not retain failed analyses in cache", async () => {
    clearAllPdfDocumentAnalyses()
    const failLoader = vi.fn(async () => {
      throw new Error("corrupt pdf")
    })

    await expect(cachedPdfDocumentAnalysis("doc-fail", failLoader)).rejects.toThrow("corrupt pdf")
    expect(getPdfAnalysisCacheSize()).toBe(0)
  })
})
