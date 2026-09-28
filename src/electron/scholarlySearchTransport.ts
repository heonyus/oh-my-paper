import { request } from "undici"
import type { ScholarlyProviderErrorKind } from "../shared/scholarlySearchSchemas"

export const SCHOLARLY_REQUEST_TIMEOUT_MS = 15_000
export const SCHOLARLY_MAX_BODY_BYTES = 5 * 1024 * 1024

export type ScholarlyWireResponse = {
  readonly statusCode: number
  readonly retryAfter: string | null
  readonly body: AsyncIterable<Uint8Array>
}

export type ScholarlyRequestInit = {
  readonly method?: "GET" | "POST"
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

export type ScholarlyWire = (input: {
  readonly url: URL
  readonly signal: AbortSignal
  readonly init?: ScholarlyRequestInit
}) => Promise<ScholarlyWireResponse>

export type ScholarlyTransportResponse = {
  readonly statusCode: number
  readonly body: string
  readonly retryAfterSeconds: number | null
}

export type ScholarlyTransport = (
  url: URL,
  signal?: AbortSignal,
  init?: ScholarlyRequestInit,
) => Promise<ScholarlyTransportResponse>

export class ScholarlyTransportError extends Error {
  readonly name = "ScholarlyTransportError"

  constructor(
    readonly kind: Extract<
      ScholarlyProviderErrorKind,
      "timeout" | "oversized" | "cancelled" | "network"
    >,
    options?: ErrorOptions,
  ) {
    super(`Scholarly metadata request failed: ${kind}`, options)
  }
}

async function undiciWire(input: {
  readonly url: URL
  readonly signal: AbortSignal
  readonly init?: ScholarlyRequestInit
}): Promise<ScholarlyWireResponse> {
  const response = await request(input.url, {
    method: input.init?.method ?? "GET",
    headers: {
      accept:
        input.url.hostname === "export.arxiv.org" ? "application/atom+xml" : "application/json",
      "user-agent": "oh-my-paper/2.0 (https://github.com/heonyus/oh-my-paper)",
      ...input.init?.headers,
    },
    ...(input.init?.body === undefined ? {} : { body: input.init.body }),
    headersTimeout: SCHOLARLY_REQUEST_TIMEOUT_MS,
    bodyTimeout: SCHOLARLY_REQUEST_TIMEOUT_MS,
    maxRedirections: 0,
    signal: input.signal,
  })
  const retryAfter = response.headers["retry-after"]
  return {
    statusCode: response.statusCode,
    retryAfter: Array.isArray(retryAfter) ? (retryAfter[0] ?? null) : (retryAfter ?? null),
    body: response.body,
  }
}

function retryAfterSeconds(value: string | null): number | null {
  if (value === null) return null
  const seconds = Number(value)
  if (Number.isInteger(seconds) && seconds >= 0) return seconds
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1_000)) : null
}

export function createScholarlyTransport(
  options: {
    readonly wire?: ScholarlyWire
    readonly timeoutMs?: number
    readonly maxBodyBytes?: number
  } = {},
): ScholarlyTransport {
  const wire = options.wire ?? undiciWire
  const timeoutMs = options.timeoutMs ?? SCHOLARLY_REQUEST_TIMEOUT_MS
  const maxBodyBytes = options.maxBodyBytes ?? SCHOLARLY_MAX_BODY_BYTES
  return async (url, signal, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    try {
      const response = await wire({
        url,
        signal: requestSignal,
        ...(init === undefined ? {} : { init }),
      })
      const decoder = new TextDecoder()
      let body = ""
      let size = 0
      for await (const chunk of response.body) {
        size += chunk.byteLength
        if (size > maxBodyBytes) throw new ScholarlyTransportError("oversized")
        body += decoder.decode(chunk, { stream: true })
      }
      body += decoder.decode()
      return {
        statusCode: response.statusCode,
        body,
        retryAfterSeconds: retryAfterSeconds(response.retryAfter),
      }
    } catch (error) {
      if (signal?.aborted) throw new ScholarlyTransportError("cancelled", { cause: error })
      if (timeoutSignal.aborted) throw new ScholarlyTransportError("timeout", { cause: error })
      if (error instanceof ScholarlyTransportError) throw error
      if (error instanceof Error) throw new ScholarlyTransportError("network", { cause: error })
      throw error
    }
  }
}

export const defaultScholarlyTransport = createScholarlyTransport()
