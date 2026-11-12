import type { PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs"
import { describe, expect, it, vi } from "vitest"
import { createPdfRetrievalSession } from "../../src/renderer/lib/pdfRetrievalRuntime"
import { buildPdfRetrievalIndex } from "../../src/renderer/lib/pdfSearch"

describe("pdf retrieval session", () => {
  it("builds the paper's index the first time it is read, and only once", () => {
    const build = vi.fn(() => buildPdfRetrievalIndex(["Attention is all you need."]))
    const session = createPdfRetrievalSession({
      viewer: {} as PDFViewer,
      container: document.createElement("div"),
      index: build,
    })
    expect(build).not.toHaveBeenCalled()

    const index = session.runtime.index
    expect(index.chunks).toHaveLength(1)
    expect(session.runtime.index).toBe(index)
    expect(build).toHaveBeenCalledOnce()
  })
})
