import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DocumentThumbnail } from "../../src/renderer/components/DocumentThumbnail"
import { documentThumbnails } from "../../src/renderer/lib/thumbnailLoader"
import type { DocumentRecord } from "../../src/renderer/types"
import type { OhMyPaperApi } from "../../src/shared/ipc"
import { documentRecordSchema } from "../../src/shared/schemas"

const mockTaskDestroy = vi.fn(async () => {})
const mockRenderCancel = vi.fn()
const mockRenderPromise = vi.fn(async () => {})
type RenderTask = { readonly promise: Promise<void>; readonly cancel: () => void }
const mockRender = vi.fn(
  (): RenderTask => ({ promise: mockRenderPromise(), cancel: mockRenderCancel }),
)
const mockGetDocument = vi.fn((_source: { readonly data: Uint8Array }) => ({
  promise: Promise.resolve({
    getPage: async () => ({
      getViewport: ({ scale }: { readonly scale: number }) => ({
        width: 100 * scale,
        height: 130 * scale,
      }),
      render: mockRender,
    }),
  }),
  destroy: mockTaskDestroy,
}))

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (source: { readonly data: Uint8Array }) => mockGetDocument(source),
}))

vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({
  default: "worker-url",
}))

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
const readDocument = vi.fn<OhMyPaperApi["readDocument"]>(async () => pdfBytes)

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

const createObjectURL = vi.fn((_image: Blob) => "blob:thumbnail")
const revokeObjectURL = vi.fn((_url: string) => undefined)
const replaced: [object, string, PropertyDescriptor | undefined][] = []

/** jsdom has no canvas or object URLs; stand them in for the duration of a test. */
function replace(target: object, key: string, value: unknown): void {
  replaced.push([target, key, Object.getOwnPropertyDescriptor(target, key)])
  Object.defineProperty(target, key, { value, configurable: true, writable: true })
}

describe("DocumentThumbnail", () => {
  beforeEach(() => {
    documentThumbnails.clearMemory()
    vi.clearAllMocks()
    replace(window, "ohmypaper", { readDocument })
    replace(HTMLCanvasElement.prototype, "getContext", () => ({}))
    replace(HTMLCanvasElement.prototype, "toBlob", (callback: BlobCallback, type?: string) =>
      callback(new Blob(["thumbnail"], { type: type ?? "image/png" })),
    )
    replace(URL, "createObjectURL", createObjectURL)
    replace(URL, "revokeObjectURL", revokeObjectURL)
  })

  afterEach(() => {
    cleanup()
    documentThumbnails.clearMemory()
    for (const [target, key, descriptor] of replaced.splice(0).reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
  })

  it("renders the first page from PDF bytes into a compact image at a fixed density", async () => {
    render(<DocumentThumbnail document={testDoc} />)

    const image = await screen.findByRole("img", { name: "Sample Document 첫 페이지 미리보기" })
    expect(readDocument).toHaveBeenCalledWith(testDoc.id, expect.any(AbortSignal))
    expect(mockGetDocument.mock.calls[0]?.[0].data).toBe(pdfBytes)
    expect(image).toHaveAttribute("srcset", "blob:thumbnail 2x")
    expect(image.closest(".document-thumbnail")).toHaveAttribute("data-rendered", "false")

    fireEvent.load(image)
    expect(image.closest(".document-thumbnail")).toHaveAttribute("data-rendered", "true")
    expect(mockTaskDestroy).toHaveBeenCalledTimes(1)
  })

  it("reuses the session thumbnail on remount without reading the PDF again", async () => {
    const { unmount } = render(<DocumentThumbnail document={testDoc} />)
    await screen.findByRole("img")
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail")

    render(<DocumentThumbnail document={testDoc} />)

    expect(screen.getByRole("img")).toBeInTheDocument()
    expect(readDocument).toHaveBeenCalledTimes(1)
    expect(mockGetDocument).toHaveBeenCalledTimes(1)
  })

  it("cancels the in-flight render and its download when it unmounts", async () => {
    let cancelRender: () => void = () => undefined
    mockRender.mockImplementationOnce(() => ({
      promise: new Promise<void>((_resolve, reject) => {
        cancelRender = () => reject(new Error("RenderingCancelledException"))
      }),
      cancel: () => {
        mockRenderCancel()
        cancelRender()
      },
    }))
    const { unmount } = render(<DocumentThumbnail document={testDoc} />)
    await waitFor(() => expect(mockRender).toHaveBeenCalled())

    unmount()

    expect(mockRenderCancel).toHaveBeenCalled()
    expect(readDocument.mock.calls[0]?.[1]?.aborted).toBe(true)
    await waitFor(() => expect(mockTaskDestroy).toHaveBeenCalled())
  })

  it("keeps the file icon when the paper cannot be rendered", async () => {
    readDocument.mockRejectedValueOnce(new Error("document_file_missing"))
    const { container } = render(<DocumentThumbnail document={testDoc} />)

    await waitFor(() => expect(readDocument).toHaveBeenCalled())
    await Promise.resolve()

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(container.querySelector(".document-thumbnail svg")).not.toBeNull()
  })
})
