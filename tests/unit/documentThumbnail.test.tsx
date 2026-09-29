import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DocumentThumbnail } from "../../src/renderer/components/DocumentThumbnail"
import {
  clearThumbnailCache,
  getCachedThumbnail,
  getThumbnailCacheSize,
  MAX_THUMBNAIL_CACHE_SIZE,
  storeCachedThumbnail,
} from "../../src/renderer/components/documentThumbnailCache"
import type { DocumentRecord } from "../../src/renderer/types"
import { documentRecordSchema } from "../../src/shared/schemas"

const mockTaskDestroy = vi.fn(async () => {})
const mockRenderCancel = vi.fn()
const mockRenderPromise = vi.fn(async () => {})
const mockGetPage = vi.fn(async () => ({
  getViewport: () => ({ width: 100, height: 100 }),
  render: () => ({
    promise: mockRenderPromise(),
    cancel: mockRenderCancel,
  }),
}))

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      getPage: mockGetPage,
    }),
    destroy: mockTaskDestroy,
  })),
}))

vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({
  default: "worker-url",
}))

const testDoc: DocumentRecord = documentRecordSchema.parse({
  id: "1122334455667788",
  name: "sample.pdf",
  hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  bytes: 1024,
  importedAt: "2026-09-01T00:00:00.000Z",
  pageCount: 1,
  title: "Sample Document",
  authors: [],
  year: null,
  doi: null,
  kind: "document",
  quality: { textCharacters: 100, needsOcr: false, warnings: [] },
})

describe("DocumentThumbnail and thumbnail cache", () => {
  beforeEach(() => {
    clearThumbnailCache()
    vi.clearAllMocks()
    Object.defineProperty(window, "ohmypaper", {
      value: {
        readDocument: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
      },
      configurable: true,
      writable: true,
    })
    // Provide a mocked getContext and toDataURL for canvas in jsdom
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,sample")
  })

  afterEach(() => {
    clearThumbnailCache()
  })

  it("bounds cached thumbnails and evicts oldest unaccessed entry in LRU order", () => {
    for (let i = 1; i <= MAX_THUMBNAIL_CACHE_SIZE; i++) {
      storeCachedThumbnail(`doc-${i}`, {
        dataUrl: `data:image/png;base64,${i}`,
        width: 100,
        height: 100,
        styleWidth: "100px",
        styleHeight: "100px",
      })
    }
    expect(getThumbnailCacheSize()).toBe(MAX_THUMBNAIL_CACHE_SIZE)

    // Access doc-1 to refresh its recency
    getCachedThumbnail("doc-1")

    // Insert doc-new
    storeCachedThumbnail("doc-new", {
      dataUrl: "data:image/png;base64,new",
      width: 100,
      height: 100,
      styleWidth: "100px",
      styleHeight: "100px",
    })
    expect(getThumbnailCacheSize()).toBe(MAX_THUMBNAIL_CACHE_SIZE)

    // doc-1 should still exist, doc-2 should have been evicted
    expect(getCachedThumbnail("doc-1")).toBeDefined()
    expect(getCachedThumbnail("doc-2")).toBeUndefined()
  })

  it("reuses cached thumbnail on remount and avoids repeated decode and getDocument", async () => {
    const { unmount } = render(<DocumentThumbnail document={testDoc} />)

    await waitFor(() => {
      expect(window.ohmypaper.readDocument).toHaveBeenCalledTimes(1)
      expect(mockTaskDestroy).toHaveBeenCalledTimes(1)
    })

    unmount()

    // Render again for the same document
    render(<DocumentThumbnail document={testDoc} />)

    await waitFor(() => {
      // Should NOT read or decode the document again because it is cached
      expect(window.ohmypaper.readDocument).toHaveBeenCalledTimes(1)
    })
  })

  it("cancels in-flight render task and destroys loading task on unmount", async () => {
    let unblockRender: () => void = () => {}
    mockRenderPromise.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          unblockRender = resolve
        }),
    )

    const { unmount } = render(<DocumentThumbnail document={testDoc} />)

    // Wait until readDocument has been called
    await waitFor(() => {
      expect(window.ohmypaper.readDocument).toHaveBeenCalled()
    })

    // Unmount before render promise resolves
    unmount()

    expect(mockRenderCancel).toHaveBeenCalled()
    unblockRender()
  })
})
