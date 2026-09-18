import { describe, expect, it } from "vitest"
import { readPdfUpload, WebUploadError } from "../../src/worker/upload"

function pdfRequest(bytes: Uint8Array<ArrayBuffer>, name = "paper.pdf"): Request {
  return new Request("http://localhost/api/documents", {
    method: "POST",
    headers: {
      "content-length": String(bytes.byteLength),
      "content-type": "application/pdf",
      "x-document-name": encodeURIComponent(name),
    },
    body: bytes,
  })
}

describe("web PDF upload boundary", () => {
  it("accepts a bounded PDF and returns stable metadata", async () => {
    const result = await readPdfUpload(pdfRequest(new TextEncoder().encode("%PDF-1.7\nbody")))

    expect(result.name).toBe("paper.pdf")
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.bytes.byteLength).toBe(13)
  })

  it("rejects content that only claims to be a PDF", async () => {
    await expect(readPdfUpload(pdfRequest(new TextEncoder().encode("not a pdf")))).rejects.toEqual(
      new WebUploadError("invalid_pdf"),
    )
  })
})
