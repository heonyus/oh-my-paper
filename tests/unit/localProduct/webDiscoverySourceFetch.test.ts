// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import {
  createSourceFetcher,
  type SourceFetchError,
  type SourceHttpTransport,
} from "../../../src/electron/webDiscoverySourceFetch"
import type { ResolvedAddress } from "../../../src/electron/webDiscoverySourcePolicy"
import { webDiscoveryResultSchema } from "../../../src/shared/researchSourceSchemas"

const source = webDiscoveryResultSchema.parse({
  sourceId: "123e4567-e89b-42d3-a456-426614174001",
  title: "Synthetic source",
  url: "https://public.example/start",
  snippet: "Search snippet",
  kind: "landing_page",
})

function body(...chunks: readonly string[]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) yield new TextEncoder().encode(chunk)
  })()
}

const publicAddress: ResolvedAddress = { address: "1.1.1.1", family: 4 }

describe("safe source retrieval", () => {
  it("revalidates every redirect and refuses private destinations before dispatch", async () => {
    // Given
    const transport: SourceHttpTransport = vi.fn(async () => ({
      statusCode: 302,
      headers: { location: "https://metadata.example/latest" },
      body: body("redirect"),
    }))
    const resolve = vi.fn(async (hostname: string) =>
      hostname === "metadata.example"
        ? [{ address: "169.254.169.254", family: 4 } satisfies ResolvedAddress]
        : [publicAddress],
    )

    // When
    const operation = createSourceFetcher({ resolve, transport }).fetch(source)

    // Then
    await expect(operation).rejects.toMatchObject({ kind: "private_address" })
    expect(transport).toHaveBeenCalledOnce()
  })

  it("rejects HTML mislabeled as a PDF", async () => {
    // Given
    const transport: SourceHttpTransport = async () => ({
      statusCode: 200,
      headers: { "content-type": "application/pdf" },
      body: body("<html><body>not a pdf</body></html>"),
    })

    // When
    const operation = createSourceFetcher({
      resolve: async () => [publicAddress],
      transport,
    }).fetch({
      ...source,
      kind: "pdf",
    })

    // Then
    await expect(operation).rejects.toMatchObject({ kind: "content_type" })
  })

  it("extracts inert readable text through a validated public redirect", async () => {
    // Given
    let calls = 0
    const transport: SourceHttpTransport = async () => {
      calls += 1
      return calls === 1
        ? {
            statusCode: 301,
            headers: { location: "/article" },
            body: body("redirect"),
          }
        : {
            statusCode: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
            body: body(
              "<html><head><title>Ignored</title><script>steal()</script></head>",
              "<body><h1>Grounded result</h1><p>Precise evidence.</p></body></html>",
            ),
          }
    }

    // When
    const result = await createSourceFetcher({
      resolve: async () => [publicAddress],
      transport,
      clock: () => "2026-09-06T00:00:00.000Z",
    }).fetch(source)

    // Then
    expect(result).toMatchObject({
      access: "html_excerpt",
      finalUrl: "https://public.example/article",
      content: "Ignored Grounded result Precise evidence.",
    })
    expect(result.content).not.toContain("steal")
  })

  it("bounds the streamed body before retaining excess content", async () => {
    // Given
    const transport: SourceHttpTransport = async () => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: body("12345", "67890"),
    })
    const fetcher = createSourceFetcher({
      resolve: async () => [publicAddress],
      transport,
      limits: { htmlBytes: 8, pdfBytes: 20, timeoutMs: 30_000, redirects: 5 },
    })

    // When
    const operation = fetcher.fetch(source)

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "SourceFetchError",
      kind: "oversized",
    } satisfies Partial<SourceFetchError>)
  })
})
