import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  researchRequestIdSchema,
  researchSourceIdSchema,
  type WebDiscoveryRequest,
  type WebDiscoveryResponse,
  type WebSearchCapability,
  webDiscoveryRequestSchema,
  webDiscoveryResponseSchema,
  webSearchCapabilitySchema,
} from "../shared/researchSourceSchemas"

const officialSearchOutputSchema = z
  .object({
    providerRequestId: z.string().min(1).max(500),
    results: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(2_000),
            url: z.string().max(8_000),
            snippet: z.string().max(8_000).nullable(),
          })
          .readonly(),
      )
      .max(50)
      .readonly(),
  })
  .readonly()

export interface OfficialWebSearchPort {
  readonly readCapability: () => Promise<WebSearchCapability>
  readonly runSearch: (input: {
    readonly query: string
    readonly maxResults: number
    readonly signal?: AbortSignal
  }) => Promise<z.input<typeof officialSearchOutputSchema>>
}

export class WebDiscoveryError extends Error {
  readonly name = "WebDiscoveryError"

  constructor(
    readonly kind: "capability_unavailable" | "quota" | "invalid_response" | "aborted" | "failed",
    message: string,
  ) {
    super(message)
  }
}

function normalizeSourceUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null
    url.hash = ""
    return url
  } catch {
    return null
  }
}

function isPdf(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith(".pdf")
}

function sourceKind(url: URL): "pdf" | "landing_page" {
  return isPdf(url) ? "pdf" : "landing_page"
}

export class WebDiscoveryService {
  constructor(
    private readonly port: OfficialWebSearchPort,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async capability(): Promise<WebSearchCapability> {
    return webSearchCapabilitySchema.parse(await this.port.readCapability())
  }

  async search(input: WebDiscoveryRequest, signal?: AbortSignal): Promise<WebDiscoveryResponse> {
    const request = webDiscoveryRequestSchema.parse(input)
    const capability = await this.capability()
    if (capability.status !== "verified") {
      throw new WebDiscoveryError(
        capability.reason === "quota_reached" ? "quota" : "capability_unavailable",
        capability.detail ?? `Official web search unavailable: ${capability.reason}`,
      )
    }
    if (signal?.aborted === true) throw new WebDiscoveryError("aborted", "Search cancelled")

    let output: z.input<typeof officialSearchOutputSchema>
    try {
      const options = signal === undefined ? request : { ...request, signal }
      output = await this.port.runSearch(options)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new WebDiscoveryError("aborted", "Search cancelled")
      }
      throw error
    }

    let raw: z.infer<typeof officialSearchOutputSchema>
    try {
      raw = officialSearchOutputSchema.parse(output)
    } catch (error) {
      throw new WebDiscoveryError(
        "invalid_response",
        error instanceof Error ? error.message : "Official search returned an invalid response",
      )
    }

    const seen = new Set<string>()
    const results = []
    for (const result of raw.results) {
      if (results.length >= request.maxResults) break
      const url = normalizeSourceUrl(result.url)
      if (url === null || seen.has(url.href)) continue
      seen.add(url.href)
      results.push({
        sourceId: researchSourceIdSchema.parse(this.idFactory()),
        title: result.title,
        url: url.href,
        snippet: result.snippet,
        kind: sourceKind(url),
      })
    }

    return webDiscoveryResponseSchema.parse({
      requestId: researchRequestIdSchema.parse(this.idFactory()),
      providerRequestId: raw.providerRequestId,
      capability,
      results,
    })
  }
}
