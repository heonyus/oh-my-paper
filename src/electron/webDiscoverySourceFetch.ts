import { createHash } from "node:crypto"
import type { ResearchSource, WebDiscoveryResult } from "../shared/researchSourceSchemas"
import { researchSourceSchema } from "../shared/researchSourceSchemas"
import {
  type AddressResolver,
  normalizePublicHttpsUrl,
  requirePublicAddress,
  resolveAddresses,
  SourcePolicyError,
} from "./webDiscoverySourcePolicy"
import {
  defaultSourceTransport,
  type SourceHttpResponse,
  type SourceHttpTransport,
} from "./webDiscoveryTransport"

export type { SourceHttpResponse, SourceHttpTransport } from "./webDiscoveryTransport"

export interface SourceFetchLimits {
  readonly htmlBytes: number
  readonly pdfBytes: number
  readonly timeoutMs: number
  readonly redirects: number
}

type SourceFetchErrorKind =
  | "invalid_url"
  | "private_address"
  | "dns"
  | "redirect_limit"
  | "content_type"
  | "oversized"
  | "timeout"
  | "network"
  | "http_status"
  | "paywall"
  | "aborted"

export class SourceFetchError extends Error {
  readonly name = "SourceFetchError"

  constructor(
    readonly kind: SourceFetchErrorKind,
    message: string,
  ) {
    super(message)
  }
}

const defaultLimits: SourceFetchLimits = {
  htmlBytes: 5 * 1024 * 1024,
  pdfBytes: 100 * 1024 * 1024,
  timeoutMs: 30_000,
  redirects: 5,
}

function headerValue(headers: SourceHttpResponse["headers"], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()]
  return typeof value === "string" ? value : value?.[0]
}

async function readBounded(body: AsyncIterable<Uint8Array>, maximum: number): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of body) {
    size += chunk.byteLength
    if (size > maximum) throw new SourceFetchError("oversized", "Source exceeds its byte limit")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  return await new Promise<T>((resolve, reject) => {
    const aborted = (): void => reject(signal.reason)
    signal.addEventListener("abort", aborted, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener("abort", aborted)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted)
        reject(error)
      },
    )
  })
}

function htmlToText(html: string): string {
  // ponytail: regex extraction is capped at 5 MB; replace with a sandboxed parser if layout fidelity is needed.
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode)
}

export function createSourceFetcher(
  options: {
    readonly resolve?: AddressResolver
    readonly transport?: SourceHttpTransport
    readonly limits?: SourceFetchLimits
    readonly clock?: () => string
  } = {},
) {
  const resolver = options.resolve ?? resolveAddresses
  const transport = options.transport ?? defaultSourceTransport
  const limits = options.limits ?? defaultLimits
  const clock = options.clock ?? (() => new Date().toISOString())

  return {
    async fetch(source: WebDiscoveryResult, externalSignal?: AbortSignal): Promise<ResearchSource> {
      const timeoutSignal = AbortSignal.timeout(limits.timeoutMs)
      const signal =
        externalSignal === undefined
          ? timeoutSignal
          : AbortSignal.any([externalSignal, timeoutSignal])
      let currentUrl = source.url

      try {
        for (let hop = 0; hop <= limits.redirects; hop += 1) {
          const url = normalizePublicHttpsUrl(currentUrl)
          const address = requirePublicAddress(await abortable(resolver(url.hostname), signal))
          const maximum = Math.max(limits.htmlBytes, limits.pdfBytes)
          const response = await transport({
            url,
            address,
            signal,
            timeoutMs: limits.timeoutMs,
            maxBytes: maximum,
          })
          try {
            if (isRedirect(response.statusCode)) {
              const location = headerValue(response.headers, "location")
              if (location === undefined || hop === limits.redirects) {
                throw new SourceFetchError("redirect_limit", "Source redirect limit reached")
              }
              currentUrl = new URL(location, url).href
              continue
            }
            if ([401, 402, 403].includes(response.statusCode)) {
              throw new SourceFetchError("paywall", "Source requires authorization or payment")
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
              throw new SourceFetchError(
                "http_status",
                `Source returned HTTP ${response.statusCode}`,
              )
            }

            const contentType = (headerValue(response.headers, "content-type") ?? "")
              .split(";", 1)[0]
              ?.trim()
              .toLowerCase()
            const isPdfResponse = contentType === "application/pdf"
            const acceptedHtml = ["text/html", "application/xhtml+xml", "text/plain"].includes(
              contentType ?? "",
            )
            if ((!isPdfResponse && !acceptedHtml) || (source.kind === "pdf" && !isPdfResponse)) {
              throw new SourceFetchError(
                "content_type",
                "Source returned an unsupported content type",
              )
            }
            const cap = isPdfResponse ? limits.pdfBytes : limits.htmlBytes
            const contentLength = Number(headerValue(response.headers, "content-length"))
            if (Number.isFinite(contentLength) && contentLength > cap) {
              throw new SourceFetchError("oversized", "Source exceeds its byte limit")
            }
            const bytes = await readBounded(response.body, cap)
            const contentHash = createHash("sha256").update(bytes).digest("hex")
            if (isPdfResponse) {
              if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
                throw new SourceFetchError("content_type", "PDF response does not contain PDF data")
              }
              return researchSourceSchema.parse({
                id: source.sourceId,
                title: source.title,
                url: source.url,
                finalUrl: url.href,
                page: null,
                snippet: source.snippet,
                access: "pdf_binary",
                origin: "web",
                contentType: "application/pdf",
                byteLength: bytes.byteLength,
                contentHash,
                content: null,
                fetchedAt: clock(),
              })
            }

            const content = htmlToText(bytes.toString("utf8")).slice(0, 500_000)
            if (content === "")
              throw new SourceFetchError("content_type", "Source has no readable text")
            if (/\b(?:subscribe|sign in to continue|purchase this article)\b/i.test(content)) {
              throw new SourceFetchError("paywall", "Source appears to be access restricted")
            }
            return researchSourceSchema.parse({
              id: source.sourceId,
              title: source.title,
              url: source.url,
              finalUrl: url.href,
              page: null,
              snippet: content.slice(0, 16_000),
              access: "html_excerpt",
              origin: "web",
              contentType,
              byteLength: bytes.byteLength,
              contentHash,
              content,
              fetchedAt: clock(),
            })
          } finally {
            await response.close?.()
          }
        }
        throw new SourceFetchError("redirect_limit", "Source redirect limit reached")
      } catch (error) {
        if (error instanceof SourceFetchError) throw error
        if (error instanceof SourcePolicyError)
          throw new SourceFetchError(error.kind, error.message)
        if (externalSignal?.aborted === true) {
          throw new SourceFetchError("aborted", "Source fetch cancelled")
        }
        if (timeoutSignal.aborted) throw new SourceFetchError("timeout", "Source fetch timed out")
        throw new SourceFetchError(
          "network",
          error instanceof Error ? error.message : "Source fetch failed",
        )
      }
    },
  }
}
