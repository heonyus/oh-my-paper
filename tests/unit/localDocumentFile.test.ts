import { afterEach, describe, expect, it, vi } from "vitest"
import { documentIdSchema } from "../../src/shared/schemas"
import { fetchLocalDocumentBytes } from "../../src/web/localDocumentFile"

afterEach(() => vi.unstubAllGlobals())

const id = documentIdSchema.parse("aaaaaaaaaaaaaaaa")
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])

describe("local document bytes", () => {
  it("reads the binary file route instead of a base64 JSON string", async () => {
    const fetcher = vi.fn(
      async (_input: string, _init?: RequestInit) =>
        new Response(pdf, { headers: { "content-type": "application/pdf" } }),
    )
    vi.stubGlobal("fetch", fetcher)

    const bytes = await fetchLocalDocumentBytes(id)

    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/documents/${id}/file`)
    expect([...bytes]).toEqual([...pdf])
  })

  it("surfaces the server's error code and rejects a non-PDF answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "document_not_found" }), { status: 404 }),
        )
        .mockResolvedValueOnce(
          new Response("<html></html>", { headers: { "content-type": "text/html" } }),
        ),
    )

    await expect(fetchLocalDocumentBytes(id)).rejects.toMatchObject({
      status: 404,
      code: "document_not_found",
    })
    await expect(fetchLocalDocumentBytes(id)).rejects.toMatchObject({
      code: "invalid_document_response",
    })
  })

  it("aborts the download when the caller no longer needs it", async () => {
    const fetcher = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
        }),
    )
    vi.stubGlobal("fetch", fetcher)
    const controller = new AbortController()

    const pending = fetchLocalDocumentBytes(id, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
