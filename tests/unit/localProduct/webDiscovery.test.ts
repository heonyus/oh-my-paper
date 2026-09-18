// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import {
  type OfficialWebSearchPort,
  WebDiscoveryError,
  WebDiscoveryService,
} from "../../../src/electron/webDiscovery"
import { webSearchCapabilitySchema } from "../../../src/shared/researchSourceSchemas"

const verified = webSearchCapabilitySchema.parse({
  status: "verified",
  runtime: "codex_app_server",
  billing: "chatgpt_subscription",
  mode: "live",
  protocol: "runtime_verified",
  runtimeVerified: true,
  structuredSourceEvents: true,
})

describe("official web discovery", () => {
  it("fails closed before search when the official capability is unavailable", async () => {
    // Given
    const runSearch = vi.fn()
    const port: OfficialWebSearchPort = {
      readCapability: async () => ({
        status: "unavailable",
        reason: "search_disabled",
        detail: null,
      }),
      runSearch,
    }

    // When
    const operation = new WebDiscoveryService(port).search({ query: "bounded research" })

    // Then
    await expect(operation).rejects.toBeInstanceOf(WebDiscoveryError)
    expect(runSearch).not.toHaveBeenCalled()
  })

  it("normalizes and deduplicates only validated HTTPS source results", async () => {
    // Given
    const port: OfficialWebSearchPort = {
      readCapability: async () => verified,
      runSearch: async () => ({
        providerRequestId: "turn-item-1",
        results: [
          {
            title: "Grounded source",
            url: "https://example.org/paper#section",
            snippet: "Evidence summary",
          },
          {
            title: "Duplicate source",
            url: "https://example.org/paper",
            snippet: null,
          },
          {
            title: "A PDF",
            url: "https://example.org/files/paper.PDF?download=1",
            snippet: null,
          },
          { title: "Unsafe", url: "http://example.org/plain", snippet: null },
        ],
      }),
    }

    // When
    let id = 0
    const response = await new WebDiscoveryService(port, () => {
      id += 1
      return `123e4567-e89b-42d3-a456-${id.toString().padStart(12, "0")}`
    }).search({ query: "bounded research", maxResults: 20 })

    // Then
    expect(response.results).toHaveLength(2)
    expect(response.results.map(({ url }) => url)).toEqual([
      "https://example.org/paper",
      "https://example.org/files/paper.PDF?download=1",
    ])
    expect(response.results.map(({ kind }) => kind)).toEqual(["landing_page", "pdf"])
    expect(response.providerRequestId).toBe("turn-item-1")
  })
})
