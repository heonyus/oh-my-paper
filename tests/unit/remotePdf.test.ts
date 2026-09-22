// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadRemotePdf, RemotePdfError, resolveRemotePdfUrl } from "../../src/shared/remotePdf"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveRemotePdfUrl", () => {
  it("maps arXiv abs and html pages to the PDF", async () => {
    await expect(resolveRemotePdfUrl("https://arxiv.org/abs/2401.12345")).resolves.toBe(
      "https://arxiv.org/pdf/2401.12345",
    )
    await expect(resolveRemotePdfUrl("https://arxiv.org/abs/2401.12345v2")).resolves.toBe(
      "https://arxiv.org/pdf/2401.12345v2",
    )
    await expect(resolveRemotePdfUrl("https://arxiv.org/html/2401.12345v1")).resolves.toBe(
      "https://arxiv.org/pdf/2401.12345v1",
    )
    await expect(resolveRemotePdfUrl("https://arxiv.org/pdf/2401.12345")).resolves.toBe(
      "https://arxiv.org/pdf/2401.12345",
    )
  })

  it("maps an OpenReview forum link to its PDF", async () => {
    await expect(resolveRemotePdfUrl("https://openreview.net/forum?id=abc123")).resolves.toBe(
      "https://openreview.net/pdf?id=abc123",
    )
    await expect(resolveRemotePdfUrl("https://openreview.net/pdf?id=abc123")).resolves.toBe(
      "https://openreview.net/pdf?id=abc123",
    )
  })

  it("maps an ACL Anthology paper page to its PDF", async () => {
    await expect(resolveRemotePdfUrl("https://aclanthology.org/2024.acl-long.1/")).resolves.toBe(
      "https://aclanthology.org/2024.acl-long.1.pdf",
    )
    await expect(resolveRemotePdfUrl("https://aclanthology.org/P19-1001")).resolves.toBe(
      "https://aclanthology.org/P19-1001.pdf",
    )
    await expect(resolveRemotePdfUrl("https://aclanthology.org/venues/acl/")).resolves.toBe(
      "https://aclanthology.org/venues/acl/",
    )
  })

  it("resolves a Semantic Scholar paper through the openAccessPdf API", async () => {
    const paperId = "204e3073870fae3d05bcbc2f6a8e263d9b72e776"
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              openAccessPdf: { url: "https://arxiv.org/pdf/1706.03762" },
              externalIds: { ArXiv: "1706.03762" },
            }),
            { status: 200 },
          ),
      ),
    )
    await expect(
      resolveRemotePdfUrl(`https://www.semanticscholar.org/paper/some-title/${paperId}`),
    ).resolves.toBe("https://arxiv.org/pdf/1706.03762")
  })

  it("falls back to the arXiv external id when openAccessPdf is missing", async () => {
    const paperId = "204e3073870fae3d05bcbc2f6a8e263d9b72e776"
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ openAccessPdf: null, externalIds: { ArXiv: "1706.03762" } }),
            { status: 200 },
          ),
      ),
    )
    await expect(
      resolveRemotePdfUrl(`https://www.semanticscholar.org/paper/x/${paperId}`),
    ).resolves.toBe("https://arxiv.org/pdf/1706.03762")
  })

  it("resolves a relative openAccessPdf URL against the API origin", async () => {
    const paperId = "204e3073870fae3d05bcbc2f6a8e263d9b72e776"
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ openAccessPdf: { url: "/paper/abc.pdf" } }), {
            status: 200,
          }),
      ),
    )
    await expect(
      resolveRemotePdfUrl(`https://www.semanticscholar.org/paper/x/${paperId}`),
    ).resolves.toBe("https://api.semanticscholar.org/paper/abc.pdf")
  })

  it("returns unknown links unchanged and rejects non-http schemes", async () => {
    await expect(resolveRemotePdfUrl("https://example.com/paper.pdf")).resolves.toBe(
      "https://example.com/paper.pdf",
    )
    await expect(resolveRemotePdfUrl("file:///etc/passwd")).rejects.toBeInstanceOf(RemotePdfError)
    await expect(resolveRemotePdfUrl("not a url")).rejects.toBeInstanceOf(RemotePdfError)
  })
})

describe("downloadRemotePdf", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

  it("accepts a real PDF payload and derives a file name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pdfBytes, { status: 200 })),
    )
    const result = await downloadRemotePdf("https://arxiv.org/pdf/2401.12345")
    expect(result.fileName).toBe("2401.12345.pdf")
    expect(result.bytes.byteLength).toBe(pdfBytes.byteLength)
  })

  it("rejects a non-PDF payload even when the URL ends with .pdf", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>not a pdf</html>", { status: 200 })),
    )
    await expect(downloadRemotePdf("https://example.com/paper.pdf")).rejects.toMatchObject({
      kind: "not_pdf",
    })
  })

  it("rejects an oversized payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(pdfBytes, {
            status: 200,
            headers: { "content-length": String(101 * 1024 * 1024) },
          }),
      ),
    )
    await expect(downloadRemotePdf("https://example.com/big.pdf")).rejects.toMatchObject({
      kind: "too_large",
    })
  })

  it("rejects private and loopback targets before fetching", async () => {
    const fetchMock = vi.fn(async () => new Response(pdfBytes, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    for (const url of [
      "http://127.0.0.1:8788/api/workspace",
      "http://localhost/paper.pdf",
      "http://192.168.1.1/paper.pdf",
      "http://10.0.0.2/paper.pdf",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/paper.pdf",
      "http://[::ffff:127.0.0.1]/paper.pdf",
    ]) {
      await expect(downloadRemotePdf(url)).rejects.toMatchObject({ kind: "invalid_url" })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("revalidates each redirect hop and blocks a bounce to a private host", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const target = typeof input === "string" ? input : input.toString()
      if (target === "https://example.com/paper.pdf")
        return new Response(null, {
          status: 302,
          headers: { location: "http://192.168.0.1/internal.pdf" },
        })
      return new Response(pdfBytes, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    await expect(downloadRemotePdf("https://example.com/paper.pdf")).rejects.toMatchObject({
      kind: "invalid_url",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("follows a bounded number of redirects to a PDF", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const target = typeof input === "string" ? input : input.toString()
      if (target === "https://example.com/paper.pdf")
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/real.pdf" },
        })
      return new Response(pdfBytes, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await downloadRemotePdf("https://example.com/paper.pdf")
    expect(result.bytes.byteLength).toBe(pdfBytes.byteLength)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
